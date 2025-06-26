"use client"
import { encodeURL, sanitizePath } from "@/hooks/tools"
import { FileNode } from "@/utils/types"
import Link from "next/link"
import { useState } from "react"

interface TreeNodeProps {
  node: FileNode
  pathName: string[]
  activePath: string | null
  onLinkClick: (path: string) => void
}

export default function TreeNode({
  node,
  pathName,
  activePath,
  onLinkClick,
}: TreeNodeProps) {
  function isNodeOpen() {
    if (pathName.length === 0) return false
    if (pathName.includes(node.name)) return true
    return false
  }

  const [isOpen, setIsOpen] = useState(isNodeOpen())
  return (
    <div className="break-all">
      {node.type === "directory" ? (
        <div>
          <div
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 py-[2.5px] rounded hover:bg-[#e7e7e9] cursor-pointer"
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
                  className="stroke-neutral-400 p-0.5"
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
                  className="stroke-neutral-400 -rotate-90 p-0.5"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </span>
            {node.name}
          </div>
          {isOpen && node.children && (
            <div className="ml-3 pl-2 border-l border-neutral-300">
              {node.children.map((childNode) => (
                <TreeNode
                  key={childNode.path}
                  node={childNode}
                  pathName={pathName}
                  activePath={activePath}
                  onLinkClick={onLinkClick}
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
            className={`pl-6 p-1 hover:bg-[#e7e7e9] rounded ${
              activePath?.replace(/^\//, "") === node.path.replace(/^\//, "")
                ? "bg-[#e7e7e9]"
                : ""
            }`}
          >
            {sanitizePath(node.name)}
          </div>
        </Link>
      )}
    </div>
  )
}
