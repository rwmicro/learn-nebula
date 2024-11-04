"use client"
import { FileNode } from "../types/types"
import { usePathname } from "next/navigation"
import TreeNode from "./TreeNode"
import { useState } from "react"
import sideBar from "public/img/sidebar.svg"
import Image from "next/image"

export default function Structure({ tree }: { tree: FileNode[] }) {
  const location = usePathname()
  const path = decodeURIComponent(location)
  const pathSplits: string[] = path.split("/")
  pathSplits.shift()

  const [showUI, setShowUI] = useState(true)
  const [activePath, setActivePath] = useState<string | null>(
    path === "/" ? null : path.replace(/^\//, '')
  )

  const handlePathClick = (nodePath: string) => {
    setActivePath(nodePath)
  }

  return (
    <>
      <div
        className={`hidden xl:block w-1/4 max-w-1/4 h-screen max-h-[93vh] bg-[#F4F4F5] transition-all duration-300  border-r overflow-scroll text-[14px] dark:bg-[#27272A]
        ${!showUI ? "w-16" : "px-5 p-4"}`}
      >
        <div className="flex items-center justify-between w-full pb-2">
          {showUI && <span className="font-semibold">Garden of Knowledge</span>}

          <Image
            onClick={() => {
              setShowUI(!showUI)
            }}
            src={sideBar}
            alt="sidebar"
            width={45}
            height={45}
            className={
              `w-10 h-10 rotate-180 hover:bg-[#e7e7e9] p-2 rounded cursor-pointer transition-transform` +
              (showUI ? "" : " rotate-0 mt-4 mx-auto")
            }
          />
        </div>
        {showUI && (
          <div className="text-neutral-600">
            {tree.map((node: FileNode) => {
              return (
                <TreeNode
                  key={node.path}
                  node={node}
                  pathName={pathSplits}
                  activePath={activePath}
                  onLinkClick={handlePathClick}
                />
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
