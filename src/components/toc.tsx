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
          ? "text-[var(--c-text-1)] font-normal border-[var(--c-text-3)]"
          : "text-[var(--c-text-2)] hover:text-[var(--c-text-1)] border-transparent"
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
      className={`hidden min-w-16 xl:block bg-[var(--c-bg)] overflow-hidden h-full border-l border-[var(--c-border)]
        transition-[width] duration-300 ease-in-out
        ${!isOpen ? "w-16" : "w-[22rem]"}`}
    >
      {/* Header — always visible */}
      <div className={`flex items-center transition-all duration-300 ease-in-out ${isOpen ? "justify-between px-4 pt-6 pb-4" : "justify-center pt-5"}`}>
        <h2 className={`text-sm font-semibold text-[var(--c-text-1)] whitespace-nowrap transition-all duration-300 ease-in-out ${isOpen ? "opacity-100 max-w-full" : "opacity-0 max-w-0 overflow-hidden"}`}>
          Contents
        </h2>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 hover:bg-[var(--c-surface-hover)] rounded transition-colors"
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
            <h3 className="text-xs font-medium text-[var(--c-text-3)] mb-2 uppercase tracking-wide">Recently Updated</h3>
            <div className="space-y-2">
              {recentFiles.map((file, index) => (
                <Link
                  key={index}
                  href={file.path}
                  className="block text-[13px] text-[var(--c-text-2)] hover:text-[var(--c-text-1)] truncate transition-colors"
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
          <div className="px-4 mb-6 pb-6 border-b border-[var(--c-border)]">
            <h2 className="text-sm font-semibold text-[var(--c-text-1)] mb-3">Trending Tags</h2>
            <div className="flex flex-wrap gap-2">
              {trendingTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 text-xs rounded-full bg-[var(--c-surface-hover)] text-[var(--c-text-2)] hover:bg-[var(--c-border)] transition-colors"
                  >
                    {tag}
                  </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata bubbles */}
        {Object.keys(metadata).length > 0 && (
          <div className="px-4 mb-5 pb-5 border-b border-[var(--c-border)]">
            <h3 className="text-xs font-medium text-[var(--c-text-3)] mb-3 uppercase tracking-wide">
              About
            </h3>
            <div className="flex flex-col gap-2">
              {/* Non-tag, non-title scalar fields */}
              {(["type", "domain", "created"] as const).map((key) => {
                const raw = metadata[key]
                if (!raw || Array.isArray(raw)) return null
                // Strip surrounding quotes added by some YAML parsers
                const val = String(raw).replace(/^["']|["']$/g, "")
                if (!val) return null
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-[var(--c-text-3)] w-14 shrink-0">
                      {key}
                    </span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--c-surface-hover)] text-[var(--c-text-2)]">
                      {val}
                    </span>
                  </div>
                )
              })}
              {/* Tags */}
              {(() => {
                const raw = metadata["tags"]
                if (!raw) return null
                // Handle both real arrays and strings like "[a, b, c]"
                let tagList: string[]
                if (Array.isArray(raw)) {
                  tagList = raw.map((t) => String(t).trim()).filter(Boolean)
                } else {
                  const s = String(raw).trim()
                  const inner = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s
                  tagList = inner.split(",").map((t) => t.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
                }
                if (tagList.length === 0) return null

                const COLORS = [
                  "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
                  "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
                  "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
                  "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
                  "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
                  "bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
                ]

                return (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {tagList.map((tag, i) => (
                      <span
                        key={tag}
                        className={`px-2 py-0.5 text-[11px] rounded border ${COLORS[i % COLORS.length]}`}
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
