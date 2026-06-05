"use client"
import { useEffect, useState, useCallback } from "react"
import FileTree from "./tree"
import { usePathname } from "next/navigation"
import type { FileNode } from "@/utils/types"

export default function Hamburger({ treeData }: { treeData?: FileNode[] }) {
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
        className="lg:hidden focus:outline-none hover:bg-[var(--c-surface-hover)] p-1.5 rounded border border-[var(--c-border)] transition-colors"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg
          className="w-5 h-5 text-[var(--c-text-2)]"
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
          className={`relative h-full flex flex-col bg-[var(--c-bg)] transition-transform duration-300 ease-in-out
            ${isOpen ? "translate-y-0" : "-translate-y-4"}`}
        >
          {/* Search trigger — opens the global search modal */}
          <div className="px-4 pt-4 pb-2 border-b border-[var(--c-border)]">
            <button
              className="flex items-center w-full border border-[var(--c-border)] bg-[var(--c-surface)] rounded-lg h-10 px-3 cursor-pointer hover:bg-[var(--c-surface-hover)] hover:border-[var(--c-text-3)] transition-all shadow-sm text-[var(--c-text-3)] text-sm"
              type="button"
              onClick={() => {
                document.dispatchEvent(new CustomEvent("open-search"))
              }}
            >
              <svg className="w-4 h-4 mr-2 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Rechercher...</span>
              <kbd className="ml-auto px-1.5 py-0.5 border border-[var(--c-border)] bg-[var(--c-surface-hover)] font-mono text-[11px] rounded">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <FileTree tree={treeData} hidePosibility={false} fullWidth />
          </div>

          {/* Footer — adds safe-area-inset-bottom so iOS home indicator doesn't cover the buttons */}
          <div className="px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[var(--c-border)] bg-[var(--c-sidebar)]">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => document.dispatchEvent(new CustomEvent("collapse-tree"))}
                className="px-3 py-1.5 text-xs font-medium text-[var(--c-text-2)] bg-[var(--c-surface-hover)] hover:bg-[var(--c-border)] rounded-lg transition-colors"
                type="button"
              >
                Tout replier
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 text-sm font-medium text-[var(--c-text-2)] bg-[var(--c-surface-hover)] hover:bg-[var(--c-border)] rounded-lg transition-colors"
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
