import type { FileNode } from "@/utils/types"
import fsPromises from "fs/promises"
import path from "path"
import { SUPPORTED_EXTENSIONS } from "../utils/constants"
import { PENSINE_DIRECTORY } from "../utils/constants"

const EXCLUDED_ITEMS = [".", ".git", "sources"]

// Recursive filesystem walk. Kept as a fallback when the prebuilt index isn't
// available (e.g. dev server startup before `npm run prebuild`).
export async function getTreeFrom(dirPath: string): Promise<FileNode[]> {
  const dirEntries = await fsPromises.readdir(dirPath, { withFileTypes: true })

  const structure = await Promise.all(
    dirEntries.map(async (entry) => {
      if (EXCLUDED_ITEMS.some((item) => entry.name.startsWith(item))) return null
      const finalPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: finalPath,
          type: "directory",
          children: await getTreeFrom(finalPath),
        } as FileNode
      }

      if (entry.isFile() && SUPPORTED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        return {
          name: entry.name,
          path: finalPath.replace(PENSINE_DIRECTORY, ""),
          type: "file",
        } as FileNode
      }

      return null
    }),
  )

  return structure.filter(Boolean) as FileNode[]
}

let cached: FileNode[] | null = null

// Returns the file tree. At build time, reads the prebuilt index produced by
// scripts/build-pensine-index.mjs. Falls back to a live filesystem walk only
// during local dev when the index hasn't been generated yet.
export async function getTreeData(): Promise<FileNode[]> {
  if (cached) return cached
  const indexPath = path.join(process.cwd(), "public", "pensine-index.json")
  try {
    const raw = await fsPromises.readFile(indexPath, "utf8")
    cached = JSON.parse(raw) as FileNode[]
    return cached
  } catch {
    cached = await getTreeFrom(PENSINE_DIRECTORY)
    return cached
  }
}

export function clearTreeDataCache(): void {
  cached = null
}
