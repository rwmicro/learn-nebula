"use client"
import dynamic from "next/dynamic"
import { sanitizePath } from "@/lib/tools"
import { Post } from "@/utils/types"

const Content = dynamic(() => import("@/components/content"))
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
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${params.article[params.article.length - 1]} Directory`,
      description: `Browse the ${params.article[params.article.length - 1]} section of the Pensine knowledge base.`,
      url: `https://pensine.nebula.li/${articlePath}`,
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
            item: `https://pensine.nebula.li/${params.article.slice(0, index + 1).join("/")}`,
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt || `Learn about ${post.title}`,
    author: { "@type": "Person", name: "Martin" },
    publisher: { "@type": "Organization", name: "Nebula" },
    datePublished: post.date || new Date().toISOString(),
    dateModified: post.lastModified || new Date().toISOString(),
    url: `https://pensine.nebula.li/${articlePath}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://pensine.nebula.li/${articlePath}`,
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
        ...pathSegments.map((segment, index) => ({
          "@type": "ListItem",
          position: index + 2,
          name: segment,
          item: `https://pensine.nebula.li/${pathSegments.slice(0, index + 1).join("/")}`,
        })),
      ],
    },
  }

  if (post.title === "Garden of Knowledge") {
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
