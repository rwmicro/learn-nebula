import { FileNode } from "@/types/types"
import fsPromises from "fs/promises"
import path from "path"
import { POSTDIRECTORY } from "./posts"
import { SUPPORTED_EXTENSIONS } from "../types/types"

const EXCLUDED_ITEMS = [".", "sources"]

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
        const filePath = finalPath.replace(POSTDIRECTORY, "")
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

let treeData: FileNode[] | null = null

export async function getTreeData(): Promise<FileNode[]> {
  if (treeData === null) {
    treeData = await getTreeFrom(POSTDIRECTORY)
  }
  return treeData
}
