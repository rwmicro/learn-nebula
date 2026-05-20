// Pre-generates three static JSON files served by Cloudflare Pages:
//   public/pensine-index.json     — the file/directory tree of public/articles/pensine
//   public/pensine-search.json    — full-text search corpus (path, title, stripped body)
//   public/pensine-backlinks.json — inverted index of internal markdown links
//
// Runs before `next build`. The site is a fully static export — no runtime
// server — so directory listing, search, and backlinks are served by these
// prebuilt JSONs (fetched client-side from src/lib/pensine-index.ts).

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

// Scans the corpus for inline links and builds an inverted index:
//   { "/Target.md": ["/SourceA.md", "/SourceB.md"], ... }
// Recognises both regular markdown `[text](path)` links and Obsidian-style
// `[[FileName]]` / `[[FileName|Display]]` wiki-links (which reference files by
// basename, regardless of where they live in the tree).
function buildBacklinks(corpus) {
  const pathSet = new Set(corpus.map((e) => e.path))
  const stripExt = (p) => p.replace(/\.[^/.]+$/, "")
  const stripped = new Map() // stripped path → canonical
  for (const p of pathSet) stripped.set(stripExt(p), p)

  // basename (no ext, lowercased) → canonical path. Multiple files can share
  // the same basename; we keep them all so we can link the closest match by
  // directory similarity if needed (here we just pick the first).
  const basenameMap = new Map()
  for (const p of pathSet) {
    const base = stripExt(p.split("/").pop() ?? "").toLowerCase()
    if (!basenameMap.has(base)) basenameMap.set(base, p)
  }

  const backlinks = {}
  const MD_LINK_RE = /\[(?:[^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  const WIKI_LINK_RE = /\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g

  const addBacklink = (target, source) => {
    if (!target || target === source) return
    const list = (backlinks[target] ??= [])
    if (!list.includes(source)) list.push(source)
  }

  for (const entry of corpus) {
    const sourcePath = entry.path
    const sourceDir = sourcePath.slice(0, sourcePath.lastIndexOf("/")) || "/"

    // Regular markdown links
    for (const match of entry.body.matchAll(MD_LINK_RE)) {
      let href = match[1]
      if (!href || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("#") || href.startsWith("mailto:")) continue
      href = href.split(/[?#]/)[0]
      try { href = decodeURIComponent(href) } catch { /* keep as-is */ }
      if (!href) continue

      let resolved
      if (href.startsWith("/")) {
        resolved = href
      } else {
        const parts = sourceDir.split("/").filter(Boolean)
        for (const seg of href.split("/")) {
          if (seg === "" || seg === ".") continue
          if (seg === "..") parts.pop()
          else parts.push(seg)
        }
        resolved = "/" + parts.join("/")
      }
      const canonical = pathSet.has(resolved) ? resolved : stripped.get(resolved)
      if (canonical) addBacklink(canonical, sourcePath)
    }

    // Obsidian wiki-links
    for (const match of entry.body.matchAll(WIKI_LINK_RE)) {
      const target = match[1].trim().toLowerCase()
      if (!target) continue
      const canonical = basenameMap.get(target)
      if (canonical) addBacklink(canonical, sourcePath)
    }
  }
  return backlinks
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

  const backlinks = buildBacklinks(corpus)
  await writeFile(
    join(PUBLIC_DIR, "pensine-backlinks.json"),
    JSON.stringify(backlinks),
    "utf8",
  )

  const treeSize = (JSON.stringify(tree).length / 1024).toFixed(1)
  const corpusSize = (JSON.stringify(corpus).length / 1024).toFixed(1)
  const backlinksSize = (JSON.stringify(backlinks).length / 1024).toFixed(1)
  const backlinkPairs = Object.values(backlinks).reduce((s, arr) => s + arr.length, 0)
  console.log(`[build-pensine-index] tree: ${treeSize} KB, search corpus: ${corpus.length} entries (${corpusSize} KB)`)
  console.log(`[build-pensine-index] backlinks: ${Object.keys(backlinks).length} targets, ${backlinkPairs} edges (${backlinksSize} KB)`)

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
