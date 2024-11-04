import { notFound } from "next/navigation"
import { getPostBySlug } from "@/lib/posts"
import { MDXRemote } from "next-mdx-remote/rsc"
import components from "@/components/Markdown"
import { sanitizePath } from "@/hooks/tools"
import TOCWrapper from "@/components/TOCWrapper"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pensine - Garden of Knowledge",
  keywords: ["pensine", "garden of knowledge", "knowledge", "learning"],
}

export default async function Index() {
  try {
    const post = await getPostBySlug("Garden of Knowledge")

    if (!post) {
      return notFound()
    }

    const formattedPath = sanitizePath(post.path)

    return (
      <>
        <div className="w-full p-4 pt-0 px-7 xl:px-20 pb-5 overflow-scroll max-h-[93vh] bg-[#F9F9F9]">
          <h1
            className="text-sm text-center pt-3 text-[#404040]"
            aria-label="Path"
          >
            {formattedPath}
          </h1>
          <h2
            className="text-3xl font-medium pt-2 pb-4"
            aria-label={post.title}
          >
            {post.title}
          </h2>
          <article
            className="prose dark:prose-invert"
            aria-label="Post content"
          >
            <MDXRemote source={post.body} components={components} />
          </article>
        </div>
        <TOCWrapper file={post.body} />
      </>
    )
  } catch (error) {
    console.error("Error fetching post:", error)
    return (
      <p className="text-center text-red-500 m-2">
        Failed to load post. Please try again later.
      </p>
    )
  }
}
