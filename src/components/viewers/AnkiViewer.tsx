"use client"
import type { Post } from "@/utils/types"
import Breadcrumb from "../breadcrumb"
import AnkiCardViewer from "../anki-card"

interface AnkiViewerProps {
  post: Post
  formattedPath: string
}

export default function AnkiViewer({ post, formattedPath }: AnkiViewerProps) {
  return (
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-auto h-full bg-[var(--c-bg)]">
      <Breadcrumb formattedPath={formattedPath} />
      <AnkiCardViewer filePath={post.path} />
    </div>
  )
}
