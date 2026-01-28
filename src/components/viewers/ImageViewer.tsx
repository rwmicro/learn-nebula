"use client"
import type { Post } from "@/utils/types"
import Image from "next/image"
import Breadcrumb from "../breadcrumb"

interface ImageViewerProps {
  post: Post
  formattedPath: string
}

export default function ImageViewer({ post, formattedPath }: ImageViewerProps) {
  const cleanTitle = post.title.replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, "")

  return (
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-auto h-full bg-[#F9F9F9] dark:bg-[#0a0a0a]">
      <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
      <h2 className="text-3xl md:text-center sm:text-left font-medium py-2 dark:text-[#e5e5e5]" aria-label={cleanTitle}>
        {cleanTitle}
      </h2>
      <div className="flex justify-center items-center">
        <Image
          src={"/articles/pensine" + post.path}
          alt={post.title}
          width={1200}
          height={800}
          className="max-w-full max-h-[75vh] object-contain"
          priority
        />
      </div>
    </div>
  )
}
