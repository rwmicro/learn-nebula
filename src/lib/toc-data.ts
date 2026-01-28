import fs from "fs"
import path from "path"

const ARTICLES_PATH = path.join(process.cwd(), "public/articles/pensine")

interface RecentFile {
  title: string
  path: string
  modifiedDate: Date
}

/**
 * Get recently updated markdown files
 */
export async function getRecentlyUpdated(limit: number = 5): Promise<RecentFile[]> {
  try {
    if (!fs.existsSync(ARTICLES_PATH)) {
      return []
    }

    const files: RecentFile[] = []

    function traverseDirectory(dir: string, basePath: string = ""): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const relativePath = path.join(basePath, entry.name)

        if (entry.isDirectory()) {
          traverseDirectory(fullPath, relativePath)
        } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
          const stats = fs.statSync(fullPath)
          const title = entry.name.replace(/\.(md|mdx)$/i, "")

          files.push({
            title,
            path: "/" + relativePath.replace(/\\/g, "/"),
            modifiedDate: stats.mtime,
          })
        }
      }
    }

    traverseDirectory(ARTICLES_PATH)

    // Sort by modification date (most recent first)
    files.sort((a, b) => b.modifiedDate.getTime() - a.modifiedDate.getTime())

    return files.slice(0, limit)
  } catch (error) {
    console.error("Error getting recently updated files:", error)
    return []
  }
}

/**
 * Extract tags from markdown content
 */
function extractTags(content: string): string[] {
  const tags: string[] = []

  // Extract from frontmatter (if exists)
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    const tagsMatch = frontmatter.match(/tags:\s*\[(.*?)\]/i)
    if (tagsMatch) {
      const tagsList = tagsMatch[1].split(",").map((t) => t.trim().replace(/['"]/g, ""))
      tags.push(...tagsList)
    }
  }

  // Extract hashtags from content
  const hashtagMatches = content.match(/#[\w-]+/g)
  if (hashtagMatches) {
    tags.push(...hashtagMatches.map((tag) => tag.substring(1)))
  }

  return tags.filter((tag) => tag.length > 0)
}

/**
 * Get trending tags from all markdown files
 */
export async function getTrendingTags(limit: number = 8): Promise<string[]> {
  try {
    if (!fs.existsSync(ARTICLES_PATH)) {
      return []
    }

    const tagCounts = new Map<string, number>()

    function traverseDirectory(dir: string): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          traverseDirectory(fullPath)
        } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
          try {
            const content = fs.readFileSync(fullPath, "utf-8")
            const tags = extractTags(content)

            for (const tag of tags) {
              const normalized = tag.toLowerCase()
              tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1)
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    }

    traverseDirectory(ARTICLES_PATH)

    // Convert to array and sort by count
    const sortedTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, limit)

    return sortedTags
  } catch {
    return []
  }
}
