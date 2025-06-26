"use client"
import { useRouter } from "next/navigation"
import { buildNavigationPath, decodePathFromUrl } from "@/hooks/tools"

interface BreadcrumbProps {
  formattedPath: string
  currentPath: string
}

export default function Breadcrumb({ formattedPath, currentPath }: BreadcrumbProps) {
  const router = useRouter()

  // Decode the path and parse into segments
  const decodedPath = decodePathFromUrl(formattedPath)
  const pathSegments = decodedPath.split("/").filter(Boolean)


  // Build the path up to each segment
  const pathSegmentsWithPaths = pathSegments.map((segment, index) => {
    const pathUpToSegment = pathSegments.slice(0, index + 1).join("/")
    return {
      name: segment,
      path: pathUpToSegment,
      fullPath: pathUpToSegment,
    }
  })

  const handleBreadcrumbClick = (fullPath: string) => {
    const navigationPath = buildNavigationPath(fullPath)
    router.push(navigationPath)
  }

  return (
    <div className="">
      <h1 className="text-sm text-center pt-3 text-[#404040] my-2" aria-label="Path">
        {pathSegmentsWithPaths.map((segment, index) => (
          <span key={segment.path}>
            <span
              className="hover:text-blue-600 hover:underline cursor-pointer transition-colors"
              onClick={() => handleBreadcrumbClick(segment.fullPath)}
            >
              {segment.name}
            </span>
            {index < pathSegmentsWithPaths.length - 1 && <span className="mx-1 text-gray-400">/</span>}
          </span>
        ))}
      </h1>
    </div>
  )
}
