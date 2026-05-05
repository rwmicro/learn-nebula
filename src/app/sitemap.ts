import { getPostSlugs } from "@/lib/posts"
import { filePathToSlugSegments } from "@/lib/tools"
import type { MetadataRoute } from "next"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://pensine.nebula.li"

  const posts = await getPostSlugs()

  const postEntries: MetadataRoute.Sitemap = posts
    .map((post: { filePath: string }) => filePathToSlugSegments(post.filePath))
    .filter((segments) => segments.length > 0)
    .map((segments) => ({
      url: `${baseUrl}/${segments.map(encodeURIComponent).join("/")}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))

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
