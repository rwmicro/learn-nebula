"use client"
import { useEffect, useState, useCallback } from "react"
import FileTree from "./tree"
import { usePathname } from "next/navigation"
import type { FileNode } from "@/utils/types"

export default function Hamburger({ treeData }: { treeData: FileNode[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  // Close on navigation
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Measure header height
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

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setIsOpen(false)
  }, [])

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, handleKeyDown])

  return (
    <div className="relative flex items-center">
      {/* Hamburger / Close button */}
      <button
        className="lg:hidden focus:outline-none hover:bg-neutral-200 dark:hover:bg-[#252525] p-1.5 rounded border border-gray-300 dark:border-[#333] transition-colors"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg
          className="w-5 h-5 text-gray-600 dark:text-[#a0a0a0]"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isOpen ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
        </svg>
      </button>

      {/* Full-screen overlay */}
      <div
        className={`fixed inset-0 top-[var(--header-height)] z-50 transition-all duration-300 ease-in-out
          ${isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"}`}
      >
        {/* Backdrop blur */}
        <div
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />

        {/* Panel */}
        <div
          className={`relative h-full flex flex-col bg-[#F9F9F9] dark:bg-[#0a0a0a] transition-transform duration-300 ease-in-out
            ${isOpen ? "translate-y-0" : "-translate-y-4"}`}
        >
          {/* Search trigger — opens the global search modal */}
          <div className="px-4 pt-4 pb-2 border-b border-gray-200 dark:border-[#1f1f1f]">
            <button
              className="flex items-center w-full border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#121212] rounded-lg h-10 px-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1a1a1a] hover:border-gray-300 dark:hover:border-[#3a3a3a] transition-all shadow-sm text-gray-500 dark:text-[#6b6b6b] text-sm"
              type="button"
              onClick={() => {
                document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))
              }}
            >
              <svg className="w-4 h-4 mr-2 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Rechercher...</span>
              <kbd className="ml-auto px-1.5 py-0.5 border border-gray-200 dark:border-[#252525] bg-gray-50 dark:bg-[#1a1a1a] font-mono text-[11px] rounded">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <FileTree tree={treeData} hidePosibility={false} fullWidth />
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-[#1f1f1f] bg-[#F4F4F5] dark:bg-[#121212]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-[#6b6b6b]">
                Esc pour fermer
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-[#a0a0a0] bg-gray-200 dark:bg-[#1a1a1a] hover:bg-gray-300 dark:hover:bg-[#252525] rounded-lg transition-colors"
                type="button"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
