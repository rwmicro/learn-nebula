"use client"
import { getAssetUrl } from "@/lib/assets"
import type { Post } from "@/utils/types"
import Breadcrumb from "../breadcrumb"

interface PDFViewerProps {
  post: Post
  formattedPath: string
}

export default function PDFViewer({ post, formattedPath }: PDFViewerProps) {
  const assetUrl = getAssetUrl(post.path)
  return (
    <div className="w-full p-4 pt-0 px-4 sm:px-10 xl:px-20 pb-5 overflow-auto h-full bg-[var(--c-bg)]">
      <Breadcrumb formattedPath={formattedPath} />
      <div className="flex flex-wrap items-baseline justify-between gap-2 py-2">
        <h2 className="text-2xl sm:text-3xl font-medium text-[var(--c-text-1)]" aria-label={post.title}>
          {post.title}
        </h2>
        {/* Mobile fallback: many mobile browsers (Chrome Android, some Firefox
            builds) refuse to render PDFs in iframes. Offer a direct link. */}
        <a
          href={assetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--c-text-3)] hover:text-[var(--c-text-1)] underline transition-colors"
        >
          Ouvrir le PDF ↗
        </a>
      </div>
      <div className="w-full overflow-hidden bg-[var(--c-surface)] rounded-lg">
        <iframe
          src={assetUrl}
          className="w-full h-[70dvh] sm:h-[80dvh] lg:h-[85dvh] border-0 rounded-lg"
          title={`PDF: ${post.title}`}
          aria-label={post.title}
        />
      </div>
    </div>
  )
}
