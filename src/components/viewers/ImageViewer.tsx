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
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-auto h-full bg-[var(--c-bg)]">
      <Breadcrumb formattedPath={formattedPath} />
      <h2 className="text-3xl md:text-center sm:text-left font-medium py-2 text-[var(--c-text-1)]" aria-label={cleanTitle}>
        {cleanTitle}
      </h2>
      <div className="flex justify-center items-center">
        {/* `next/image` runs unoptimized in static export and forces hardcoded
            width/height which causes whitespace for portrait images. Use a
            plain <img> with intrinsic sizing so the asset displays at its
            natural aspect ratio capped at 75vh. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getAssetUrl(post.path)}
          alt={post.title}
          className="max-w-full max-h-[75vh] h-auto w-auto object-contain"
        />
      </div>
    </div>
  )
}
