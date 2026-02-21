#!/usr/bin/env node
/**
 * Build the semantic search index for the assistant.
 * Reads all .md/.mdx files, chunks them, embeds each chunk with
 * all-MiniLM-L6-v2, and writes public/search-index.json.
 *
 * Run: node scripts/build-search-index.mjs
 */

import { readdir, readFile, writeFile } from "fs/promises"
import { join, extname } from "path"
import { pipeline, env } from "@huggingface/transformers"

// ─── Config ──────────────────────────────────────────────────────────────────

const PENSINE_DIR = "public/articles/pensine"
const OUTPUT_FILE = "public/search-index.json"
const MODEL = "Xenova/all-MiniLM-L6-v2"
const CHUNK_MAX = 700 // characters
const CHUNK_MIN = 60  // discard very short chunks
const EXCLUDED = [".", ".git", "sources"]

env.cacheDir = ".cache/transformers"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripFrontmatter(content) {
  if (!content.startsWith("---")) return content
  const end = content.indexOf("\n---", 3)
  if (end === -1) return content
  return content.slice(end + 4).trimStart()
}

function getFrontmatterTitle(content) {
  if (!content.startsWith("---")) return null
  const end = content.indexOf("\n---", 3)
  if (end === -1) return null
  const yaml = content.slice(3, end)
  const match = yaml.match(/^title:\s*(.+)$/m)
  return match ? match[1].trim() : null
}

/**
 * Split document into semantically coherent chunks.
 * Splits on h1/h2/h3 headings; long sections are further split by paragraph.
 */
function chunkDocument(rawContent, filePath, fallbackTitle) {
  const content = stripFrontmatter(rawContent)
  const title = getFrontmatterTitle(rawContent) ?? fallbackTitle

  // Split on headings (keep the heading line with its section)
  const sections = content.split(/(?=\n#{1,3} )/).map((s) => s.trim()).filter(Boolean)

  const chunks = []

  for (const section of sections) {
    if (section.length < CHUNK_MIN) continue

    if (section.length <= CHUNK_MAX) {
      chunks.push({ path: filePath, title, content: section })
      continue
    }

    // Section too long — split by paragraph
    const paragraphs = section.split(/\n\n+/)
    let current = ""

    for (const para of paragraphs) {
      if ((current + "\n\n" + para).trim().length > CHUNK_MAX && current) {
        if (current.length >= CHUNK_MIN) {
          chunks.push({ path: filePath, title, content: current.trim() })
        }
        current = para
      } else {
        current = current ? current + "\n\n" + para : para
      }
    }

    if (current.trim().length >= CHUNK_MIN) {
      chunks.push({ path: filePath, title, content: current.trim() })
    }
  }

  return chunks
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (EXCLUDED.some((ex) => entry.name.startsWith(ex))) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
    } else if (entry.isFile() && [".md", ".mdx"].includes(extname(entry.name))) {
      files.push(fullPath)
    }
  }

  return files
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📦 Loading embedding model:", MODEL)
  const extractor = await pipeline("feature-extraction", MODEL, { dtype: "fp32" })

  console.log("🔍 Walking article directory…")
  const files = await walk(PENSINE_DIR)
  console.log(`   Found ${files.length} files`)

  const allChunks = []

  for (const filePath of files) {
    const raw = await readFile(filePath, "utf8")
    const fallbackTitle = filePath.split("/").pop().replace(/\.(md|mdx)$/i, "")
    const relativePath = "/" + filePath.replace(PENSINE_DIR + "/", "")
    const chunks = chunkDocument(raw, relativePath, fallbackTitle)
    allChunks.push(...chunks)
  }

  console.log(`✂️  Generated ${allChunks.length} chunks — embedding…`)

  const result = []
  const total = allChunks.length

  for (let i = 0; i < total; i++) {
    if (i % 20 === 0) process.stdout.write(`\r   ${i}/${total}`)
    const chunk = allChunks[i]
    const output = await extractor(chunk.content, { pooling: "mean", normalize: true })
    result.push({ ...chunk, embedding: Array.from(output.data) })
  }

  process.stdout.write(`\r   ${total}/${total}\n`)

  const index = {
    model: MODEL,
    created: new Date().toISOString(),
    dims: result[0]?.embedding.length ?? 384,
    chunks: result,
  }

  await writeFile(OUTPUT_FILE, JSON.stringify(index))
  const kb = Math.round(JSON.stringify(index).length / 1024)
  console.log(`✅ Done! ${result.length} chunks → ${OUTPUT_FILE} (${kb} KB)`)
}

main().catch((err) => {
  console.error("❌ Error:", err)
  process.exit(1)
})
