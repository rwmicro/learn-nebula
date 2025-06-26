"use client"
import { useEffect, useState } from "react"
import FileTree from "./tree"
import { usePathname } from "next/navigation"
export default function Hamburger({ treeData }: { treeData: any }) {
  const [showFileTree, setShowFileTree] = useState(false)
  const pathname = usePathname()
  useEffect(() => {
    setShowFileTree(false)
  }, [pathname])

  useEffect(() => {
    const updateHeaderHeight = () => {
      const header = document.querySelector("header")
      if (header) {
        const height = header.offsetHeight
        document.documentElement.style.setProperty("--header-height", `${height}px`)
      }
    }

    updateHeaderHeight()
    window.addEventListener("resize", updateHeaderHeight)

    return () => window.removeEventListener("resize", updateHeaderHeight)
  }, [])

  return (
    <div className="relative flex items-center">
      <button
        className="lg:hidden focus:outline-none hover:bg-neutral-200 p-1 rounded border-2 border-gray-300"
        aria-label="Toggle mobile menu"
        type="button"
        onClick={() => setShowFileTree(!showFileTree)}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {showFileTree ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>
      {showFileTree && (
        <div className="fixed inset-x-0 top-0 mt-[var(--header-height)] bg-[#F4F4F5] w-full h-screen z-50">
          <FileTree tree={treeData} hidePosibility={false} />
        </div>
      )}
    </div>
  )
}