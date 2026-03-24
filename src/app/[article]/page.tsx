import { getPostBySlug, getPostSlugs, isDirectory } from "@/lib/posts"
import type { Metadata } from "next"
import ArticleClient from "./article-client"
import { sanitizePath } from "@/lib/tools"
import { notFound } from "next/navigation"
import { generateTOC } from "@/hooks/generateTOC"
import { IMAGE_EXTENSIONS } from "@/utils/constants"
import { logger } from "@/lib/logger"

type Props = {
  params: Promise<{ article: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateStaticParams() {
  const paths = await getPostSlugs()
  return paths.map((path: { filePath: string }) => ({
    article: path.filePath,
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { article } = await params
  const articlePath = article

  try {
    // First check if it's a directory
    const isDir = await isDirectory(articlePath)

    if (isDir) {
      return {
        title: `${article.split("/").pop()} Directory`,
        description: `Browse the ${article.split("/").pop()} section of the Pensine knowledge base.`,
        robots: {
          index: true,
          follow: true,
        },
      }
    }

    const post = await getPostBySlug(articlePath)

    if (!post) {
      return {
        title: "Page Not Found",
        description: "The requested page could not be found.",
        robots: {
          index: false,
          follow: false,
        },
      }
    }

    const formattedPath = sanitizePath(post.path)
    const pathSegments = formattedPath.split("/").filter(Boolean)
    const canonicalUrl = `https://pensine.nebula.li/${articlePath.split("/").map(encodeURIComponent).join("/")}`

    // Generate breadcrumb keywords
    const breadcrumbKeywords = pathSegments.map((segment) => segment.toLowerCase().replace(/[-_]/g, " "))

    const description =
      post.excerpt ||
      `Learn about ${post.title} in this comprehensive guide. Part of the Pensine knowledge base covering ${pathSegments.join(", ")}.`

    return {
      title: post.title,
      description: description,
      keywords: [...breadcrumbKeywords, post.title.toLowerCase(), "pensine", "knowledge base", "learning", "education"],
      authors: [{ name: "Martin" }],
      openGraph: {
        title: `${post.title} | Pensine`,
        description: description,
        type: "article",
        url: canonicalUrl,
        publishedTime: post.date || new Date().toISOString(),
        modifiedTime: post.lastModified || new Date().toISOString(),
        section: pathSegments[0] || "General",
        tags: pathSegments,
      },
      twitter: {
        title: `${post.title} | Pensine`,
        description: description,
        card: "summary_large_image",
      },
      alternates: {
        canonical: canonicalUrl,
      },
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-video-preview": -1,
          "max-image-preview": "large",
          "max-snippet": -1,
        },
      },
    }
  } catch (error) {
    logger.error("Error generating metadata", { error: error instanceof Error ? error.message : String(error) })
    return {
      title: "Error Loading Page",
      description: "An error occurred while loading this page.",
      robots: {
        index: false,
        follow: false,
      },
    }
  }
}


export default async function Article({
  params,
}: {
  params: Promise<{ article: string }>;
}) {
  const { article: articlePath } = await params

  try {
    // First check if it's a directory
    const isDir = await isDirectory(articlePath)

    if (isDir) {
      return <ArticleClient params={{ article: articlePath.split("/") }} isDirectory={true} />
    }

    // If not a directory, try to get it as a post
    const post = await getPostBySlug(articlePath)

    if (!post) {
      return notFound()
    }

    // Generate TOC data on the server side
    let tocData = null
    if (post.type && !["pdf", "PDF"].includes(post.type) && !IMAGE_EXTENSIONS.includes(post.type)) {
      tocData = await generateTOC(post.body)
    }

    return <ArticleClient params={{ article: articlePath.split("/") }} post={post} isDirectory={false} tocData={tocData} />
  } catch (error) {
    logger.error("Error in Article component", { error: error instanceof Error ? error.message : String(error) })
    return <div className="text-red-500 mx-auto my-auto">Article not found</div>

  }
}