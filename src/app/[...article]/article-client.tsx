"use client"
import dynamic from "next/dynamic"
import { sanitizePath } from "@/lib/tools"
import { Post } from "@/utils/types"
import Content from "@/components/content"

// TOC and DirectoryView are mutually exclusive per route, so code-split them
// to keep the per-page JS payload small. Content is always rendered for
// articles, so we import it directly.
const TOC = dynamic(() => import("@/components/toc"))
const DirectoryView = dynamic(() => import("@/components/directory-view"))

interface Heading {
  text: string
  level: number
}

interface ArticleClientProps {
  params: { article: string[] }
  isDirectory: boolean
  post?: Post
  tocData?: Heading[] | null
}

export default function ArticleClient({
  params,
  isDirectory,
  post,
  tocData,
}: ArticleClientProps) {
  const articlePath = params.article.join("/")

  if (isDirectory) {
    const dirUrl = `https://pensine.nebula.li/${params.article.map(encodeURIComponent).join("/")}`
    const dirName = params.article[params.article.length - 1]
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${dirName} Directory`,
      description: `Browse the ${dirName} section of the Pensine knowledge base.`,
      url: dirUrl,
      inLanguage: "fr",
      isPartOf: {
        "@type": "WebSite",
        name: "Pensine - Garden of Knowledge",
        url: "https://pensine.nebula.li",
      },
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://pensine.nebula.li",
          },
          ...params.article.map((segment, index) => ({
            "@type": "ListItem",
            position: index + 2,
            name: segment,
            item: `https://pensine.nebula.li/${params.article.slice(0, index + 1).map(encodeURIComponent).join("/")}`,
          })),
        ],
      },
    }

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <DirectoryView directoryPath={articlePath} />
      </>
    )
  }

  // page.tsx already calls notFound() when post is missing; this is defensive only.
  if (!post) return null

  const formattedPath = sanitizePath(post.path)
  const pathSegments = formattedPath.split("/").filter(Boolean)
  const articleUrl = `https://pensine.nebula.li/${params.article.map(encodeURIComponent).join("/")}`

  // Pull tags / domain from frontmatter for richer schema.org metadata.
  const frontTags = (() => {
    const raw = post.metadata?.["tags"]
    if (!raw) return [] as string[]
    if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean)
    const s = String(raw).trim()
    const inner = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s
    return inner.split(",").map((t) => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
  })()
  const keywords = [...frontTags, ...pathSegments.map((s) => s.replace(/[-_]/g, " "))]
  // Rough word count from the markdown body — used as a quality signal by
  // search engines for long-form content (`wordCount` schema.org property).
  const wordCount = post.body
    ? post.body
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/[#>*`_~\[\]()!-]/g, " ")
        .split(/\s+/)
        .filter(Boolean).length
    : undefined

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt || `Learn about ${post.title}`,
    author: { "@type": "Person", name: "Martin" },
    publisher: {
      "@type": "Organization",
      name: "Nebula",
      logo: {
        "@type": "ImageObject",
        url: "https://pensine.nebula.li/android-chrome-512x512.png",
        width: 512,
        height: 512,
      },
    },
    image: "https://pensine.nebula.li/opengraph-image.png",
    datePublished: post.date || new Date().toISOString(),
    dateModified: post.lastModified || new Date().toISOString(),
    inLanguage: "fr",
    url: articleUrl,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
    ...(keywords.length > 0 && { keywords: keywords.join(", ") }),
    ...(wordCount && wordCount > 0 && { wordCount }),
    ...(pathSegments.length > 0 && { articleSection: pathSegments[0] }),
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://pensine.nebula.li",
        },
        ...pathSegments.map((segment, index) => ({
          "@type": "ListItem",
          position: index + 2,
          name: segment,
          item: `https://pensine.nebula.li/${pathSegments.slice(0, index + 1).map(encodeURIComponent).join("/")}`,
        })),
      ],
    },
  }

  // The "Garden of Knowledge" article (homepage article reused as a route) skips
  // the TOC column. We match by path, not title — the file can be renamed via
  // frontmatter but the path is the canonical identifier.
  if (post.path === "/Garden of Knowledge.md") {
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Content post={post} formattedPath={formattedPath} />
      </>
    )
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="flex flex-row h-full w-full overflow-hidden">
        <div className="flex-1 h-full overflow-hidden">
          <Content post={post} formattedPath={formattedPath} />
        </div>
        {tocData && tocData.length > 0 && !post.path.toLowerCase().endsWith('.apkg') && (
          <TOC toc={tocData} metadata={post.metadata} />
        )}
      </div>
    </>
  )
}
