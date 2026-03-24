"use client"
import type { Post } from "@/utils/types"
import Breadcrumb from "../breadcrumb"

interface PDFViewerProps {
  post: Post
  formattedPath: string
}

export default function PDFViewer({ post, formattedPath }: PDFViewerProps) {
  return (
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-auto h-full bg-[var(--c-bg)]">
      <Breadcrumb formattedPath={formattedPath} />
      <h2 className="text-3xl text-center sm:text-left font-medium py-2 text-[var(--c-text-1)]" aria-label={post.title}>
        {post.title}
      </h2>
      <div className="w-full overflow-scroll max-h-[90vh] bg-[var(--c-surface)] rounded-lg">
        <iframe
          src={`/articles/pensine${post.path}`}
          width="100%"
          height="100%"
          aria-label={post.title}
          className="min-h-[90vh] border-0 rounded-lg"
          title={`PDF: ${post.title}`}
        />
      </div>
    </div>
  )
}
