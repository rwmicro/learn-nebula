import path from "path"
import fs from "fs"
import { Post, FileNode } from "../types/types"
import { getTreeFrom } from "./treeData"
import { SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS } from "../types/types"

export const POSTDIRECTORY = "public/articles/pensine"

// Function to get all the slugs of the posts - used in getStaticPaths
export async function getPostSlugs() {
  const structure = await getTreeFrom(POSTDIRECTORY)
  const filePaths: string[] = []

  function traverse(node: FileNode) {
    if (node.type === "file") {
      filePaths.push(node.path)
    } else if (node.type === "directory" && node.children) {
      node.children.forEach(traverse)
    }
  }

  structure.forEach(traverse)
  return filePaths.map((filePath: any) => ({
    params: {
      article: encodeURIComponent(
        filePath.replace(
          new RegExp(`\\.(${SUPPORTED_EXTENSIONS.join("|")})$`),
          ""
        )
      ),
    },
  }))
}

export async function getPostBySlug(encodedSlug: string): Promise<Post | null> {
  const slug = decodeURIComponent(encodedSlug)
  const title = slug.split("/").pop() ?? slug
  
  const directPath = path.join(POSTDIRECTORY, slug)
  
  if (fs.existsSync(directPath)) {
    const ext = path.extname(directPath).toLowerCase().slice(1)
    if (SUPPORTED_EXTENSIONS.includes(ext as typeof SUPPORTED_EXTENSIONS[number])) {
      const isImage = IMAGE_EXTENSIONS.includes(ext)
      return {
        title,
        path: directPath.replace(POSTDIRECTORY, ""),
        body: isImage ? "" : fs.readFileSync(directPath, "utf8"),
        type: ext as typeof SUPPORTED_EXTENSIONS[number],
      }
    }
  }

  const baseSlug = slug.replace(/\.[^/.]+$/, "")
  
  for (const ext of SUPPORTED_EXTENSIONS) {
    const fullPath = path.join(POSTDIRECTORY, `${baseSlug}.${ext}`)
    if (fs.existsSync(fullPath)) {
      const isImage = IMAGE_EXTENSIONS.includes(ext)
      return {
        title,
        path: fullPath.replace(POSTDIRECTORY, ""),
        body: isImage ? "" : fs.readFileSync(fullPath, "utf8"),
        type: ext,
      }
    }
  }

  return null
}
