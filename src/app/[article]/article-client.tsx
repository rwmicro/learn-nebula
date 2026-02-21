"use client"
import { notFound } from "next/navigation"
import Content from "@/components/content"
import TOC from "@/components/toc"
import DirectoryView from "@/components/directory-view"
import { sanitizePath } from "@/lib/tools"
import { Post } from "@/utils/types"
import { useEffect, useState } from "react"
import { logger } from "@/lib/logger"

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
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return null
  }

  const articlePath = params.article.join("/")

  try {
    if (isDirectory) {
      // Handle directory view with structured data
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

    // Handle post view
    if (!post) {
      return notFound()
    }

    const formattedPath = sanitizePath(post.path)
    const pathSegments = formattedPath.split("/").filter(Boolean)

    // Generate structured data for articles
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.excerpt || `Learn about ${post.title}`,
      author: {
        "@type": "Person",
        name: "Martin",
      },
      publisher: {
        "@type": "Organization",
        name: "Nebula",
      },
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
  } catch (error) {
    logger.error("Error in ArticleClient", { error: error instanceof Error ? error.message : String(error) })
    return (
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Article</h1>
        <p className="text-red-500">Failed to load article. Please try again later.</p>
        <button
          onClick={() => window.history.back()}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Go Back
        </button>
      </div>
    )
  }
}
