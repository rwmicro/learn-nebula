"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { buildNavigationPath } from "@/lib/tools"
import { logger } from "@/lib/logger"

interface FileItem {
  name: string
  path: string
  type: string
  isDirectory: boolean
}

const TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  md: "Note",
  mdx: "Note",
  jpg: "Image",
  jpeg: "Image",
  png: "Image",
  gif: "Image",
  webp: "Image",
  svg: "Image",
  apkg: "Anki",
}

const TYPE_COLOR: Record<string, string> = {
  pdf: "text-red-400 dark:text-red-500",
  md: "text-blue-400 dark:text-blue-500",
  mdx: "text-blue-400 dark:text-blue-500",
  jpg: "text-purple-400 dark:text-purple-500",
  jpeg: "text-purple-400 dark:text-purple-500",
  png: "text-purple-400 dark:text-purple-500",
  gif: "text-purple-400 dark:text-purple-500",
  webp: "text-purple-400 dark:text-purple-500",
  svg: "text-purple-400 dark:text-purple-500",
  apkg: "text-orange-400 dark:text-orange-500",
}

const TYPE_SVG: Record<string, React.ReactNode> = {
  pdf: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-400 dark:text-red-500">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  apkg: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-orange-400 dark:text-orange-500">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3h10.5A2.25 2.25 0 0 1 19.5 5.25v13.5A2.25 2.25 0 0 1 17.25 21H6.75A2.25 2.25 0 0 1 4.5 18.75V5.25A2.25 2.25 0 0 1 6.75 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h6M9 12h6M9 15h4" />
    </svg>
  ),
}

function FileIcon({ type }: { type: string }) {
  const t = type.toLowerCase()
  if (TYPE_SVG[t]) return <>{TYPE_SVG[t]}</>

  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(t)
  if (isImage) {
    return (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-purple-400 dark:text-purple-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    )
  }

  // default: document / note
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-400 dark:text-blue-500">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

interface RelatedArticlesProps {
  currentPath: string
}

export default function RelatedArticles({ currentPath }: RelatedArticlesProps) {
  const [siblings, setSiblings] = useState<FileItem[]>([])
  const [folderName, setFolderName] = useState("")
  const router = useRouter()

  useEffect(() => {
    const withoutLeading = currentPath.replace(/^\//, "")
    const lastSlash = withoutLeading.lastIndexOf("/")
    if (lastSlash === -1) return

    const parentDir = withoutLeading.slice(0, lastSlash)
    const currentFileName = withoutLeading.slice(lastSlash + 1)
    setFolderName(parentDir.split("/").pop() ?? parentDir)

    const fetchSiblings = async () => {
      try {
        const res = await fetch(`/api/directory-files?dirPath=${encodeURIComponent(parentDir)}`)
        if (!res.ok) return
        const data = await res.json()
        const files: FileItem[] = (data.files ?? []).filter(
          (f: FileItem) => !f.isDirectory && f.name !== currentFileName
        )
        setSiblings(files)
      } catch (err) {
        logger.error("RelatedArticles: failed to fetch siblings", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    fetchSiblings()
  }, [currentPath])

  if (siblings.length === 0) return null

  return (
    <section className="mt-16 pt-8 border-t border-gray-200 dark:border-[#1f1f1f]">
      <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-[#555] mb-5">
        Dans ce dossier &mdash; {folderName}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {siblings.map((file) => {
          const t = file.type.toLowerCase()
          const label = TYPE_LABEL[t] ?? file.type.toUpperCase()
          const labelColor = TYPE_COLOR[t] ?? "text-gray-400"
          const displayName = file.name.replace(/\.[^/.]+$/, "")

          return (
            <button
              key={file.path}
              type="button"
              onClick={() => router.push(buildNavigationPath(file.path))}
              className="group flex flex-col gap-3 p-4 rounded-xl
                bg-white dark:bg-[#111]
                border border-gray-200 dark:border-[#222]
                hover:border-gray-300 dark:hover:border-[#333]
                hover:shadow-sm dark:hover:shadow-none
                transition-all duration-150 text-left"
            >
              <FileIcon type={file.type} />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-gray-800 dark:text-[#d0d0d0] leading-snug line-clamp-2 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  {displayName}
                </span>
                <span className={`text-[11px] font-medium uppercase tracking-wide ${labelColor}`}>
                  {label}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
