import { notFound } from "next/navigation"
import { getPostBySlug, getPostSlugs } from "@/lib/posts"
import { MDXRemote } from "next-mdx-remote/rsc"
import components from "@/components/Markdown"
import { sanitizePath } from "@/hooks/tools"
import remarkGfm from "remark-gfm"
import TOCWrapper from "@/components/TOCWrapper"
import type { Metadata, ResolvingMetadata } from "next"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import rehypeUnwrapImages from "rehype-unwrap-images"
import { IMAGE_EXTENSIONS } from "@/types/types"
import Image from "next/image"

type Props = {
  params: Promise<{ article: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateStaticParams() {
  const paths = await getPostSlugs()
  return paths.map((path: any) => ({
    article: path.filePath,
  }))
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const post = await getPostBySlug((await params).article)
  if (!post) {
    return {
      title: "Pensine - Garden of Knowledge",
    }
  }

  const formattedPath = sanitizePath(post.path)

  return {
    title: post!.title + " - Pensine" || "Pensine - Garden of Knowledge",
    keywords: formattedPath.split("/").filter(Boolean),
  }
}

export default async function Article({
  params,
}: {
  params: { article: string }
}) {
  const { article } = params

  try {
    const post = await getPostBySlug(article)

    if (!post) {
      return notFound()
    }

    const formattedPath = sanitizePath(post.path)

    if (post.type === "pdf") {
      return (
        <div className="w-full overflow-scroll max-h-[93vh] bg-[#F9F9F9]">
          <iframe
            src={"/articles/pensine" + post.path}
            width="100%"
            height="100%"
            aria-label={post.title}
          ></iframe>
        </div>
      )
    }

    if (IMAGE_EXTENSIONS.includes(post.type)) {
      return (
        <div className="w-full overflow-scroll max-h-[93vh] bg-[#F9F9F9] flex justify-center items-center p-4">
          <Image
            src={"/articles/pensine" + post.path}
            alt={post.title}
            width={1200}
            height={800}
            className="max-w-full max-h-[90vh] object-contain"
            priority
          />
        </div>
      )
    }

    return (
      <>
        <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] bg-[#F9F9F9]">
          <h1
            className="text-sm text-center pt-3 text-[#404040]"
            aria-label="Path"
          >
            {formattedPath}
          </h1>
          <h2 className="text-3xl text-center sm:text-left font-medium py-2" aria-label="Post title">
            {post.title}
          </h2>
          <article className="prose dark:prose-invert" aria-label={post.title}>
            <MDXRemote
              source={post.body}
              components={components}
              options={{
                mdxOptions: {
                  remarkPlugins: [remarkMath, remarkGfm],
                  rehypePlugins: [rehypeKatex, rehypeUnwrapImages],
                },
              }}
            />
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
