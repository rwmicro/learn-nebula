"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Breadcrumb from "./breadcrumb"
import { decodePathFromUrl, buildNavigationPath } from "@/lib/tools"
import { logger } from "@/lib/logger"
import { listDirectory, type DirectoryEntry as FileItem } from "@/lib/pensine-index"

interface DirectoryViewProps {
  directoryPath: string
}

export default function DirectoryView({ directoryPath }: DirectoryViewProps) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const decodedDirectoryPath = decodePathFromUrl(directoryPath)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listDirectory(decodedDirectoryPath)
      .then((entries) => {
        if (!cancelled) setFiles(entries)
      })
      .catch((err) => {
        if (cancelled) return
        logger.error("Error loading directory contents", {
          error: err instanceof Error ? err.message : String(err),
          directoryPath: decodedDirectoryPath,
        })
        setError("Error loading directory contents")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [decodedDirectoryPath])

  const handleFileClick = (filePath: string) => {
    try {
      const navigationPath = buildNavigationPath(filePath)
      router.push(navigationPath)
    } catch (error) {
      logger.error("Error navigating to file", { 
        error: error instanceof Error ? error.message : String(error),
        filePath 
      })
      setError("Error navigating to file")
    }
  }

  const handleDirectoryClick = (dirPath: string) => {
    try {
      const navigationPath = buildNavigationPath(dirPath)
      router.push(navigationPath)
    } catch (error) {
      logger.error("Error navigating to directory", { 
        error: error instanceof Error ? error.message : String(error),
        dirPath 
      })
      setError("Error navigating to directory")
    }
  }

  const getFileIcon = (type: string, isDirectory: boolean) => {
    if (isDirectory) return "📁"
    switch (type.toLowerCase()) {
      case "pdf":
        return "📄"
      case "md":
      case "mdx":
        return "📝"
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
      case "webp":
      case "svg":
        return "🖼️"
      case "js":
      case "jsx":
      case "ts":
      case "tsx":
        return "⚡"
      case "json":
        return "📋"
      case "css":
      case "scss":
        return "🎨"
      default:
        return "📄"
    }
  }

  if (loading) {
    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll h-full bg-[var(--c-bg)]">
        <Breadcrumb formattedPath={directoryPath} />
        <h2 className="text-3xl text-left font-medium py-2 text-[var(--c-text-1)]">Directory Contents</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse">
            <div className="text-[var(--c-text-3)]">Loading directory contents...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll h-full bg-[var(--c-bg)]">
        <Breadcrumb formattedPath={directoryPath} />
        <h2 className="text-3xl text-left font-medium py-2 text-[var(--c-text-1)]">Directory Contents</h2>
        <div className="text-red-500 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-900/30">
          <h3 className="font-semibold mb-2">Error</h3>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-md text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll h-full bg-[var(--c-bg)]">
      <Breadcrumb formattedPath={directoryPath} />
      <h2 className="text-3xl text-left font-medium py-2 text-[var(--c-text-1)]">Directory Contents</h2>

      {files.length === 0 ? (
        <div className="text-[var(--c-text-3)] p-4 bg-[var(--c-surface)] rounded-lg border border-[var(--c-border)]">
          <p>This directory is empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
          {files.map((file) => (
            <button
              key={file.path}
              className="bg-[var(--c-surface)] p-4 rounded-lg border border-[var(--c-border)] hover:border-[var(--c-text-3)] transition-all cursor-pointer group text-left w-full"
              onClick={() => (file.isDirectory ? handleDirectoryClick(file.path) : handleFileClick(file.path))}
              aria-label={`${file.isDirectory ? 'Open directory' : 'Open file'}: ${file.name}`}
              type="button"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl group-hover:scale-110 transition-transform">
                  {getFileIcon(file.type, file.isDirectory)}
                </span>
                <div className="flex-1 min-w-0">
                  <h3
                    className="font-medium text-[var(--c-text-1)] truncate group-hover:text-[var(--c-text-1)] transition-colors"
                    title={file.name}
                  >
                    {file.name}
                  </h3>
                  {!file.isDirectory && (
                    <p className="text-sm text-[var(--c-text-3)] capitalize">{file.type ? `.${file.type}` : "File"}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
