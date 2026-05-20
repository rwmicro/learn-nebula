"use client"
import { encodeURL, sanitizePath } from "@/lib/tools"
import { FileNode } from "@/utils/types"
import Link from "next/link"
import { useState, useEffect, memo } from "react"
import { useReadArticles } from "@/hooks/usePrefs"

interface TreeNodeProps {
  node: FileNode
  pathName: string[]
  activePath: string | null
  onLinkClick: (path: string) => void
  collapseAll?: number
}

const TreeNode = memo(function TreeNode({
  node,
  pathName,
  activePath,
  onLinkClick,
  collapseAll = 0,
}: TreeNodeProps) {
  // Check if this node should be expanded (if it contains the active file in its path)
  function isNodeOpen() {
    if (pathName.length === 0) return false
    if (!activePath) return false
    
    // Check if the active path goes through this directory
    const activePathNormalized = activePath.replace(/^\//, "")
    const nodePath = node.path.replace(/^\//, "")
    
    // If the active file path includes this node's path, expand it
    if (activePathNormalized.startsWith(nodePath + "/")) {
      return true
    }
    
    // Legacy check for backward compatibility
    if (pathName.includes(node.name)) return true
    
    return false
  }

  const [isOpen, setIsOpen] = useState(isNodeOpen())
  const readArticles = useReadArticles()
  const isRead = node.type === "file" && readArticles.has(node.path)

  // Collapse all folders when collapseAll changes
  useEffect(() => {
    if (collapseAll > 0) {
      setIsOpen(false)
    }
  }, [collapseAll])
  return (
    <div className="break-all">
      {node.type === "directory" ? (
        <div>
          <div
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 py-1.5 lg:py-[2.5px] rounded hover:bg-[var(--c-surface-hover)] cursor-pointer"
          >
            <span>
              {isOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-neutral-400 dark:stroke-gray-500 p-0.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="stroke-neutral-400 dark:stroke-gray-500 -rotate-90 p-0.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </span>
            {node.name}
          </div>
          {isOpen && node.children && (
            <div className="ml-3 pl-2 border-l border-[var(--c-border)]">
              {node.children.map((childNode) => (
                <TreeNode
                  key={childNode.path}
                  node={childNode}
                  pathName={pathName}
                  activePath={activePath}
                  onLinkClick={onLinkClick}
                  collapseAll={collapseAll}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Link
          href={encodeURL(node.path)}
          className="pointer"
          onClick={() => onLinkClick(node.path)}
        >
          <div
            className={`pl-6 py-1.5 px-1 lg:py-1 hover:bg-[var(--c-surface-hover)] rounded transition-colors flex items-center gap-1.5 ${
              activePath?.replace(/^\//, "") === node.path.replace(/^\//, "")
                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-medium"
                : isRead
                  ? "text-[var(--c-text-3)]"
                  : ""
            }`}
          >
            {isRead && (
              <span
                className="w-1 h-1 rounded-full bg-[var(--c-text-3)] shrink-0"
                aria-label="Article déjà lu"
                title="Déjà lu"
              />
            )}
            <span className="flex-1 min-w-0">{sanitizePath(node.name)}</span>
          </div>
        </Link>
      )}
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render when these change
  return (
    prevProps.node.path === nextProps.node.path &&
    prevProps.activePath === nextProps.activePath &&
    prevProps.collapseAll === nextProps.collapseAll &&
    prevProps.pathName.join('/') === nextProps.pathName.join('/')
  )
})

export default TreeNode
