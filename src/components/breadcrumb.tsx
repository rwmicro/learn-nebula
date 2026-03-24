"use client"
import { useRouter } from "next/navigation"
import { buildNavigationPath, decodePathFromUrl } from "@/lib/tools"

interface BreadcrumbProps {
  formattedPath: string
}

export default function Breadcrumb({ formattedPath }: BreadcrumbProps) {
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
    <nav aria-label="Breadcrumb navigation">
      <ol className="flex flex-wrap justify-center items-center text-sm pt-3 text-[var(--c-text-3)] my-2">
        {pathSegmentsWithPaths.map((segment, index) => (
          <li key={segment.path} className="flex items-center">
            <button
              className="hover:text-[var(--c-text-1)] hover:underline transition-colors"
              onClick={() => handleBreadcrumbClick(segment.fullPath)}
              aria-label={`Navigate to ${segment.name}`}
              aria-current={index === pathSegmentsWithPaths.length - 1 ? "page" : undefined}
              type="button"
            >
              {segment.name}
            </button>
            {index < pathSegmentsWithPaths.length - 1 && (
              <span className="mx-1 text-[var(--c-text-3)]" aria-hidden="true">/</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
