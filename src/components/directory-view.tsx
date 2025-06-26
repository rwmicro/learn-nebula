"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Breadcrumb from "./breadcrumb"

interface FileItem {
  name: string
  path: string
  type: string
  isDirectory: boolean
}

interface DirectoryViewProps {
  directoryPath: string
}

// Fonction pour décoder le chemin depuis l'URL
function decodePathFromUrl(encodedPath: string): string {
  try {
    // Décoder chaque segment du chemin séparément
    return encodedPath
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/")
  } catch (error) {
    console.error("Error decoding path:", error)
    return encodedPath
  }
}

// Fonction pour construire le chemin de navigation
function buildNavigationPath(filePath: string): string {
  // Nettoyer le chemin et encoder chaque segment
  const cleanPath = filePath.startsWith("/") ? filePath.slice(1) : filePath
  const segments = cleanPath.split("/").filter((segment) => segment.length > 0)

  // Encoder chaque segment individuellement
  const encodedSegments = segments.map((segment) => segment)

  // Construire l'URL finale
  return encodeURIComponent(`${encodedSegments.join("/")}`)
}

// Fonction pour nettoyer le chemin
function sanitizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/"
}

export default function DirectoryView({ directoryPath }: DirectoryViewProps) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Décoder le chemin du répertoire
  const decodedDirectoryPath = decodePathFromUrl(directoryPath)
  const formattedPath = sanitizePath(decodedDirectoryPath)

  useEffect(() => {
    const fetchDirectoryContents = async () => {
      setLoading(true)
      setError(null)

      try {
        // Utiliser le chemin décodé pour l'API
        const apiUrl = `/api/directory-files?dirPath=${encodeURIComponent(decodedDirectoryPath)}`

        const response = await fetch(apiUrl)

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        setFiles(data.files || [])
      } catch (err) {
        console.error("Error fetching directory contents:", err)
        setError(`Error loading directory contents: ${err instanceof Error ? err.message : "Unknown error"}`)
      } finally {
        setLoading(false)
      }
    }

    fetchDirectoryContents()
  }, [decodedDirectoryPath])

  const handleFileClick = (filePath: string) => {
    try {
      const navigationPath = buildNavigationPath(filePath)
      router.push(navigationPath)
    } catch (error) {
      console.error("Error navigating to file:", error)
      setError("Error navigating to file")
    }
  }

  const handleDirectoryClick = (dirPath: string) => {
    try {
      const navigationPath = buildNavigationPath(dirPath)
      router.push(navigationPath)
    } catch (error) {
      console.error("Error navigating to directory:", error)
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
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] max-h-[93vh] bg-[#F9F9F9]">
        <Breadcrumb formattedPath={directoryPath} currentPath={decodedDirectoryPath} />
        <h2 className="text-3xl text-left font-medium py-2">Directory Contents</h2>
        <div className="flex items-center justify-center py-8">
          <div className="animate-pulse">
            <div className="text-gray-500">Loading directory contents...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] max-h-[93vh] bg-[#F9F9F9]">
        <Breadcrumb formattedPath={directoryPath} currentPath={decodedDirectoryPath} />
        <h2 className="text-3xl text-left font-medium py-2">Directory Contents</h2>
        <div className="text-red-500 p-4 bg-red-50 rounded-lg border border-red-200">
          <h3 className="font-semibold mb-2">Error</h3>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-md text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll min-h-[93vh] max-h-[93vh] bg-[#F9F9F9]">
      <Breadcrumb formattedPath={directoryPath} currentPath={decodedDirectoryPath} />
      <h2 className="text-3xl text-left font-medium py-2">Directory Contents</h2>

      {files.length === 0 ? (
        <div className="text-gray-500 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p>This directory is empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
          {files.map((file) => (
            <div
              key={file.path}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
              onClick={() => (file.isDirectory ? handleDirectoryClick(file.path) : handleFileClick(file.path))}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl group-hover:scale-110 transition-transform">
                  {getFileIcon(file.type, file.isDirectory)}
                </span>
                <div className="flex-1 min-w-0">
                  <h3
                    className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors"
                    title={file.name}
                  >
                    {file.name}
                  </h3>
                  {!file.isDirectory && (
                    <p className="text-sm text-gray-500 capitalize">{file.type ? `.${file.type}` : "File"}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
