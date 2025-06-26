"use client"
import type { Post } from "@/utils/types"
import type React from "react"

import { CODE_EXTENSIONS, IMAGE_EXTENSIONS } from "@/utils/constants"
import Image from "next/image"
import { useState, useEffect } from "react"
import Breadcrumb from "./breadcrumb"

export default function Content({
  post,
  formattedPath,
}: {
  post: Post
  formattedPath: string
}) {
  const [ArticleComponent, setArticleComponent] = useState<React.ComponentType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Helper function to determine file type from path
  const getFileTypeFromPath = (path: string): string => {
    const extension = path.split(".").pop()?.toLowerCase() || ""
    return extension
  }

  const fileExtension = getFileTypeFromPath(post.path)

  // MOST IMPORTANT: Check for PDF first, before any other conditions
  const isPDF =
    fileExtension === "pdf" || post.type?.toLowerCase() === "pdf" || post.path.toLowerCase().includes(".pdf")

  // Handle image files
  const isImage =
    IMAGE_EXTENSIONS.includes(fileExtension) ||
    IMAGE_EXTENSIONS.includes(post.type?.toLowerCase() || "") ||
    /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(post.path)

  // Handle code/markdown files - EXPLICITLY exclude PDFs and images
  const isCode =
    CODE_EXTENSIONS.includes(fileExtension) ||
    (CODE_EXTENSIONS.includes(post.type?.toLowerCase() || "") && !isPDF && !isImage)

  useEffect(() => {
    const loadComponent = async () => {
      try {
        // Only attempt to import if it's actually a code/markdown file
        if (CODE_EXTENSIONS.includes(fileExtension)) {

          // For mdx and md files, remove the extension and leading slash for import
          const cleanPath = post.path.replace(/\.mdx?$/i, "").replace(/^\//, "")

          // Use a more specific import pattern to avoid webpack trying to bundle everything
          let module
          if (fileExtension === "mdx" || fileExtension === "md") {
            // Only import markdown/mdx files
            module = await import(`../../public/articles/pensine/${cleanPath}.${fileExtension}`)
          } else {
            throw new Error(`File type ${fileExtension} not supported for dynamic import`)
          }

          setArticleComponent(() => module.default)
          setLoading(false)
        }

      } catch (err) {
        console.error("Failed to load component:", err)
        setError(err instanceof Error ? err.message : "Failed to load component")
        setLoading(false)
      }
    }

    loadComponent()
  }, [post.path, fileExtension])

  if (isPDF) {
    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] max-h-[93vh] bg-[#F9F9F9]">
        <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
        <h2 className="text-3xl text-center sm:text-left font-medium py-2" aria-label={post.title}>
          {post.title}
        </h2>
        <div className="w-full overflow-scroll max-h-[90vh] bg-white rounded-lg shadow-sm">
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

  if (isImage) {
    const cleanTitle = post.title.replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, "")

    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] max-h-[93vh] bg-[#F9F9F9]">
        <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
        <h2 className="text-3xl md:text-center sm:text-left font-medium py-2" aria-label={cleanTitle}>
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

  if (isCode) {
    if (loading) {
      return (
        <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] max-h-[93vh] bg-[#F9F9F9]">
          <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
          <h2 className="text-3xl text-left font-medium py-2">{post.title}</h2>
          <p>Chargement...</p>
        </div>
      )
    }

    if (error || !ArticleComponent) {
      return (
        <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] max-h-[93vh] bg-[#F9F9F9]">
          <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
          <h2 className="text-3xl text-left font-medium py-2">{post.title}</h2>
          <div className="text-red-500 p-4 bg-red-50 rounded-lg">
            <h3 className="font-semibold">Error loading content</h3>
            <p>{error || "Content not found"}</p>
          </div>
        </div>
      )
    }

    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] max-h-[93vh] bg-[#F9F9F9]">
        <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
        <h2 className="text-3xl text-left font-medium my-2">{post.title.replace(/\.mdx?$/i, "")}</h2>
        <article className="prœose dark:prose-invert max-w-none">
          <ArticleComponent />
        </article>
      </div>
    )
  }

  // Fallback for unsupported types
  return (
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] max-h-[93vh] bg-[#F9F9F9]">
      <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
      <h2 className="text-3xl text-center sm:text-left font-medium py-2" aria-label={post.title}>
        {post.title}
      </h2>
      <div className="text-red-500 p-4 bg-red-50 rounded-lg">
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
