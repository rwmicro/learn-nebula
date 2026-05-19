import fs from "fs"
import path from "path"
import { getPostSlugs } from "@/lib/posts"
import { filePathToSlugSegments } from "@/lib/tools"
import { PENSINE_DIRECTORY } from "@/utils/constants"
import type { MetadataRoute } from "next"

export const dynamic = "force-static"

const baseUrl = "https://pensine.nebula.li"

function mtimeOrNow(filePath: string): Date {
  try {
    return fs.statSync(path.join(process.cwd(), PENSINE_DIRECTORY, filePath)).mtime
  } catch {
    return new Date()
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPostSlugs()

  const postEntries: MetadataRoute.Sitemap = posts
    .map(({ filePath }) => {
      const segments = filePathToSlugSegments(filePath)
      if (segments.length === 0) return null
      return {
        url: `${baseUrl}/${segments.map(encodeURIComponent).join("/")}`,
        lastModified: mtimeOrNow(filePath),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...postEntries,
  ]
}
