"use client"
import { FileNode } from "../utils/types"
import { usePathname } from "next/navigation"
import TreeNode from "./tree-node"
import { useState, useEffect } from "react"
import Image from "next/image"
import { loadTree } from "@/lib/pensine-index"

// Tree data is fetched client-side from /pensine-index.json so we don't have
// to ship the full ~150 KB tree DOM in every prerendered page. The fetch is
// cached (HTTP + module-level promise via loadTree), so cost is ~one network
// hit per session.
export default function Structure({
  tree: treeProp,
  hidePosibility,
  fullWidth = false,
}: {
  tree?: FileNode[]
  hidePosibility: boolean
  fullWidth?: boolean
}) {
  const [tree, setTree] = useState<FileNode[]>(treeProp ?? [])

  useEffect(() => {
    if (treeProp) return
    let cancelled = false
    loadTree().then((data) => {
      if (!cancelled) setTree(data)
    })
    return () => {
      cancelled = true
    }
  }, [treeProp])
  const location = usePathname()
  const path = decodeURIComponent(location)
  const pathSplits: string[] = path.split("/")
  pathSplits.shift()

  const [showUI, setShowUI] = useState(true)
  const [activePath, setActivePath] = useState<string | null>(
    path === "/" ? null : path.replace(/^\//, "")
  )
  const [collapseAll, setCollapseAll] = useState(0)

  const handlePathClick = (nodePath: string) => {
    setActivePath(nodePath)
  }

  const handleCollapseAll = () => {
    setCollapseAll((prev) => prev + 1)
  }

  // Listen for collapse triggers from outside (e.g. the mobile Hamburger footer).
  useEffect(() => {
    const collapse = () => setCollapseAll((prev) => prev + 1)
    document.addEventListener("collapse-tree", collapse)
    return () => document.removeEventListener("collapse-tree", collapse)
  }, [])

  return (
    <div
      className={`bg-[var(--c-sidebar)] overflow-hidden text-[14px] h-full
        ${fullWidth ? "w-full" : `min-w-16 border-r border-[var(--c-border)] transition-[width] duration-300 ease-in-out ${!showUI ? "w-16" : "w-[22rem]"}`}`}
    >
      {/* Toggle button — always visible */}
      {hidePosibility && (
        <div className={`flex items-center justify-between w-full transition-all duration-300 ease-in-out ${showUI ? "px-5 pt-4 pb-2" : "pt-4 px-0"}`}>
          <div className={`flex items-center gap-2 flex-1 overflow-hidden transition-all duration-300 ease-in-out ${showUI ? "opacity-100 max-w-full" : "opacity-0 max-w-0"}`}>
            <span className="font-semibold text-[var(--c-text-1)] whitespace-nowrap">Garden of Knowledge</span>
            <button
              onClick={handleCollapseAll}
              className="ml-auto text-xs px-2 py-1 bg-[var(--c-surface-hover)] hover:bg-[var(--c-border)] rounded text-[var(--c-text-2)] transition-colors whitespace-nowrap"
              title="Collapse all folders"
            >
              Collapse All
            </button>
          </div>

          <button
            onClick={() => setShowUI(!showUI)}
            className={`p-1.5 hover:bg-[var(--c-surface-hover)] rounded transition-colors ${!showUI ? "mx-auto" : ""}`}
            aria-label={showUI ? "Close sidebar" : "Open sidebar"}
          >
            <Image
              src="/img/sidebar.svg"
              alt="sidebar"
              width={20}
              height={20}
              className={`w-5 h-5 opacity-50 hover:opacity-100 dark:invert
                transition-transform duration-300 ease-in-out
                ${showUI ? "rotate-180" : "rotate-0"}`}
            />
          </button>
        </div>
      )}

      {/* Tree content with fade animation */}
      <div
        className={`text-[var(--c-text-2)] overflow-y-auto overflow-x-hidden px-3 sm:px-5 pb-4
          transition-opacity duration-300 ease-in-out mt-2 lg:mt-0
          ${showUI ? "opacity-100 h-[calc(100%-3.5rem)]" : "opacity-0 h-0 pointer-events-none"}`}
      >
        {tree.length === 0 ? (
          <div className="px-2 pt-2 space-y-2 animate-pulse" aria-busy="true" aria-label="Chargement de l'arborescence">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-4 bg-[var(--c-surface-hover)] rounded"
                style={{ width: `${60 + ((i * 13) % 35)}%` }}
              />
            ))}
          </div>
        ) : (
          tree.map((node: FileNode) => (
            <TreeNode
              key={node.path}
              node={node}
              pathName={pathSplits}
              activePath={activePath}
              onLinkClick={handlePathClick}
              collapseAll={collapseAll}
            />
          ))
        )}
      </div>
    </div>
  )
}
