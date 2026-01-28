import { FileNode } from "@/utils/types"
import fsPromises from "fs/promises"
import path from "path"
import { SUPPORTED_EXTENSIONS } from "../utils/constants"
import { PENSINE_DIRECTORY } from "../utils/constants"

// Exclude hidden files and git directories
const EXCLUDED_ITEMS = [".", ".git", "sources"]

export async function getTreeFrom(dirPath: string): Promise<FileNode[]> {
  const dirEntries = await fsPromises.readdir(dirPath, { withFileTypes: true })

  const structure = await Promise.all(
    dirEntries.map(async (entry) => {
      if (EXCLUDED_ITEMS.some((item) => entry.name.startsWith(item)))
        return null

      const finalPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: finalPath,
          type: "directory",
          children: await getTreeFrom(finalPath),
        } as FileNode
      }

      if (
        entry.isFile() &&
        SUPPORTED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
      ) {
        const filePath = finalPath.replace(PENSINE_DIRECTORY, "")
        return {
          name: entry.name,
          path: filePath,
          type: "file",
        } as FileNode
      }

      return null
    })
  )

  return structure.filter(Boolean) as FileNode[]
}

// Cache with TTL (Time To Live)
let treeDataCache: { data: FileNode[]; timestamp: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds

/**
 * Get tree data with caching and TTL
 * In development, cache is bypassed to reflect file changes
 * In production, cache is used with 5-minute TTL
 */
export async function getTreeData(): Promise<FileNode[]> {
  const now = Date.now()
  const isDevelopment = process.env.NODE_ENV === 'development'
  
  // In development, always fetch fresh data
  if (isDevelopment) {
    return await getTreeFrom(PENSINE_DIRECTORY)
  }
  
  // In production, use cache with TTL
  if (treeDataCache && (now - treeDataCache.timestamp) < CACHE_TTL) {
    return treeDataCache.data
  }
  
  // Fetch fresh data and update cache
  const freshData = await getTreeFrom(PENSINE_DIRECTORY)
  treeDataCache = { data: freshData, timestamp: now }
  
  return freshData
}

/**
 * Clear the tree data cache
 * Useful for manual cache invalidation
 */
export function clearTreeDataCache(): void {
  treeDataCache = null
}
