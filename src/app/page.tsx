import { notFound } from "next/navigation"
import { getPostBySlug } from "@/lib/posts"
import { sanitizePath } from "@/lib/tools"
import type { Metadata } from "next"
import HomeContentClient from "@/components/HomeContentClient"

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
  const post = await getPostBySlug("Garden of Knowledge")
  if (!post) notFound()

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
      author: { "@type": "Person", name: "Martin" },
      publisher: { "@type": "Organization", name: "Nebula" },
      dateModified: post.lastModified || new Date().toISOString(),
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
      <HomeContentClient post={post} formattedPath={formattedPath} />
    </>
  )
}
