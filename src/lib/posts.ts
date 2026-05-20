import path from "path"
import fs from "fs"
import matter from "gray-matter"
import { Post, FileNode } from "@/utils/types"
import { getTreeFrom } from "./treeData"
import { SUPPORTED_EXTENSIONS, TEXT_EXTENSIONS, PENSINE_DIRECTORY } from "@/utils/constants"

type FrontmatterValue = string | string[]

// Coerce gray-matter's loose `unknown` values into the shape Post.metadata expects.
function normalizeFrontmatter(data: Record<string, unknown>): Record<string, FrontmatterValue> {
  const out: Record<string, FrontmatterValue> = {}
  for (const [key, raw] of Object.entries(data)) {
    if (Array.isArray(raw)) {
      out[key] = raw.map((v) => String(v))
    } else if (raw != null && typeof raw !== "object") {
      out[key] = String(raw)
    }
  }
  return out
}

function computeExcerpt(body: string, metadata: Record<string, FrontmatterValue>): string {
  const fromMeta = metadata.description ?? metadata.summary ?? metadata.excerpt
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta

  const text = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (text.length <= 160) return text
  return text.slice(0, 160).replace(/\s+\S*$/, "") + "…"
}

function pensineRoot(): string {
  return path.join(process.cwd(), PENSINE_DIRECTORY)
}

function toRelativePath(fullPath: string): string {
  const rel = path.relative(pensineRoot(), fullPath).replace(/\\/g, "/")
  return "/" + rel
}

// One-shot scan of the pensine corpus building a basename → canonical path
// lookup, used to resolve Obsidian-style wiki-links. Cached after first call
// for the duration of the build.
let basenameMap: Map<string, string> | null = null
function getBasenameMap(): Map<string, string> {
  if (basenameMap) return basenameMap
  const map = new Map<string, string>()
  const EXCLUDED = new Set([".git", "sources"])
  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || EXCLUDED.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).slice(1).toLowerCase()
        if (!(TEXT_EXTENSIONS as readonly string[]).includes(ext)) continue
        const base = path.basename(entry.name, path.extname(entry.name)).toLowerCase()
        if (!map.has(base)) {
          const rel = "/" + path.relative(pensineRoot(), full).replace(/\\/g, "/")
          map.set(base, rel)
        }
      }
    }
  }
  walk(pensineRoot())
  basenameMap = map
  return map
}

// Convert Obsidian-style [[Target]], [[Target|Display]], [[Target#anchor]],
// [[Target#anchor|Display]] into standard markdown links so react-markdown can
// render them. Unresolved targets are left as literal text so the user knows
// the link is broken.
const WIKI_LINK_RE = /\[\[([^\]|#]+?)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g

function resolveWikiLinks(body: string): string {
  return body.replace(WIKI_LINK_RE, (full, target: string, anchor: string | undefined, display: string | undefined) => {
    const targetTrim = target.trim()
    const resolved = getBasenameMap().get(targetTrim.toLowerCase())
    if (!resolved) return full

    // Strip extension and URL-encode each path segment so spaces / accents are
    // valid inside markdown's (url) destination syntax.
    const stripped = resolved.replace(/\.[^/.]+$/, "")
    const segments = stripped.split("/").filter(Boolean).map(encodeURIComponent)
    const anchorSuffix = anchor ? `#${encodeURIComponent(anchor.trim().toLowerCase().replace(/\s+/g, "-"))}` : ""
    const url = `/${segments.join("/")}${anchorSuffix}`
    const label = (display ?? targetTrim).trim()
    return `[${label}](${url})`
  })
}

function readPost(fullPath: string, ext: string, title: string): Post {
  const isText = (TEXT_EXTENSIONS as readonly string[]).includes(ext)
  const stats = fs.statSync(fullPath)

  let body = ""
  let metadata: Record<string, FrontmatterValue> = {}
  if (isText) {
    const raw = fs.readFileSync(fullPath, "utf8")
    const parsed = matter(raw)
    body = resolveWikiLinks(parsed.content)
    metadata = normalizeFrontmatter(parsed.data)
  }

  return {
    title,
    path: toRelativePath(fullPath),
    body,
    type: ext as Post["type"],
    lastModified: stats.mtime.toISOString(),
    date: stats.birthtime.toISOString(),
    excerpt: isText ? computeExcerpt(body, metadata) : "",
    metadata,
  }
}

// Helper function to check if a path is a directory
export async function isDirectory(pathStr: string): Promise<boolean> {
  try {
    const fullPath = path.join(pensineRoot(), decodeURIComponent(pathStr))
    const stats = await fs.promises.stat(fullPath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

// Function to get all the slugs of the posts - used in getStaticPaths
export async function getPostSlugs() {
  const structure = await getTreeFrom(PENSINE_DIRECTORY)
  const filePaths: string[] = []

  function traverse(node: FileNode) {
    if (node.type === "file") {
      filePaths.push(node.path)
    } else if (node.type === "directory") {
      filePaths.push(node.path)
      node.children?.forEach(traverse)
    }
  }

  structure.forEach(traverse)
  return filePaths.map((filePath: string) => ({ filePath }))
}

export async function getPostBySlug(encodedSlug: string): Promise<Post | null> {
  const slug = decodeURIComponent(encodedSlug)
  const title = slug.split("/").pop() ?? slug
  const root = pensineRoot()

  // Slug already has an extension and resolves to a real file
  const directPath = path.join(root, slug)
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    const ext = path.extname(directPath).slice(1).toLowerCase()
    if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) return null
    return readPost(directPath, ext, title)
  }

  // Slug has no extension: scan the parent directory and match by basename,
  // case-insensitively on the extension (so .JPG, .PDF etc. all resolve).
  // The slug is already extension-free (stripped by filePathToSlugSegments in
  // route generation), so we use it as-is — stripping a fake "extension" here
  // would break filenames containing dots like "Node.js et Express.md".
  const parentDir = path.join(root, path.dirname(slug))
  const baseName = path.basename(slug)

  let entries: string[]
  try {
    entries = fs.readdirSync(parentDir)
  } catch {
    return null
  }

  const match = entries.find((name) => {
    const ext = path.extname(name).slice(1).toLowerCase()
    if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) return false
    return path.basename(name, path.extname(name)) === baseName
  })
  if (!match) return null

  const fullPath = path.join(parentDir, match)
  const ext = path.extname(match).slice(1).toLowerCase()
  return readPost(fullPath, ext, title)
}
