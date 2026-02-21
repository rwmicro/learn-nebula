"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import Link from "next/link"

interface Heading {
  text: string
  level: number
}

interface RecentFile {
  title: string
  path: string
  modifiedDate: Date
}

const TOCLink = ({ heading, activeId }: { heading: Heading; activeId: string }) => {
  const id = heading.text.toLowerCase().replace(/\s+/g, "-")
  const isActive = activeId === id

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
      window.history.pushState(null, "", `#${id}`)
    }
  }

  return (
    <a
      href={`#${id}`}
      onClick={handleClick}
      className={`
        block py-1.5 px-4 text-[13px] transition-colors duration-150 cursor-pointer border-l-2
        ${isActive
          ? "text-blue-600 dark:text-blue-400 font-normal border-blue-600 dark:border-blue-400"
          : "text-gray-600 dark:text-[#a0a0a0] hover:text-gray-900 dark:hover:text-[#e5e5e5] border-transparent"
        }
      `}
      style={{
        paddingLeft: `${16 + (heading.level - 1) * 12}px`,
      }}
    >
      {heading.text}
    </a>
  )
}

const TAG_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
]

export default function TOC({
  toc,
  recentFiles = [],
  trendingTags = [],
  metadata = {},
}: {
  toc: Heading[]
  recentFiles?: RecentFile[]
  trendingTags?: string[]
  metadata?: Record<string, string | string[]>
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [activeId, setActiveId] = useState("")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      {
        rootMargin: "-80px 0px -80% 0px",
      }
    )

    const headings = toc.map((heading) => {
      const id = heading.text.toLowerCase().replace(/\s+/g, "-")
      return document.getElementById(id)
    }).filter(Boolean) as HTMLElement[]

    headings.forEach((heading) => observer.observe(heading))

    return () => {
      headings.forEach((heading) => observer.unobserve(heading))
    }
  }, [toc])

  return (
    <div
      className={`hidden min-w-16 xl:block bg-[#F9F9F9] dark:bg-[#0a0a0a] overflow-hidden h-full border-l border-gray-200 dark:border-[#1f1f1f]
        transition-[width] duration-300 ease-in-out
        ${!isOpen ? "w-16" : "w-[22rem]"}`}
    >
      {/* Header — always visible */}
      <div className={`flex items-center transition-all duration-300 ease-in-out ${isOpen ? "justify-between px-4 pt-6 pb-4" : "justify-center pt-5"}`}>
        <h2 className={`text-sm font-semibold text-gray-700 dark:text-[#e5e5e5] whitespace-nowrap transition-all duration-300 ease-in-out ${isOpen ? "opacity-100 max-w-full" : "opacity-0 max-w-0 overflow-hidden"}`}>
          Contents
        </h2>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#1a1a1a] rounded transition-colors"
          aria-label={isOpen ? "Close table of contents" : "Open table of contents"}
        >
          <Image
            src="/img/sidebar.svg"
            alt="Toggle"
            width={20}
            height={20}
            className={`w-5 h-5 opacity-50 hover:opacity-100 dark:invert
              transition-transform duration-300 ease-in-out
              ${isOpen ? "rotate-180" : "rotate-0"}`}
          />
        </button>
      </div>

      {/* Content with fade animation */}
      <div
        className={`overflow-y-auto overflow-x-hidden
          transition-opacity duration-300 ease-in-out
          ${isOpen ? "opacity-100 h-[calc(100%-4rem)]" : "opacity-0 h-0 pointer-events-none"}`}
      >
        {/* Recently Updated Section */}
        {recentFiles.length > 0 && (
          <div className="px-4 mb-6">
            <h3 className="text-xs font-medium text-gray-500 dark:text-[#6b6b6b] mb-2 uppercase tracking-wide">Recently Updated</h3>
            <div className="space-y-2">
              {recentFiles.map((file, index) => (
                <Link
                  key={index}
                  href={file.path}
                  className="block text-[13px] text-gray-600 dark:text-[#a0a0a0] hover:text-gray-900 dark:hover:text-[#e5e5e5] truncate transition-colors"
                  title={file.title}
                >
                  {file.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Trending Tags Section */}
        {trendingTags.length > 0 && (
          <div className="px-4 mb-6 pb-6 border-b border-gray-200 dark:border-[#2a2a2a]">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-[#e5e5e5] mb-3">Trending Tags</h2>
            <div className="flex flex-wrap gap-2">
              {trendingTags.map((tag, index) => {
                const colors = [
                  'bg-blue-50 text-blue-700 hover:bg-blue-100',
                  'bg-purple-50 text-purple-700 hover:bg-purple-100',
                  'bg-green-50 text-green-700 hover:bg-green-100',
                  'bg-orange-50 text-orange-700 hover:bg-orange-100',
                  'bg-pink-50 text-pink-700 hover:bg-pink-100',
                ]
                const colorClass = colors[index % colors.length]

                return (
                  <button
                    key={tag}
                    onClick={() => {
                      console.log('Tag clicked:', tag)
                    }}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors cursor-pointer ${colorClass}`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Metadata bubbles */}
        {Object.keys(metadata).length > 0 && (
          <div className="px-4 mb-5 pb-5 border-b border-gray-200 dark:border-[#1f1f1f]">
            <h3 className="text-xs font-medium text-gray-400 dark:text-[#6b6b6b] mb-3 uppercase tracking-wide">
              About
            </h3>
            <div className="flex flex-col gap-2">
              {/* Non-tag, non-title scalar fields */}
              {(["type", "domain", "created"] as const).map((key) => {
                const val = metadata[key]
                if (!val || Array.isArray(val)) return null
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-[#6b6b6b] w-14 shrink-0">
                      {key}
                    </span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 dark:bg-[#1a1a1a] dark:text-[#a0a0a0]">
                      {val}
                    </span>
                  </div>
                )
              })}
              {/* Tags */}
              {(() => {
                const tags = metadata["tags"]
                if (!tags) return null
                const tagList = Array.isArray(tags) ? tags : [tags]
                return (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {tagList.map((tag, i) => (
                      <span
                        key={tag}
                        className={`px-2.5 py-0.5 text-xs rounded-full ${TAG_COLORS[i % TAG_COLORS.length]}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* TOC Links */}
        <nav>
          {toc.map((heading: Heading, index: number) => (
            <TOCLink key={index} heading={heading} activeId={activeId} />
          ))}
        </nav>
      </div>
    </div>
  )
}
