import path from "path"
import fs from "fs"
import { Post, FileNode } from "@/utils/types"
import { getTreeFrom } from "./treeData"
import { SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS } from "@/utils/constants"
import { PENSINE_DIRECTORY } from "@/utils/constants"

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
      return {
        title,
        path: relativePath,
        body: isImage ? "" : fs.readFileSync(directPath, "utf8"),
        type: ext,
        lastModified: stats.mtime.toISOString(),
        date: stats.birthtime.toISOString(),
        excerpt: "", // No excerpt available at this level
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
      return {
        title,
        path: relativePath,
        body: isImage ? "" : fs.readFileSync(fullPath, "utf8"),
        type: ext,
        lastModified: stats.mtime.toISOString(),
        date: stats.birthtime.toISOString(),
        excerpt: "", // No excerpt available at this level
      }
      }
    }
    return null
  }
  