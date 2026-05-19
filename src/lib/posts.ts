import path from "path"
import fs from "fs"
import { Post, FileNode } from "@/utils/types"
import { getTreeFrom } from "./treeData"
import { SUPPORTED_EXTENSIONS, TEXT_EXTENSIONS, PENSINE_DIRECTORY } from "@/utils/constants"

function parseFrontmatter(content: string): { metadata: Record<string, string | string[]> } {
  if (!content.startsWith("---")) return { metadata: {} }
  const endIndex = content.indexOf("\n---", 3)
  if (endIndex === -1) return { metadata: {} }

  const yamlBlock = content.slice(3, endIndex).trim()
  const metadata: Record<string, string | string[]> = {}
  const lines = yamlBlock.split("\n")

  let currentKey: string | null = null
  let currentArray: string[] | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("- ")) {
      if (currentKey && currentArray) currentArray.push(trimmed.slice(2).trim())
    } else {
      if (currentKey && currentArray && currentArray.length > 0) {
        metadata[currentKey] = currentArray
        currentArray = null
      }
      const colonIndex = line.indexOf(":")
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim()
        const value = line.slice(colonIndex + 1).trim()
        if (value === "") {
          currentKey = key
          currentArray = []
        } else {
          currentKey = key
          metadata[key] = value
        }
      }
    }
  }
  if (currentKey && currentArray && currentArray.length > 0) {
    metadata[currentKey] = currentArray
  }

  return { metadata }
}

function computeExcerpt(body: string, metadata: Record<string, string | string[]>): string {
  const fromMeta = metadata.description ?? metadata.summary ?? metadata.excerpt
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta

  const stripped = body.startsWith("---")
    ? body.replace(/^---[\s\S]*?\n---\n?/, "")
    : body
  const text = stripped
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

function stripFrontmatter(content: string): string {
  return content.startsWith("---") ? content.replace(/^---[\s\S]*?\n---\n?/, "") : content
}

function readPost(fullPath: string, ext: string, title: string): Post {
  const isText = (TEXT_EXTENSIONS as readonly string[]).includes(ext)
  const stats = fs.statSync(fullPath)
  const rawBody = isText ? fs.readFileSync(fullPath, "utf8") : ""
  const { metadata } = parseFrontmatter(rawBody)
  // Strip frontmatter once at build time so consumers (MarkdownViewer, TOC)
  // never have to re-parse it.
  const body = isText ? stripFrontmatter(rawBody) : ""
  return {
    title,
    path: toRelativePath(fullPath),
    body,
    type: ext as Post["type"],
    lastModified: stats.mtime.toISOString(),
    date: stats.birthtime.toISOString(),
    excerpt: isText ? computeExcerpt(rawBody, metadata) : "",
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
