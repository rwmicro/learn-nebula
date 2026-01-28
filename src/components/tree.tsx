"use client"
import { FileNode } from "../utils/types"
import { usePathname } from "next/navigation"
import TreeNode from "./tree-node"
import { useState } from "react"
import Image from "next/image"

export default function Structure({
  tree,
  hidePosibility,
  fullWidth = false,
}: {
  tree: FileNode[]
  hidePosibility: boolean
  fullWidth?: boolean
}) {
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

  return (
    <div
      className={`bg-[#F4F4F5] dark:bg-[#121212] overflow-hidden text-[14px] h-full
        ${fullWidth ? "w-full" : `min-w-16 border-r border-gray-200 dark:border-[#2a2a2a] transition-[width] duration-300 ease-in-out ${!showUI ? "w-16" : "w-[22rem]"}`}`}
    >
      {/* Toggle button — always visible */}
      {hidePosibility && (
        <div className={`flex items-center justify-between w-full transition-all duration-300 ease-in-out ${showUI ? "px-5 pt-4 pb-2" : "pt-4 px-0"}`}>
          <div className={`flex items-center gap-2 flex-1 overflow-hidden transition-all duration-300 ease-in-out ${showUI ? "opacity-100 max-w-full" : "opacity-0 max-w-0"}`}>
            <span className="font-semibold dark:text-[#e5e5e5] whitespace-nowrap">Garden of Knowledge</span>
            <button
              onClick={handleCollapseAll}
              className="ml-auto text-xs px-2 py-1 bg-gray-200 dark:bg-[#1a1a1a] hover:bg-gray-300 dark:hover:bg-[#2a2a2a] rounded text-gray-700 dark:text-[#a0a0a0] transition-colors whitespace-nowrap"
              title="Collapse all folders"
            >
              Collapse All
            </button>
          </div>

          <button
            onClick={() => setShowUI(!showUI)}
            className={`p-1.5 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] rounded transition-colors ${!showUI ? "mx-auto" : ""}`}
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
        className={`text-neutral-600 dark:text-[#a0a0a0] overflow-y-auto overflow-x-hidden px-5 pb-4
          transition-opacity duration-300 ease-in-out mt-5 lg:mt-0
          ${showUI ? "opacity-100 h-[calc(100%-3.5rem)]" : "opacity-0 h-0 pointer-events-none"}`}
      >
        {tree.map((node: FileNode) => (
          <TreeNode
            key={node.path}
            node={node}
            pathName={pathSplits}
            activePath={activePath}
            onLinkClick={handlePathClick}
            collapseAll={collapseAll}
          />
        ))}
      </div>
    </div>
  )
}
