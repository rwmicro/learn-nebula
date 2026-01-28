"use client"
import { useKeyboardShortcut } from "@/hooks/keyPressed"
import { useDebounce } from "@/hooks/useDebounce"
import { encodeURL, sanitizePath } from "@/lib/tools"
import { FileNode } from "@/utils/types"
import { SEARCH_MAX_RESULTS } from "@/utils/constants"
import Link from "next/link"
import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"

// File type categories for filtering
const FILE_TYPES: Record<string, { label: string; extensions: string[] }> = {
  all: { label: "Tous", extensions: [] },
  markdown: { label: "Markdown", extensions: ["md", "mdx"] },
  pdf: { label: "PDF", extensions: ["pdf"] },
  images: { label: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp", "svg"] },
  anki: { label: "Anki", extensions: ["apkg"] },
}

type FileTypeKey = "all" | "markdown" | "pdf" | "images" | "anki"

// Fuzzy search scoring function
function fuzzyMatch(text: string, pattern: string): { match: boolean; score: number; indices: number[] } {
  const textLower = text.toLowerCase()
  const patternLower = pattern.toLowerCase()

  // Exact match gets highest score
  if (textLower.includes(patternLower)) {
    const startIndex = textLower.indexOf(patternLower)
    const indices = Array.from({ length: patternLower.length }, (_, i) => startIndex + i)
    return { match: true, score: 100 + (patternLower.length / text.length) * 50, indices }
  }

  // Fuzzy matching
  let patternIdx = 0
  let score = 0
  const indices: number[] = []
  let consecutiveBonus = 0
  let lastMatchIdx = -2

  for (let i = 0; i < textLower.length && patternIdx < patternLower.length; i++) {
    if (textLower[i] === patternLower[patternIdx]) {
      indices.push(i)

      // Bonus for consecutive matches
      if (i === lastMatchIdx + 1) {
        consecutiveBonus += 5
      } else {
        consecutiveBonus = 0
      }

      // Bonus for matching at start of word
      if (i === 0 || text[i - 1] === "/" || text[i - 1] === " " || text[i - 1] === "-" || text[i - 1] === "_") {
        score += 10
      }

      score += 1 + consecutiveBonus
      lastMatchIdx = i
      patternIdx++
    }
  }

  const matched = patternIdx === patternLower.length
  return { match: matched, score: matched ? score : 0, indices }
}

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

function getFileExtension(path: string): string {
  return path.split(".").pop()?.toLowerCase() || ""
}

function filterAndScoreFiles(
  tree: FileNode[],
  search: string,
  fileType: FileTypeKey
): (FileNode & { score: number; matchIndices: number[] })[] {
  // First filter by file type
  let filtered = tree
  if (fileType !== "all") {
    const extensions = FILE_TYPES[fileType].extensions
    filtered = tree.filter((node) => extensions.includes(getFileExtension(node.path)))
  }

  // If no search, return all (sorted alphabetically)
  if (!search.trim()) {
    return filtered.map((node) => ({ ...node, score: 0, matchIndices: [] }))
  }

  // Apply fuzzy search and score
  const results = filtered
    .map((node) => {
      const { match, score, indices } = fuzzyMatch(node.path, search)
      return { ...node, match, score, matchIndices: indices }
    })
    .filter((node) => node.match)
    .sort((a, b) => b.score - a.score)

  return results
}

// Recent searches storage
const RECENT_SEARCHES_KEY = "pensine-recent-searches"
const MAX_RECENT_SEARCHES = 5

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function addRecentSearch(search: string): void {
  if (typeof window === "undefined" || !search.trim()) return
  try {
    const recent = getRecentSearches().filter((s) => s !== search)
    recent.unshift(search)
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_SEARCHES)))
  } catch {
    // Ignore storage errors
  }
}

