"use client"
import { getAssetUrl } from "@/lib/assets"
import type { Post } from "@/utils/types"
import Breadcrumb from "../breadcrumb"

interface ImageViewerProps {
  post: Post
  formattedPath: string
}

export default function ImageViewer({ post, formattedPath }: ImageViewerProps) {
  const cleanTitle = post.title.replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, "")

  return (
    <div className="w-full pt-0 px-4 sm:px-6 md:px-10 xl:px-20 pb-5 overflow-auto h-full bg-[var(--c-bg)]">
      <Breadcrumb formattedPath={formattedPath} />
      <h2 className="text-2xl sm:text-3xl text-left md:text-center font-medium py-2 text-[var(--c-text-1)] break-words" aria-label={cleanTitle}>
        {cleanTitle}
      </h2>
      {/* Skeleton container reserves vertical space while the image loads to
          minimize CLS (Cumulative Layout Shift). The bg color also acts as a
          placeholder; the image fades in over it via the browser. */}
      <div className="flex justify-center items-center min-h-[40dvh] bg-[var(--c-surface)] rounded-lg">
        {/* `next/image` runs unoptimized in static export and forces hardcoded
            width/height which causes whitespace for portrait images. Use a
            plain <img> with intrinsic sizing so the asset displays at its
            natural aspect ratio capped at 75vh. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getAssetUrl(post.path)}
          alt={post.title}
          fetchPriority="high"
          decoding="async"
          className="max-w-full max-h-[75dvh] h-auto w-auto object-contain"
        />
      </div>
    </div>
  )
}
