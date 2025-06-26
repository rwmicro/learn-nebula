"use client"
import { useKeyboardShortcut } from "@/hooks/keyPressed"
import { encodeURL, sanitizePath } from "@/hooks/tools"
import { FileNode } from "@/utils/types"
import Link from "next/link"
import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import Image from "next/image"
import searchImage from "/public/img/search.svg"
import { useRouter } from "next/navigation"

function flattenFileTree(tree: FileNode[]): FileNode[] {
  const stack: FileNode[] = []
  tree.forEach((node) => {
    if (node.type === "directory" && node.children) {
      stack.push(...flattenFileTree(node.children))
    } else if (node.type === "file") {
      stack.push(node)
    }
  })
  return stack
}

function filterFiles(tree: FileNode[], search: string): FileNode[] {
  const lowerCaseSearch = search.toLowerCase()
  return tree.filter((node) =>
    node.path.toLowerCase().includes(lowerCaseSearch)
  )
}

export default function Search({ tree }: { tree: FileNode[] }) {
  const defaultStack = useMemo(() => flattenFileTree(tree), [tree])
  const [search, setSearch] = useState<string>("")
  const [showSearch, setShowSearch] = useState<boolean>(false)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const filteredTree = useMemo(
    () => filterFiles(defaultStack, search),
    [defaultStack, search]
  )

  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleEscape = useCallback(() => setShowSearch(false), [])

  const handleOpenSearch = useCallback(
    (event: { ctrlKey: any; metaKey: any; preventDefault: () => void }) => {
      if ((event.ctrlKey || event.metaKey) && !showSearch) {
        event.preventDefault()
        setShowSearch(true)
      }
    },
    [showSearch]
  )

  useKeyboardShortcut({ key: "Escape", onKeyPressed: handleEscape })

  useKeyboardShortcut({
    key: "k",
    onKeyPressed: (event) => {
      if (document.activeElement !== inputRef.current) {
        handleOpenSearch(event)
      }
    },
  })
  useKeyboardShortcut({
    key: "K",
    onKeyPressed: (event) => {
      if (document.activeElement !== inputRef.current) {
        handleOpenSearch(event)
      }
    },
  })

  useEffect(() => {
    if (showSearch && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showSearch])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      setSelectedIndex((prevIndex) => {
        const nextIndex =
          event.key === "ArrowDown" ? prevIndex + 1 : prevIndex - 1
        return Math.max(0, Math.min(filteredTree.length - 1, nextIndex))
      })
      event.preventDefault()
    } else if (event.key === "Enter" && selectedIndex >= 0) {
      const selectedArticle = filteredTree[selectedIndex]
      setShowSearch(false)
      router.push(encodeURL(selectedArticle.path))
      event.preventDefault()
    }
  }

  return (
    <>
      {showSearch && (
        <div id="search">
          <div
            className="w-full h-full fixed top-0 left-0 bg-neutral-300/40 z-50"
            onClick={handleEscape}
          ></div>
          <div className="fixed top-14 w-[90vw] lg:w-[46rem] left-1/2 transform pb-4 -translate-x-1/2 p-2 bg-white rounded-xl border-2 border-[#E0E0E0] z-[51] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center border-b border-gray-300 px-4">
              <input
                ref={inputRef}
                className="w-full h-10 outline-none"
                type="text"
                placeholder="Please enter the file name you want to open..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              {search && (
                <button
                  className="p-1.5 text-neutral-500 hover:text-neutral-700"
                  onClick={() => setSearch("")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
              <button
                className="p-1.5 text-gray-600 bg-neutral-100 font-mono text-xs border border-gray-300 rounded-lg"
                onClick={handleEscape}
              >
                Esc
              </button>
            </div>
            <div className="flex flex-col px-3 text-[15px] text-neutral-600 pt-2">
              {filteredTree.slice(0, 8).map((node, index) => (
                <Link
                  className={`p-2 rounded border-gray-300 hover:bg-[#f4f4f5] ${index === selectedIndex ? "bg-[#f4f4f5]" : ""
                    }`}
                  key={node.path}
                  href={encodeURL(node.path)}
                  onClick={handleEscape}
                >
                  {sanitizePath(node.path)}
                </Link>
              ))}
            </div>
            <div className="flex justify-center items-center py-2 border-b border-gray-300 mb-3">
              <span className="text-neutral-500 text-sm">
                {filteredTree.length} results
              </span>
            </div>
            <div className="flex justify-between items-center py-2 px-10">
              <span className="text-neutral-500 text-sm">
                <button className="p-1.5 w-5 text-gray-600 bg-neutral-100 font-mono text-xs border border-gray-300 rounded-lg">
                  ↑
                </button>{" "}
                <button className="p-1.5 w-5 text-gray-600 bg-neutral-100 font-mono text-xs border border-gray-300 rounded-lg">
                  ↓
                </button>{" "}
                to navigate
              </span>
              <span className="text-neutral-500 text-sm">
                <button className="p-1.5 w-12 text-gray-600 bg-neutral-100 font-mono text-xs border border-gray-300 rounded-lg">
                  Enter
                </button>{" "}
                to open the file
              </span>
              <span className="text-neutral-500 text-sm">
                <button className="p-1.5 w-12 text-gray-600 bg-neutral-100 font-mono text-xs border border-gray-300 rounded-lg">
                  Esc
                </button>{" "}
                to close the search
              </span>
            </div>
          </div>
        </div>
      )}
      <div
        className="flex justify-between items-center border-2 border-[#E0E0E0] bg-[#F4F4F5] rounded-lg h-fit w-fit px-1"
        onClick={() => setShowSearch(true)}
      >
        <div className="flex items-center text-neutral-500 w-40 h-9 outline-none rounded-lg p-2 text-sm">
          <Image
            src={searchImage}
            width={20}
            height={20}
            alt="Search"
            className="mr-1 p-0.5"
          />
          <span>Search File</span>
        </div>
        <button className="p-1.5 w-20 border border-gray-300 text-gray-600 bg-neutral-100 font-mono text-xs border rounded-lg">
          Ctrl + K
        </button>
      </div>
    </>
  )
}
