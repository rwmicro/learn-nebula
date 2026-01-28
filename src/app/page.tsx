import { notFound } from "next/navigation"
import { getPostBySlug } from "@/lib/posts"
import { sanitizePath } from "@/lib/tools"
import type { Metadata } from "next"
import Content from "@/components/content"
import { logger } from "@/lib/logger"

export const metadata: Metadata = {
  title: "Pensine - Garden of knowledge",
  description:
    "Welcome to Pensine - Your Garden of Knowledge. Explore a comprehensive collection of learning materials, notes, and documentation across various subjects.",
  keywords: ["pensine", "garden of knowledge", "knowledge base", "learning", "education", "home"],
  openGraph: {
    title: "Pensine - Garden of Knowledge",
    description:
      "Welcome to Pensine - Your Garden of Knowledge. Explore a comprehensive collection of learning materials, notes, and documentation across various subjects.",
    type: "website",
  },
  twitter: {
    title: "Pensine - Garden of Knowledge",
    description:
      "Welcome to Pensine - Your Garden of Knowledge. Explore a comprehensive collection of learning materials, notes, and documentation across various subjects.",
  },
  alternates: {
    canonical: "https://pensine.nebula.li",
  },
}

export default async function Index() {
  try {
    const post = await getPostBySlug("Garden of Knowledge")

    if (!post) {
      return notFound()
    }

    const formattedPath = sanitizePath(post.path)

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Pensine - Garden of Knowledge",
      description:
        "Welcome to Pensine - Your Garden of Knowledge. Explore a comprehensive collection of learning materials, notes, and documentation across various subjects.",
      url: "https://pensine.nebula.li",
      mainEntity: {
        "@type": "Article",
        headline: post.title,
        author: {
          "@type": "Person",
          name: "Martin",
        },
        publisher: {
          "@type": "Organization",
          name: "Nebula",
        },
        dateModified: new Date().toISOString(),
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
        ],
      },
    }

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <Content post={post} formattedPath={formattedPath} />
      </>
    )
  } catch (error) {
    logger.error("Error fetching post", { error: error instanceof Error ? error.message : String(error) })
    return (
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Content</h1>
        <p className="text-red-500">Failed to load post. Please try again later.</p>
      </div>
    )
  }
}
