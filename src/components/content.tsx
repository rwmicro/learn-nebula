"use client"
import type { Post } from "@/utils/types"
import { CODE_EXTENSIONS, IMAGE_EXTENSIONS } from "@/utils/constants"
import { PDFViewer, ImageViewer, AnkiViewer, MarkdownViewer } from "./viewers"
import Breadcrumb from "./breadcrumb"

interface ContentProps {
  post: Post
  formattedPath: string
}

/**
 * Determines the file type from the path
 */
function getFileType(path: string): string {
  return path.split(".").pop()?.toLowerCase() || ""
}

/**
 * Content component - orchestrates the rendering of different file types
 */
export default function Content({ post, formattedPath }: ContentProps) {
  const fileExtension = getFileType(post.path)

  // Check for PDF
  const isPDF =
    fileExtension === "pdf" ||
    post.type?.toLowerCase() === "pdf" ||
    post.path.toLowerCase().includes(".pdf")

  // Check for Anki deck
  const isAnki =
    fileExtension === "apkg" ||
    post.type?.toLowerCase() === "apkg" ||
    post.path.toLowerCase().includes(".apkg")

  // Check for image
  const isImage =
    IMAGE_EXTENSIONS.includes(fileExtension) ||
    IMAGE_EXTENSIONS.includes(post.type?.toLowerCase() || "") ||
    /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(post.path)

  // Check for code/markdown (excluding other types)
  const isCode =
    CODE_EXTENSIONS.includes(fileExtension) ||
    (CODE_EXTENSIONS.includes(post.type?.toLowerCase() || "") && !isPDF && !isAnki && !isImage)

  // Route to appropriate viewer
  if (isPDF) {
    return <PDFViewer post={post} formattedPath={formattedPath} />
  }

  if (isAnki) {
    return <AnkiViewer post={post} formattedPath={formattedPath} />
  }

  if (isImage) {
    return <ImageViewer post={post} formattedPath={formattedPath} />
  }

  if (isCode) {
    return <MarkdownViewer post={post} formattedPath={formattedPath} />
  }

  // Fallback for unsupported types
  return (
    <div className="w-full pt-0 px-4 sm:px-6 md:px-10 xl:px-20 pb-5 overflow-auto h-full bg-[var(--c-bg)]">
      <Breadcrumb formattedPath={formattedPath} />
      <h2 className="text-2xl sm:text-3xl text-center sm:text-left font-medium py-2 text-[var(--c-text-1)] break-words" aria-label={post.title}>
        {post.title}
      </h2>
      <div className="text-red-500 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <h3 className="font-semibold">Unsupported file type</h3>
        <p>
          <strong>Type:</strong> {post.type}
        </p>
        <p>
          <strong>Path:</strong> {post.path}
        </p>
        <p>
          <strong>File Extension:</strong> {fileExtension}
        </p>
      </div>
    </div>
  )
}
