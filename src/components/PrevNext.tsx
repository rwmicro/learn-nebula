"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { buildNavigationPath } from "@/lib/tools"
import { logger } from "@/lib/logger"
import { listDirectory, type DirectoryEntry as FileItem } from "@/lib/pensine-index"

export function PrevNext({ currentPath }: { currentPath: string }) {
  const [prev, setPrev] = useState<FileItem | null>(null)
  const [next, setNext] = useState<FileItem | null>(null)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const withoutLeading = currentPath.replace(/^\//, "")
      const lastSlash = withoutLeading.lastIndexOf("/")
      if (lastSlash === -1) return
      const parentDir = withoutLeading.slice(0, lastSlash)
      const currentFileName = withoutLeading.slice(lastSlash + 1)
      try {
        const entries = await listDirectory(parentDir)
        const files = entries
          .filter((f) => !f.isDirectory)
          .sort((a, b) => a.name.localeCompare(b.name))
        const idx = files.findIndex((f) => f.name === currentFileName)
        if (idx === -1) return
        setPrev(idx > 0 ? files[idx - 1] : null)
        setNext(idx < files.length - 1 ? files[idx + 1] : null)
      } catch (err) {
        logger.error("PrevNext: failed to load siblings", {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    load()
  }, [currentPath])

  if (!prev && !next) return null

  return (
    <div className="mt-12 pt-8 border-t border-[var(--c-border)] flex justify-between gap-4">
      {prev ? (
        <button
          onClick={() => router.push(buildNavigationPath(prev.path))}
          className="group flex items-center gap-3 text-left max-w-[45%]"
          type="button"
        >
          <span className="text-[var(--c-text-3)] group-hover:text-[var(--c-text-2)] transition-colors text-lg">←</span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[var(--c-text-3)] mb-0.5">Précédent</p>
            <p className="text-sm text-[var(--c-text-2)] group-hover:text-[var(--c-text-1)] transition-colors truncate">
              {prev.name.replace(/\.[^/.]+$/, "")}
            </p>
          </div>
        </button>
      ) : <div />}
      {next ? (
        <button
          onClick={() => router.push(buildNavigationPath(next.path))}
          className="group flex items-center gap-3 text-right max-w-[45%] ml-auto"
          type="button"
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[var(--c-text-3)] mb-0.5">Suivant</p>
            <p className="text-sm text-[var(--c-text-2)] group-hover:text-[var(--c-text-1)] transition-colors truncate">
              {next.name.replace(/\.[^/.]+$/, "")}
            </p>
          </div>
          <span className="text-[var(--c-text-3)] group-hover:text-[var(--c-text-2)] transition-colors text-lg">→</span>
        </button>
      ) : <div />}
    </div>
  )
}
