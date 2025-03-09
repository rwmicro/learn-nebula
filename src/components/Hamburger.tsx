"use client"
import { useEffect, useState } from "react"
import FileTree from "./Tree"
import { usePathname } from "next/navigation"
export default function Hamburger({ treeData }: { treeData: any }) {
  const [showFileTree, setShowFileTree] = useState(false)
  const pathname = usePathname()
  useEffect(() => {
    setShowFileTree(false)
  }, [pathname])

  return (
    <div className="flex items-center">
      <button
        className="md:hidden focus:outline-none"
        aria-label="Toggle mobile menu"
        type="button"
        onClick={() => setShowFileTree(!showFileTree)}
      >
        <svg
          className="w-6 h-6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {showFileTree ? (
            <path d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>
      {showFileTree && (
        <div className="h-screen absolute top-[6.5vh] left-0 w-full bg-[#F4F4F5]">
          <FileTree tree={treeData} hidePosibility={false} />
        </div>
      )}
    </div>
  )
}

// <div className="hidden xl:block w-1/4 max-w-1/4 h-screen max-h-[93vh]">
