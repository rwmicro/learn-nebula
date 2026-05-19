"use client"
import type { Post } from "@/utils/types"
import Breadcrumb from "../breadcrumb"
import AnkiCardViewer from "../anki-card"

interface AnkiViewerProps {
  post: Post
  formattedPath: string
}

export default function AnkiViewer({ post, formattedPath }: AnkiViewerProps) {
  const cleanTitle = post.title.replace(/\.apkg$/i, "")
  return (
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-auto h-full bg-[var(--c-bg)]">
      <Breadcrumb formattedPath={formattedPath} />
      <h2 className="text-3xl text-left font-medium py-2 text-[var(--c-text-1)]" aria-label={cleanTitle}>
        {cleanTitle}
      </h2>
      <AnkiCardViewer filePath={post.path} />
    </div>
  )
}
