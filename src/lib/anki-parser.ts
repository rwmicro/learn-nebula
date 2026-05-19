// Client-side .apkg parser. Replaces the /api/parse-anki route, which couldn't
// run on Cloudflare Workers (no fs access for the sql.js wasm binary).
//
// Loads JSZip + sql.js dynamically so they're code-split out of the main bundle
// and only fetched when a user actually opens an Anki page.

import { getAssetUrl } from "@/lib/assets"

export interface AnkiCard {
  id: number
  deckName: string
  question: string
  answer: string
  tags: string[]
}

export interface AnkiDeck {
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

let sqlPromise: Promise<unknown> | null = null

async function getSqlJs() {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const initSqlJs = (await import("sql.js")).default
      return initSqlJs({ locateFile: () => "/sql-wasm.wasm" })
    })()
  }
  return sqlPromise
}

function findQuestionAnswerFields(fields: ModelField[]): { questionIdx: number; answerIdx: number } {
  const fieldNames = fields.map((f) => f.name.toLowerCase())
  const questionPriority = ["exercise", "question", "front", "word", "term", "expression"]
  const answerPriority = ["answer", "back", "meaning", "definition", "response", "translation"]

  let questionIdx = -1
  let answerIdx = -1

  for (const name of questionPriority) {
    const idx = fieldNames.findIndex((f) => f.includes(name))
    if (idx !== -1) {
      questionIdx = idx
      break
    }
  }

  for (const name of answerPriority) {
    const idx = fieldNames.findIndex((f) => f.includes(name))
    if (idx !== -1) {
      answerIdx = idx
      break
    }
  }

  if (questionIdx === -1) {
    questionIdx = fieldNames.findIndex(
      (f) => !f.includes("id") && f !== "num" && f !== "letter" && !f.includes("audio"),
    )
    if (questionIdx === -1) questionIdx = 0
  }

  if (answerIdx === -1) {
    for (let i = 0; i < fields.length; i++) {
      const name = fieldNames[i]
      if (i !== questionIdx && !name.includes("id") && name !== "num" && name !== "letter" && !name.includes("audio")) {
        answerIdx = i
        break
      }
    }
    if (answerIdx === -1) answerIdx = Math.min(1, fields.length - 1)
  }

  return { questionIdx, answerIdx }
}

export async function parseAnkiFile(filePath: string): Promise<AnkiDeck> {
  if (
    filePath.includes("..") ||
    filePath.includes("\\") ||
    filePath.includes("\0") ||
    filePath.includes("://") ||
    !filePath.toLowerCase().endsWith(".apkg")
  ) {
    throw new Error("Invalid path")
  }

  const response = await fetch(getAssetUrl(filePath), { cache: "force-cache" })
  if (!response.ok) {
    throw new Error(response.status === 404 ? "File not found" : "Failed to fetch asset")
  }
  const fileBuffer = await response.arrayBuffer()

  const JSZip = (await import("jszip")).default
  const zip = new JSZip()
  const zipContents = await zip.loadAsync(fileBuffer)

  let collectionFile = zipContents.file("collection.anki21") || zipContents.file("collection.anki2")
  if (!collectionFile) {
    throw new Error("Invalid Anki file format")
  }
  const dbBuffer = await collectionFile.async("uint8array")

  const SQL = (await getSqlJs()) as {
    Database: new (data: Uint8Array) => {
      exec: (sql: string) => { values: unknown[][] }[]
      close: () => void
    }
  }

  const db = new SQL.Database(dbBuffer)

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
        cards.push({
          id: cardId,
          deckName,
          question: note.fields[questionIdx] || note.fields[0] || "",
          answer: note.fields[answerIdx] || note.fields[1] || "",
          tags: note.tags,
        })
      }
    }
  }

  db.close()

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

  return { deckName, cards, totalCards: cards.length }
}
