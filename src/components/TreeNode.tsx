"use client"
import { encodeURL, sanitizePath } from "@/hooks/tools"
import { FileNode, IMAGE_EXTENSIONS } from "@/types/types"
import Link from "next/link"
import { useState } from "react"
import Image from "next/image"

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
            className={`flex gap-1 items-center align-middle pl-6 p-1 hover:bg-[#e7e7e9] rounded ${
              activePath?.replace(/^\//, "") === node.path.replace(/^\//, "")
                ? "bg-[#e7e7e9]"
                : ""
            }`}
          >
            {IMAGE_EXTENSIONS.includes(node.name.split(".").pop() || "") && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 384 512"
                height={16}
                width={20}
              >
                <path d="M448 80c8.8 0 16 7.2 16 16l0 319.8-5-6.5-136-176c-4.5-5.9-11.6-9.3-19-9.3s-14.4 3.4-19 9.3L202 340.7l-30.5-42.7C167 291.7 159.8 288 152 288s-15 3.7-19.5 10.1l-80 112L48 416.3l0-.3L48 96c0-8.8 7.2-16 16-16l384 0zM64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zm80 192a48 48 0 1 0 0-96 48 48 0 1 0 0 96z" />
              </svg>
            )}
            {sanitizePath(node.name)}
          </div>
        </Link>
      )}
    </div>
  )
}
