import path from "path"
import fs from "fs"
import { Post, FileNode } from "@/utils/types"
import { getTreeFrom } from "./treeData"
import { SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS } from "@/utils/constants"
import { PENSINE_DIRECTORY } from "@/utils/constants"

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

// Helper function to check if a path is a directory
export async function isDirectory(pathStr: string): Promise<boolean> {
  try {
    const fullPath = path.join(process.cwd(), PENSINE_DIRECTORY, decodeURIComponent(pathStr))
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
    } else if (node.type === "directory" && node.children) {
      node.children.forEach(traverse)
    }
  }
  
  structure.forEach(traverse)
  return filePaths.map((filePath: string) => ({ filePath }))
}

export async function getPostBySlug(encodedSlug: string): Promise<Post | null | undefined> {
  const slug = decodeURIComponent(encodedSlug)
  const title = slug.split("/").pop() ?? slug
  const directPath = path.join(PENSINE_DIRECTORY, slug)
  
  if (fs.existsSync(directPath)) {
    const ext = path.extname(directPath).toLowerCase().slice(1)
    if (SUPPORTED_EXTENSIONS.includes(ext)) {
      const isImage = IMAGE_EXTENSIONS.includes(ext)

      // Fix: Create proper relative path for web access
      const relativePath = directPath.replace(PENSINE_DIRECTORY, "").replace(/\\/g, "/")
      const stats = fs.statSync(directPath)
      const rawBody = isImage ? "" : fs.readFileSync(directPath, "utf8")
      const { metadata } = parseFrontmatter(rawBody)
      return {
        title,
        path: relativePath,
        body: rawBody,
        type: ext,
        lastModified: stats.mtime.toISOString(),
        date: stats.birthtime.toISOString(),
        excerpt: "", // No excerpt available at this level
        metadata,
      }
    } else {
      return null
    }
  }

  const baseSlug = slug.replace(/\.[^/.]+$/, "")
  for (const ext of SUPPORTED_EXTENSIONS) {
    const fullPath = path.join(PENSINE_DIRECTORY, `${baseSlug}.${ext}`)
    if (fs.existsSync(fullPath)) {
      const isImage = IMAGE_EXTENSIONS.includes(ext)

      // Fix: Create proper relative path for web access
      const relativePath = fullPath.replace(PENSINE_DIRECTORY, "").replace(/\\/g, "/")
      const stats = fs.statSync(fullPath)
      const rawBody = isImage ? "" : fs.readFileSync(fullPath, "utf8")
      const { metadata } = parseFrontmatter(rawBody)
      return {
        title,
        path: relativePath,
        body: rawBody,
        type: ext,
        lastModified: stats.mtime.toISOString(),
        date: stats.birthtime.toISOString(),
        excerpt: "", // No excerpt available at this level
        metadata,
      }
      }
    }
    return null
  }
  