// Component to highlight matched characters
function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) {
    return <span>{text}</span>
  }

  const indicesSet = new Set(indices)
  const parts: React.ReactNode[] = []
  let currentPart = ""
  let isHighlighted = false

  for (let i = 0; i < text.length; i++) {
    const shouldHighlight = indicesSet.has(i)

    if (shouldHighlight !== isHighlighted) {
      if (currentPart) {
        parts.push(
          isHighlighted ? (
            <mark key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-inherit rounded px-0.5">
              {currentPart}
            </mark>
          ) : (
            <span key={i}>{currentPart}</span>
          )
        )
      }
      currentPart = text[i]
      isHighlighted = shouldHighlight
    } else {
      currentPart += text[i]
    }
  }

  if (currentPart) {
    parts.push(
      isHighlighted ? (
        <mark key="last" className="bg-yellow-200 dark:bg-yellow-900/50 text-inherit rounded px-0.5">
          {currentPart}
        </mark>
      ) : (
        <span key="last">{currentPart}</span>
      )
    )
  }

  return <>{parts}</>
}

// File type icon component
function FileTypeIcon({ extension }: { extension: string }) {
  const iconClass = "w-4 h-4 mr-2 flex-shrink-0"

  switch (extension) {
    case "pdf":
      return (
        <svg className={`${iconClass} text-red-500`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM8.5 13a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 4.5c1.93 0 3.5-1.57 3.5-3.5S10.43 10.5 8.5 10.5 5 12.07 5 14s1.57 3.5 3.5 3.5z"/>
        </svg>
      )
    case "md":
    case "mdx":
      return (
        <svg className={`${iconClass} text-blue-500`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 3v18h18V3H3zm16 16H5V5h14v14zM7 15h2V9H7v6zm3-6v6h2v-4l1.5 2 1.5-2v4h2V9h-2l-1.5 2L12 9h-2z"/>
        </svg>
      )
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "webp":
    case "svg":
      return (
        <svg className={`${iconClass} text-green-500`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
        </svg>
      )
    case "apkg":
      return (
        <svg className={`${iconClass} text-purple-500`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      )
    default:
      return (
        <svg className={`${iconClass} text-gray-400`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
        </svg>
      )
  }
}

export default function Search({ tree, fullWidth = false, hideTrigger = false }: { tree: FileNode[]; fullWidth?: boolean; hideTrigger?: boolean }) {
  const defaultStack = useMemo(() => flattenFileTree(tree), [tree])
  const [search, setSearch] = useState<string>("")
  const [showSearch, setShowSearch] = useState<boolean>(false)
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [selectedFileType, setSelectedFileType] = useState<FileTypeKey>("all")
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  // Debounce search input for better performance
  const debouncedSearch = useDebounce(search, 150)

  const filteredTree = useMemo(
    () => filterAndScoreFiles(defaultStack, debouncedSearch, selectedFileType),
    [defaultStack, debouncedSearch, selectedFileType]
  )

  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLAnchorElement>(null)

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(getRecentSearches())
  }, [])

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedItemRef.current && resultsRef.current) {
      const container = resultsRef.current
      const item = selectedItemRef.current
      const containerRect = container.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()

      if (itemRect.bottom > containerRect.bottom) {
        item.scrollIntoView({ block: "nearest", behavior: "smooth" })
      } else if (itemRect.top < containerRect.top) {
        item.scrollIntoView({ block: "nearest", behavior: "smooth" })
      }
    }
  }, [selectedIndex])

  const handleEscape = useCallback(() => {
    setShowSearch(false)
    setSearch("")
    setSelectedIndex(0)
    setSelectedFileType("all")
  }, [])

  const handleOpenSearch = useCallback(
    (event: React.KeyboardEvent | KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !showSearch) {
        event.preventDefault()
        setShowSearch(true)
        setRecentSearches(getRecentSearches())
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

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [debouncedSearch, selectedFileType])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const maxIndex = Math.min(filteredTree.length, SEARCH_MAX_RESULTS) - 1

    if (event.key === "ArrowDown") {
      setSelectedIndex((prev) => Math.min(prev + 1, maxIndex))
      event.preventDefault()
    } else if (event.key === "ArrowUp") {
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
      event.preventDefault()
    } else if (event.key === "Enter" && selectedIndex >= 0 && filteredTree[selectedIndex]) {
      const selectedArticle = filteredTree[selectedIndex]
      if (search.trim()) {
        addRecentSearch(search.trim())
      }
      setShowSearch(false)
      setSearch("")
      router.push(encodeURL(selectedArticle.path))
      event.preventDefault()
    } else if (event.key === "Tab") {
      // Tab through file types
      event.preventDefault()
      const types = Object.keys(FILE_TYPES) as FileTypeKey[]
      const currentIndex = types.indexOf(selectedFileType)
      const nextIndex = event.shiftKey
        ? (currentIndex - 1 + types.length) % types.length
        : (currentIndex + 1) % types.length
      setSelectedFileType(types[nextIndex])
    }
  }

  const handleResultClick = () => {
    if (search.trim()) {
      addRecentSearch(search.trim())
    }
    setShowSearch(false)
    setSearch("")
  }

  const handleRecentSearchClick = (recentSearch: string) => {
    setSearch(recentSearch)
    inputRef.current?.focus()
  }

  const showRecentSearches = !search.trim() && recentSearches.length > 0

  return (
    <>
      {showSearch && (
        <div id="search">
          {/* Backdrop */}
          <div
            className="w-full h-full fixed top-0 left-0 bg-neutral-300/40 dark:bg-black/60 z-[55] backdrop-blur-sm"
            onClick={handleEscape}
            role="presentation"
            aria-hidden="true"
          />

          {/* Modal */}
          <div
            className="fixed top-14 w-[95vw] sm:w-[90vw] lg:w-[46rem] left-1/2 transform -translate-x-1/2 bg-white dark:bg-[#121212] rounded-xl border border-[#E0E0E0] dark:border-[#2a2a2a] z-[56] flex flex-col overflow-hidden shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Search files"
          >
            {/* Search input */}
            <div className="flex items-center border-b border-gray-200 dark:border-[#252525] px-4 py-2 gap-2">
              <Image
                src="/img/search.svg"
                width={20}
                height={20}
                alt=""
                className="opacity-50 dark:invert flex-shrink-0"
              />
              <label htmlFor="search-input" className="sr-only">
                Search for files
              </label>
              <input
                id="search-input"
                ref={inputRef}
                className="flex-1 h-10 outline-none bg-transparent dark:text-[#e5e5e5] dark:placeholder-[#6b6b6b] text-base"
                type="text"
                placeholder="Rechercher un fichier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Search files"
                aria-autocomplete="list"
                aria-controls="search-results"
                aria-activedescendant={selectedIndex >= 0 ? `search-result-${selectedIndex}` : undefined}
              />
              {search && (
                <button
                  className="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-[#6b6b6b] dark:hover:text-[#e5e5e5] rounded-md hover:bg-gray-100 dark:hover:bg-[#252525] transition-colors"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  type="button"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
              <kbd className="hidden sm:inline-block px-2 py-1 text-xs font-mono text-gray-500 dark:text-[#6b6b6b] bg-gray-100 dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#252525] rounded">
                Esc
              </kbd>
            </div>

            {/* File type filters */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-[#252525] overflow-x-auto">
              {(Object.entries(FILE_TYPES) as [FileTypeKey, { label: string; extensions: string[] }][]).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => setSelectedFileType(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                    selectedFileType === key
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 dark:bg-[#1a1a1a] text-gray-600 dark:text-[#a0a0a0] hover:bg-gray-200 dark:hover:bg-[#252525]"
                  }`}
                  type="button"
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto text-xs text-gray-400 dark:text-[#6b6b6b] hidden sm:inline">
                Tab pour changer
              </span>
            </div>

            {/* Recent searches */}
            {showRecentSearches && (
              <div className="px-4 py-3 border-b border-gray-200 dark:border-[#252525]">
                <h3 className="text-xs font-medium text-gray-500 dark:text-[#6b6b6b] uppercase tracking-wide mb-2">
                  Recherches récentes
                </h3>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((recentSearch, index) => (
                    <button
                      key={index}
                      onClick={() => handleRecentSearchClick(recentSearch)}
                      className="px-2.5 py-1 text-sm bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-[#a0a0a0] rounded-md hover:bg-gray-200 dark:hover:bg-[#252525] transition-colors"
                      type="button"
                    >
                      {recentSearch}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            <div
              id="search-results"
              ref={resultsRef}
              className="flex flex-col overflow-y-auto max-h-[50vh] min-h-[200px]"
              role="listbox"
              aria-label="Search results"
            >
              {filteredTree.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <svg className="w-16 h-16 text-gray-300 dark:text-[#2a2a2a] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-gray-500 dark:text-[#6b6b6b] text-lg font-medium">
                    Aucun résultat trouvé
                  </p>
                  <p className="text-gray-400 dark:text-[#4a4a4a] text-sm mt-1">
                    {search.trim()
                      ? `Aucun fichier ne correspond à "${search}"`
                      : "Commencez à taper pour rechercher"
                    }
                  </p>
                </div>
              ) : (
                <div className="py-2">
                  {filteredTree.slice(0, SEARCH_MAX_RESULTS).map((node, index) => {
                    const extension = getFileExtension(node.path)
                    const isSelected = index === selectedIndex

                    return (
                      <Link
                        id={`search-result-${index}`}
                        ref={isSelected ? selectedItemRef : null}
                        className={`flex items-center px-4 py-2.5 mx-2 rounded-lg transition-colors ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                            : "text-gray-700 dark:text-[#a0a0a0] hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
                        }`}
                        key={node.path}
                        href={encodeURL(node.path)}
                        onClick={handleResultClick}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <FileTypeIcon extension={extension} />
                        <span className="flex-1 truncate text-sm">
                          <HighlightedText text={sanitizePath(node.path)} indices={node.matchIndices} />
                        </span>
                        {isSelected && (
                          <kbd className="hidden sm:inline-block ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                            Enter
                          </kbd>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-[#252525] bg-gray-50 dark:bg-[#0a0a0a] text-xs text-gray-500 dark:text-[#6b6b6b]">
              <span>
                {filteredTree.length} résultat{filteredTree.length !== 1 ? "s" : ""}
              </span>

              {/* Desktop keyboard hints */}
              <div className="hidden sm:flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 font-mono bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#252525] rounded text-[10px]">↑</kbd>
                  <kbd className="px-1.5 py-0.5 font-mono bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#252525] rounded text-[10px]">↓</kbd>
                  <span className="ml-1">naviguer</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 font-mono bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#252525] rounded text-[10px]">Enter</kbd>
                  <span className="ml-1">ouvrir</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 font-mono bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#252525] rounded text-[10px]">Tab</kbd>
                  <span className="ml-1">filtrer</span>
                </span>
              </div>

              {/* Mobile close button */}
              <button
                className="sm:hidden px-3 py-1 bg-gray-200 dark:bg-[#252525] rounded-md font-medium"
                onClick={handleEscape}
                type="button"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search trigger button */}
      <button
        className={`flex justify-between items-center border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#121212] rounded-lg h-fit px-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#1a1a1a] hover:border-gray-300 dark:hover:border-[#3a3a3a] transition-all shadow-sm ${fullWidth ? "w-full" : "w-fit"} ${hideTrigger ? "hidden lg:flex" : ""}`}
        onClick={() => {
          setShowSearch(true)
          setRecentSearches(getRecentSearches())
        }}
        aria-label="Open search (Ctrl+K)"
        type="button"
      >
        <div className={`flex items-center text-gray-500 dark:text-[#6b6b6b] h-9 outline-none p-2 text-sm ${fullWidth ? "flex-1" : "w-32 sm:w-40"}`}>
          <Image
            src="/img/search.svg"
            width={18}
            height={18}
            alt=""
            className="mr-2 opacity-60 dark:invert"
          />
          <span className="truncate">Rechercher</span>
        </div>
        <kbd className="hidden sm:inline-block px-2 py-1 border border-gray-200 dark:border-[#252525] text-gray-500 dark:text-[#6b6b6b] bg-gray-50 dark:bg-[#1a1a1a] font-mono text-[11px] rounded" aria-hidden="true">
          ⌘K
        </kbd>
      </button>
    </>
  )
}
