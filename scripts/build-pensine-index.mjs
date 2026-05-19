// Pre-generates two static JSON files served by Cloudflare Pages:
//   public/pensine-index.json  — the file/directory tree of public/articles/pensine
//   public/pensine-search.json — full-text search corpus (path, title, stripped body)
//
// Runs before `next build`. The site is a fully static export — no runtime
// server — so directory listing and search are served by these prebuilt JSONs
// (fetched client-side from src/lib/pensine-index.ts).

import { readdir, readFile, stat, writeFile, mkdir, copyFile } from "node:fs/promises"
import { join, relative, extname } from "node:path"

const ROOT = process.cwd()
const PENSINE_DIR = join(ROOT, "public/articles/pensine")
const PUBLIC_DIR = join(ROOT, "public")
const SQL_WASM_SRC = join(ROOT, "node_modules/sql.js/dist/sql-wasm.wasm")
const SQL_WASM_DEST = join(PUBLIC_DIR, "sql-wasm.wasm")

const SUPPORTED_EXTS = new Set([
  "md", "mdx", "pdf", "apkg",
  "jpg", "jpeg", "png", "gif", "webp", "svg",
])
const SEARCHABLE_EXTS = new Set(["md", "mdx"])
const EXCLUDED = new Set([".git", "sources"])

async function walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes = []
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    if (EXCLUDED.has(entry.name)) continue

    const full = join(dir, entry.name)
    const rel = relative(PENSINE_DIR, full).replace(/\\/g, "/")

    if (entry.isDirectory()) {
      const children = await walk(full)
      nodes.push({
        name: entry.name,
        path: rel,
        type: "directory",
        children,
      })
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase().slice(1)
      if (!SUPPORTED_EXTS.has(ext)) continue
      nodes.push({
        name: entry.name,
        path: rel,
        type: "file",
      })
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return nodes
}

function stripFrontmatter(content) {
  return content.startsWith("---") ? content.replace(/^---[\s\S]*?\n---\n?/, "") : content
}

function extractTitle(content, filename) {
  const fm = content.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  if (fm) return fm[1]
  const h = content.match(/^#\s+(.+)$/m)
  if (h) return h[1]
  return filename.replace(/\.[^/.]+$/, "")
}

async function collectSearchable(dir, out) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    if (EXCLUDED.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectSearchable(full, out)
      continue
    }
    const ext = extname(entry.name).toLowerCase().slice(1)
    if (!SEARCHABLE_EXTS.has(ext)) continue
    let raw
    try {
      raw = await readFile(full, "utf8")
    } catch {
      continue
    }
    const body = stripFrontmatter(raw).replace(/\s+/g, " ").trim()
    const rel = relative(PENSINE_DIR, full).replace(/\\/g, "/")
    out.push({
      path: "/" + rel,
      title: extractTitle(raw, entry.name),
      body,
    })
  }
}

async function main() {
  try {
    await stat(PENSINE_DIR)
  } catch {
    console.log(`[build-pensine-index] ${PENSINE_DIR} not found, skipping`)
    return
  }

  await mkdir(PUBLIC_DIR, { recursive: true })

  const tree = await walk(PENSINE_DIR)
  await writeFile(
    join(PUBLIC_DIR, "pensine-index.json"),
    JSON.stringify(tree),
    "utf8",
  )

  const corpus = []
  await collectSearchable(PENSINE_DIR, corpus)
  await writeFile(
    join(PUBLIC_DIR, "pensine-search.json"),
    JSON.stringify(corpus),
    "utf8",
  )

  const treeSize = (JSON.stringify(tree).length / 1024).toFixed(1)
  const corpusSize = (JSON.stringify(corpus).length / 1024).toFixed(1)
  console.log(`[build-pensine-index] tree: ${treeSize} KB, search corpus: ${corpus.length} entries (${corpusSize} KB)`)

  try {
    await copyFile(SQL_WASM_SRC, SQL_WASM_DEST)
    const wasmStat = await stat(SQL_WASM_DEST)
    console.log(`[build-pensine-index] copied sql-wasm.wasm (${(wasmStat.size / 1024).toFixed(1)} KB) to public/`)
  } catch (err) {
    console.warn(`[build-pensine-index] could not copy sql-wasm.wasm: ${err.message}`)
  }
}

main().catch((err) => {
  console.error("[build-pensine-index] error:", err)
  process.exit(1)
})
