"use client"
import { FileNode } from "../utils/types"
import { usePathname } from "next/navigation"
import TreeNode from "./tree-node"
import { useState } from "react"
import sideBar from "/public/img/sidebar.svg"
import Image from "next/image"

export default function Structure({
  tree,
  hidePosibility,
}: {
  tree: FileNode[]
  hidePosibility: boolean
}) {
  const location = usePathname()
  const path = decodeURIComponent(location)
  const pathSplits: string[] = path.split("/")
  pathSplits.shift()

  const [showUI, setShowUI] = useState(true)
  const [activePath, setActivePath] = useState<string | null>(
    path === "/" ? null : path.replace(/^\//, "")
  )

  const handlePathClick = (nodePath: string) => {
    setActivePath(nodePath)
  }

  return (
    <>
      <div
        className={`bg-[#F4F4F5] min-w-16 transition-all duration-300 border-r border-gray-200 overflow-scroll text-[14px] h-full
        ${!showUI ? "w-16" : "w-[22rem] px-5 p-4"}`}
      >
        {hidePosibility && (
          <div className="flex items-center justify-between w-full pb-2">
            {showUI && (
              <span className="font-semibold">Garden of Knowledge</span>
            )}

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
        )}
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
