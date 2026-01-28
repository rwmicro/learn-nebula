import { NextRequest, NextResponse } from "next/server"
import { validatePath, checkRateLimit, extractClientIp, sanitizeForLog } from "@/lib/security"
import { logger } from "@/lib/logger"
import fs from "fs/promises"
import path from "path"
import JSZip from "jszip"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Security headers for responses
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

interface AnkiCard {
  id: number
  deckName: string
  question: string
  answer: string
  tags: string[]
}

interface AnkiDeck {
  deckName: string
  cards: AnkiCard[]
  totalCards: number
}

interface ModelField {
  name: string
  ord: number
}

interface NoteModel {
  name: string
  flds: ModelField[]
}

// Cache SQL.js initialization
let sqlPromise: Promise<unknown> | null = null

async function getSqlJs() {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const wasmPath = path.join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm")
      const wasmBuffer = await fs.readFile(wasmPath)
      const wasmBinary = new Uint8Array(wasmBuffer).buffer
      const initSqlJs = (await import("sql.js")).default
      return initSqlJs({ wasmBinary })
    })()
  }
  return sqlPromise
}

// Find best question/answer fields based on field names
function findQuestionAnswerFields(fields: ModelField[]): { questionIdx: number; answerIdx: number } {
  const fieldNames = fields.map(f => f.name.toLowerCase())

  // Priority list for question fields
  const questionPriority = ['exercise', 'question', 'front', 'word', 'term', 'expression']
  // Priority list for answer fields
  const answerPriority = ['answer', 'back', 'meaning', 'definition', 'response', 'translation']

  let questionIdx = -1
  let answerIdx = -1

  // Find question field
  for (const name of questionPriority) {
    const idx = fieldNames.findIndex(f => f.includes(name))
    if (idx !== -1) {
      questionIdx = idx
      break
    }
  }

  // Find answer field
  for (const name of answerPriority) {
    const idx = fieldNames.findIndex(f => f.includes(name))
    if (idx !== -1) {
      answerIdx = idx
      break
    }
  }

  // Fallback: skip ID-like fields
  if (questionIdx === -1) {
    questionIdx = fieldNames.findIndex(f =>
      !f.includes('id') && f !== 'num' && f !== 'letter' && !f.includes('audio')
    )
    if (questionIdx === -1) questionIdx = 0
  }

  if (answerIdx === -1) {
    for (let i = 0; i < fields.length; i++) {
      const name = fieldNames[i]
      if (i !== questionIdx && !name.includes('id') && name !== 'num' && name !== 'letter' && !name.includes('audio')) {
        answerIdx = i
        break
      }
    }
    if (answerIdx === -1) answerIdx = Math.min(1, fields.length - 1)
  }

  return { questionIdx, answerIdx }
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const clientIp = extractClientIp(
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip')
  )
  if (!checkRateLimit(clientIp, 50, 60000)) {
    logger.warn('Rate limit exceeded', { ip: clientIp, endpoint: '/api/parse-anki' })
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: securityHeaders }
    )
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const filePath = searchParams.get("path")

    if (!filePath) {
      return NextResponse.json(
        { error: "Missing path parameter" },
        { status: 400, headers: securityHeaders }
      )
    }

    // Validate path length
    if (filePath.length > 500) {
      logger.warn('FilePath too long', { ip: clientIp, length: filePath.length })
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400, headers: securityHeaders }
      )
    }

    const baseDir = path.join(process.cwd(), "public/articles/pensine")
    const fullPath = validatePath(filePath, baseDir)

    if (!fullPath) {
      logger.warn("Invalid path in parse-anki request", {
        ip: clientIp,
        path: sanitizeForLog(filePath)
      })
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 403, headers: securityHeaders }
      )
    }

    try {
      await fs.access(fullPath)
    } catch {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404, headers: securityHeaders }
      )
    }

    const fileBuffer = await fs.readFile(fullPath)
    const zip = new JSZip()
    const zipContents = await zip.loadAsync(fileBuffer)

    // Prefer anki21 format (newer, contains actual data)
    let collectionFile = zipContents.file("collection.anki21")
    if (!collectionFile) {
      collectionFile = zipContents.file("collection.anki2")
    }
    if (!collectionFile) {
      return NextResponse.json(
        { error: "Invalid Anki file format" },
        { status: 400, headers: securityHeaders }
      )
    }

    const dbBuffer = await collectionFile.async("uint8array")

    const SQL = await getSqlJs() as {
      Database: new (data: Uint8Array) => {
        exec: (sql: string) => { values: unknown[][] }[]
        close: () => void
      }
    }

    const db = new SQL.Database(dbBuffer)

    // Get models and decks from col table
    const colResult = db.exec("SELECT models, decks FROM col")

    const modelsMap = new Map<number, { name: string; questionIdx: number; answerIdx: number }>()
    const decksMap = new Map<number, string>()

    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const modelsJson = JSON.parse(colResult[0].values[0][0] as string) as Record<string, NoteModel>
      for (const [modelId, model] of Object.entries(modelsJson)) {
        const { questionIdx, answerIdx } = findQuestionAnswerFields(model.flds)
        modelsMap.set(Number(modelId), { name: model.name, questionIdx, answerIdx })
      }

      const decksJson = JSON.parse(colResult[0].values[0][1] as string) as Record<string, { name: string }>
      for (const [deckId, deckData] of Object.entries(decksJson)) {
        decksMap.set(Number(deckId), deckData.name || "Default")
      }
    }

    // Parse notes
    const notesResult = db.exec("SELECT id, mid, flds, tags FROM notes")
    const notesMap = new Map<number, { modelId: number; fields: string[]; tags: string[] }>()

    if (notesResult.length > 0 && notesResult[0].values) {
      for (const row of notesResult[0].values) {
        const noteId = row[0] as number
        const modelId = row[1] as number
        const fields = (row[2] as string).split("\x1f")
        const tagsStr = row[3] as string
        const tags = tagsStr ? tagsStr.trim().split(/\s+/).filter(Boolean) : []
        notesMap.set(noteId, { modelId, fields, tags })
      }
    }

    // Get cards
    const cardsResult = db.exec("SELECT id, nid, did FROM cards")

    const cards: AnkiCard[] = []
    if (cardsResult.length > 0 && cardsResult[0].values) {
      for (const row of cardsResult[0].values) {
        const cardId = row[0] as number
        const noteId = row[1] as number
        const deckId = row[2] as number

        const note = notesMap.get(noteId)
        const deckName = decksMap.get(deckId) || "Default"

        if (note) {
          const model = modelsMap.get(note.modelId)
          const questionIdx = model?.questionIdx ?? 0
          const answerIdx = model?.answerIdx ?? 1

          // Use detected field indices directly
          const question = note.fields[questionIdx] || note.fields[0] || ""
          const answer = note.fields[answerIdx] || note.fields[1] || ""

          cards.push({
            id: cardId,
            deckName,
            question,
            answer,
            tags: note.tags,
          })
        }
      }
    }

    db.close()

    // Get main deck name
    let deckName = "Unknown Deck"
    for (const name of decksMap.values()) {
      if (name && name !== "Default" && !name.startsWith("Default::")) {
        deckName = name
        break
      }
    }
    if (deckName === "Unknown Deck" && decksMap.size > 0) {
      deckName = Array.from(decksMap.values())[0]
    }

    const result: AnkiDeck = {
      deckName,
      cards,
      totalCards: cards.length,
    }

    return NextResponse.json(result, { headers: securityHeaders })
  } catch (error) {
    // Log detailed error server-side only
    logger.error("Error parsing .apkg file", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Return generic error to client - never expose internal details
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500, headers: securityHeaders }
    )
  }
}
