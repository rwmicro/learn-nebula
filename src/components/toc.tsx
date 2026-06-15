"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import ArticleMetadata from "./ArticleMetadata"

interface Heading {
  text: string
  level: number
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
  metadata = {},
}: {
  toc: Heading[]
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
      data-toc-sidebar
      className={`hidden min-w-16 lg:block bg-[var(--c-bg)] overflow-hidden h-full border-l border-[var(--c-border)]
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
        {/* Metadata bubbles */}
        {Object.keys(metadata).length > 0 && (
          <div className="px-4 mb-5 pb-5 border-b border-[var(--c-border)]">
            <h3 className="text-xs font-medium text-[var(--c-text-3)] mb-3 uppercase tracking-wide">
              About
            </h3>
            <ArticleMetadata metadata={metadata} variant="stacked" />
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
