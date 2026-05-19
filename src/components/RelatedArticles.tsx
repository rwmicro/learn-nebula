"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { buildNavigationPath } from "@/lib/tools"
import { logger } from "@/lib/logger"
import { listDirectory, type DirectoryEntry as FileItem } from "@/lib/pensine-index"

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
        const entries = await listDirectory(parentDir)
        const files = entries.filter((f) => !f.isDirectory && f.name !== currentFileName)
        setSiblings(files)
      } catch (err) {
        logger.error("RelatedArticles: failed to load siblings", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    fetchSiblings()
  }, [currentPath])

  if (siblings.length === 0) return null

  return (
    <section className="mt-16 pt-8 border-t border-[var(--c-border)]">
      <p className="text-xs uppercase tracking-widest text-[var(--c-text-3)] mb-6">
        Dans ce dossier &mdash; {folderName}
      </p>
      <div className="flex flex-col">
        {siblings.map((file) => {
          const t = file.type.toLowerCase()
          const label = TYPE_LABEL[t] ?? file.type.toUpperCase()
          const displayName = file.name.replace(/\.[^/.]+$/, "")

          return (
            <button
              key={file.path}
              type="button"
              onClick={() => router.push(buildNavigationPath(file.path))}
              className="group flex items-center gap-4 py-3 border-b border-[var(--c-border)] hover:translate-x-1 transition-transform duration-150 text-left"
            >
              <span className="text-[var(--c-text-3)] font-mono text-[10px] uppercase tracking-widest w-10 shrink-0">
                {label}
              </span>
              <span className="flex-1 text-sm text-[var(--c-text-2)] group-hover:text-[var(--c-text-1)] transition-colors duration-150 truncate">
                {displayName}
              </span>
              <span className="text-[var(--c-text-3)] group-hover:text-[var(--c-text-2)] transition-colors duration-150 text-sm">
                →
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
