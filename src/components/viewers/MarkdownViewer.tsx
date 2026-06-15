"use client"
import type { Post } from "@/utils/types"
import React, { useState, useEffect, useRef, useCallback } from "react"
import Breadcrumb from "../breadcrumb"
import { getAssetUrl } from "@/lib/assets"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import type { Components } from "react-markdown"
import Link from "next/link"
import dynamic from "next/dynamic"
import MermaidDiagram from "../MermaidDiagram"

const CodeBlock = dynamic(() => import("../CodeBlock"), {
  ssr: false,
  loading: () => (
    <pre className="bg-[var(--code-block-bg)] text-[var(--c-text-1)] p-6 overflow-x-auto m-0">
      <code />
    </pre>
  ),
})
import ArticleMetadata from "../ArticleMetadata"
import RelatedArticles from "../RelatedArticles"
import { CopyButton } from "../CopyButton"
import { PrevNext } from "../PrevNext"
import { BookmarkButton } from "../BookmarkButton"
import { AudioNarrator } from "../AudioNarrator"
import { ResumeReading } from "../ResumeReading"
import { GraphView } from "../GraphView"
import { useBionic } from "@/hooks/useBionic"
import { useReadingPrefs } from "@/hooks/usePrefs"
import { markAsRead, saveScrollPosition } from "@/lib/user-prefs"

// Custom components for react-markdown to match MDX styling
// Extract plain text from React children for generating heading IDs
function getTextContent(children: React.ReactNode): string {
  if (typeof children === "string") return children
  if (typeof children === "number") return String(children)
  if (Array.isArray(children)) return children.map(getTextContent).join("")
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode }
    if (props.children) return getTextContent(props.children)
  }
  return ""
}

function headingId(children: React.ReactNode): string {
  return getTextContent(children).toLowerCase().replace(/\s+/g, "-")
}

// Walk all text nodes in a container and wrap matches in <mark> elements
function markText(container: Element, term: string): HTMLElement[] {
  const marks: HTMLElement[] = []
  const termLower = term.toLowerCase()
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  let node: Node | null
  while ((node = walker.nextNode())) {
    if (node.textContent?.toLowerCase().includes(termLower)) {
      // Skip nodes inside code blocks
      const parent = (node as Text).parentElement
      if (parent?.closest("pre, code")) continue
      textNodes.push(node as Text)
    }
  }

  textNodes.forEach((textNode) => {
    const text = textNode.textContent || ""
    const parent = textNode.parentNode
    if (!parent) return

    const fragment = document.createDocumentFragment()
    let lastIdx = 0
    let idx = text.toLowerCase().indexOf(termLower)

    while (idx !== -1) {
      fragment.appendChild(document.createTextNode(text.slice(lastIdx, idx)))
      const mark = document.createElement("mark")
      mark.className = "bg-amber-400/30 text-amber-200 rounded px-0.5"
      mark.textContent = text.slice(idx, idx + term.length)
      fragment.appendChild(mark)
      marks.push(mark)
      lastIdx = idx + term.length
      idx = text.toLowerCase().indexOf(termLower, lastIdx)
    }
    fragment.appendChild(document.createTextNode(text.slice(lastIdx)))
    parent.replaceChild(fragment, textNode)
  })

  return marks
}

function estimateReadingTime(text: string): number {
  const words = text.replace(/[#*`_[\]()>!]/g, '').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

function PreBlock({ children }: { children?: React.ReactNode }) {
  const codeElement = React.Children.toArray(children).find(
    React.isValidElement
  ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined

  if (!codeElement) {
    return (
      <pre className="bg-[var(--code-block-bg)] text-[var(--c-text-1)] p-4 rounded-lg overflow-x-auto my-4">
        {children}
      </pre>
    )
  }

  const className = codeElement.props.className || ""
  const match = /language-(\w+)/.exec(className)
  const language = match ? match[1] : "text"
  const codeString = String(codeElement.props.children).replace(/\n$/, "")

  if (language === "mermaid") {
    return <MermaidDiagram chart={codeString} />
  }

  return (
    <div className="relative my-4 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-[var(--c-surface-hover)] px-3 py-1">
        <span className="text-[var(--c-text-2)] text-xs font-mono">{language}</span>
        <CopyButton code={codeString} />
      </div>
      <CodeBlock language={language} code={codeString} />
    </div>
  )
}

const markdownComponents: Components = {
  h1: ({ node: _node, children, ...props }) => (
    <h1 id={headingId(children)} className="group text-3xl font-medium mt-4 mb-4 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h1>
  ),
  h2: ({ node: _node, children, ...props }) => (
    <h2 id={headingId(children)} className="group text-2xl font-medium mt-6 mb-3 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h2>
  ),
  h3: ({ node: _node, children, ...props }) => (
    <h3 id={headingId(children)} className="group text-2xl font-medium mt-4 mb-2 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h3>
  ),
  h4: ({ node: _node, children, ...props }) => (
    <h4 id={headingId(children)} className="group text-xl font-medium mt-3 mb-1 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h4>
  ),
  h5: ({ node: _node, children, ...props }) => (
    <h5 id={headingId(children)} className="group text-lg font-medium mt-2 mb-1 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h5>
  ),
  h6: ({ node: _node, children, ...props }) => (
    <h6 id={headingId(children)} className="group text-base font-medium mt-1 mb-1 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h6>
  ),
  p: ({ node: _node, children, ...props }) => (
    <p className="text-base font-normal leading-7 text-[var(--c-text-2)]" {...props}>
      {children}
    </p>
  ),
  a: ({ node: _node, href, children, ...props }) => {
    const className = "text-blue-500 hover:text-blue-700"
    if (href?.startsWith("/")) {
      return (
        <Link href={href} className={className}>
          {children}
        </Link>
      )
    }
    if (href?.startsWith("#")) {
      return (
        <a href={href} className={className} {...props}>
          {children}
        </a>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...props}>
        {children}
      </a>
    )
  },
  ul: ({ node: _node, children, ...props }) => (
    <ul className="list-disc pl-8 text-[var(--c-text-2)]" {...props}>
      {children}
    </ul>
  ),
  ol: ({ node: _node, children, ...props }) => (
    <ol className="list-decimal pl-8 text-[var(--c-text-2)]" {...props}>
      {children}
    </ol>
  ),
  li: ({ node: _node, children, ...props }) => (
    <li className="text-md leading-7 text-[var(--c-text-2)]" {...props}>
      {children}
    </li>
  ),
  table: ({ node: _node, children, ...props }) => (
    // Wrapper lets wide tables scroll horizontally on narrow viewports instead
    // of forcing the whole article to scroll sideways.
    <div className="my-2 -mx-4 sm:mx-0 overflow-x-auto">
      <table
        className="w-full min-w-max text-sm text-left rtl:text-right text-[var(--c-text-2)] border border-[var(--c-border)] rounded border-spacing-0 border-separate"
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ node: _node, children, ...props }) => (
    <th className="px-3 sm:px-6 p-2 bg-[var(--c-surface-hover)]" {...props}>
      {children}
    </th>
  ),
  td: ({ node: _node, children, ...props }) => (
    <td className="p-2 px-3 sm:px-6" {...props}>
      {children}
    </td>
  ),
  thead: ({ node: _node, children, ...props }) => (
    <thead className="text-md text-[var(--c-text-1)] font-medium" {...props}>
      {children}
    </thead>
  ),
  tr: ({ node: _node, children, ...props }) => (
    <tr className="border border-[var(--c-border)]" {...props}>
      {children}
    </tr>
  ),
  strong: ({ node: _node, children, ...props }) => (
    <strong className="font-medium text-[var(--c-text-1)]" {...props}>
      {children}
    </strong>
  ),
  em: ({ node: _node, children, ...props }) => (
    <em className="font-medium" {...props}>
      {children}
    </em>
  ),
  code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
    if (inline) {
      return (
        <code className="bg-[var(--c-surface-hover)] text-[var(--c-text-1)] px-1.5 py-0.5 rounded text-sm font-mono border border-[var(--c-border)]" {...props}>
          {children}
        </code>
      )
    }
    return <code className={className}>{children}</code>
  },
  pre: ({ children }: { children?: React.ReactNode }) => <PreBlock>{children}</PreBlock>,
  blockquote: ({ node: _node, children, ...props }) => (
    <blockquote className="border-l-4 border-[var(--c-border)] pl-4" {...props}>
      {children}
    </blockquote>
  ),
  img: ({ node: _node, src, alt, ...props }) => {
    // Security: only allow relative paths or trusted domains
    let imgSrc = "/placeholder.svg"
    if (typeof src === "string") {
      if (src.startsWith("/")) {
        // Relative path starting with /
        imgSrc = src
      } else if (src.startsWith("http://") || src.startsWith("https://")) {
        // Only allow trusted domains
        const trustedDomains = ["pensine.nebula.li", "nebula.li", "assets.nebula.li", "upload.wikimedia.org", "wikipedia.org"]
        try {
          const url = new URL(src)
          if (trustedDomains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
            imgSrc = src
          }
        } catch {
          // Invalid URL, use fallback
        }
      } else if (!src.includes("..") && !src.includes("://")) {
        // Simple relative path without traversal
        imgSrc = getAssetUrl(src)
      }
    }
    return (
      <span className="flex flex-col w-full items-center py-5 md:py-10">
        {/* min-h reserves a slot before the image loads to keep CLS low.
            The bg color doubles as a skeleton placeholder. */}
        <img
          src={imgSrc}
          alt={alt || "Image"}
          loading="lazy"
          decoding="async"
          className="w-full md:w-2/3 md:max-w-[50vw] min-h-[150px] rounded-lg bg-[var(--c-surface)]"
          {...props}
        />
        {alt && (
          <span className="block pt-3 font-dmsans text-sm text-center text-[var(--c-text-3)] mb-5">
            {alt}
          </span>
        )}
      </span>
    )
  },
}

interface MarkdownViewerProps {
  post: Post
  formattedPath: string
}

export default function MarkdownViewer({ post, formattedPath }: MarkdownViewerProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const [scrollPct, setScrollPct] = useState(0)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [highlightTerm, setHighlightTerm] = useState("")
  const [highlightCount, setHighlightCount] = useState(0)
  const [graphOpen, setGraphOpen] = useState(false)
  const prefs = useReadingPrefs()

  // post.body is already frontmatter-stripped at build time (lib/posts.ts).
  const markdownContent = post.body
  const totalMinutes = estimateReadingTime(markdownContent)

  // Throttle scroll-position persistence: write once per ~1s of activity.
  const lastSavedRef = useRef(0)
  const handleScroll = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const scrollable = scrollHeight - clientHeight
    if (scrollable > 0) {
      setScrollPct((scrollTop / scrollable) * 100)
      setShowBackToTop(scrollTop > 300)
    }
    const now = Date.now()
    if (now - lastSavedRef.current > 1000) {
      lastSavedRef.current = now
      saveScrollPosition(post.path, scrollTop)
    }
  }, [post.path])

  // Mark article as read on mount.
  useEffect(() => {
    markAsRead(post.path)
  }, [post.path])

  // Apply bionic reading (toggle).
  useBionic(prefs.bionic, articleRef, [markdownContent])

  // Read highlight term from URL query param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setHighlightTerm(params.get("highlight") ?? "")
  }, [])

  // Keyboard shortcut: `g` opens the graph view, Esc closes it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setGraphOpen((v) => !v)
      } else if (e.key === "Escape" && graphOpen) {
        setGraphOpen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [graphOpen])

  // Apply DOM-based highlights after content is rendered
  useEffect(() => {
    if (!highlightTerm || !contentRef.current) return
    const articleEl = contentRef.current.querySelector("article")
    if (!articleEl) return

    const marks = markText(articleEl, highlightTerm)
    setHighlightCount(marks.length)

    if (marks.length > 0) {
      marks[0].scrollIntoView({ behavior: "smooth", block: "center" })
    }

    return () => {
      marks.forEach((mark) => {
        const parent = mark.parentNode
        if (parent) {
          parent.replaceChild(document.createTextNode(mark.textContent || ""), mark)
          parent.normalize()
        }
      })
      setHighlightCount(0)
    }
  }, [highlightTerm, markdownContent])

  // Editorial-theme sidenotes: lift markdown footnotes (rendered by remark-gfm
  // as a <section data-footnotes>...) into <aside.sidenote> blocks adjacent to
  // their references, so the CSS can float them into the right margin (Tufte
  // style). Skipped in any other theme. Re-runs whenever the markdown body or
  // the active theme changes.
  useEffect(() => {
    if (typeof window === "undefined") return
    const articleEl = articleRef.current
    if (!articleEl) return

    const apply = () => {
      // Clean up any sidenotes we previously injected — keeps the DOM idempotent
      // across renders / theme toggles.
      articleEl.querySelectorAll("aside.sidenote[data-pensine-injected]").forEach((n) => n.remove())

      if (!document.documentElement.classList.contains("editorial")) return

      const refs = articleEl.querySelectorAll<HTMLElement>('[id^="user-content-fnref-"]')
      if (refs.length === 0) return

      refs.forEach((ref, i) => {
        const link = ref.tagName === "A" ? ref : ref.querySelector("a[href^='#user-content-fn-']")
        if (!link) return
        const href = (link.getAttribute("href") || "").slice(1)
        if (!href) return
        const def = articleEl.querySelector(`[id='${CSS.escape(href)}']`)
        if (!def) return

        const clone = def.cloneNode(true) as HTMLElement
        clone.querySelectorAll("a[href^='#user-content-fnref-']").forEach((a) => a.remove())

        const aside = document.createElement("aside")
        aside.className = "sidenote"
        aside.setAttribute("data-pensine-injected", "true")
        const num = document.createElement("span")
        num.className = "sidenote-num"
        num.textContent = String(i + 1)
        aside.appendChild(num)
        while (clone.firstChild) aside.appendChild(clone.firstChild)

        // Insert after the <sup> wrapping the reference (or after the ref itself).
        const supParent = ref.closest("sup") || ref
        supParent.after(aside)
      })
    }

    apply()

    // Observe theme class changes on <html> so toggling editorial on/off
    // immediately reflows the sidenotes without a page reload.
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [markdownContent])

  const minutesRemaining = Math.max(0, Math.ceil(totalMinutes * (1 - scrollPct / 100)))

  return (
    <div ref={contentRef} onScroll={handleScroll} className="w-full pt-0 px-4 sm:px-6 md:px-10 xl:px-20 pb-10 overflow-auto h-full bg-[var(--c-bg)]">
      {/* Scroll progress — pure CSS via scroll-timeline, no JS reflow per frame. */}
      <div className="sticky top-0 left-0 right-0 h-0.5 bg-[var(--c-border)] z-10 -mx-4 sm:-mx-6 md:-mx-10 xl:-mx-20 mb-0">
        <div className="h-full bg-[var(--c-text-3)] transition-[width] duration-150" style={{ width: `${scrollPct}%` }} />
      </div>
      {highlightTerm && (
        <div className="sticky top-0.5 z-10 -mx-4 sm:-mx-6 md:-mx-10 xl:-mx-20 mb-0">
          <div className="flex items-center justify-between px-4 py-1.5 bg-amber-100/80 dark:bg-amber-950/80 border-b border-amber-300/40 dark:border-amber-800/40 backdrop-blur-sm">
            <span className="text-xs text-amber-800 dark:text-amber-300">
              {highlightCount > 0
                ? `${highlightCount} occurrence${highlightCount > 1 ? "s" : ""} de « ${highlightTerm} »`
                : `Aucune occurrence de « ${highlightTerm} »`}
            </span>
            <button
              type="button"
              onClick={() => {
                setHighlightTerm("")
                const url = new URL(window.location.href)
                url.searchParams.delete("highlight")
                window.history.replaceState({}, "", url.toString())
              }}
              className="text-amber-500 hover:text-amber-300 text-xs transition-colors"
              aria-label="Fermer le surlignage"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <ResumeReading path={post.path} containerRef={contentRef} />
      <Breadcrumb formattedPath={formattedPath} />
      <div className="flex items-start justify-between gap-3 my-2">
        <h2 className="text-2xl sm:text-3xl text-left font-medium text-[var(--c-text-1)] flex-1 min-w-0 break-words">
          {post.title.replace(/\.mdx?$/i, "")}
        </h2>
        <div className="flex items-center gap-0.5 shrink-0 pt-1.5">
          <BookmarkButton path={post.path} />
          <AudioNarrator getText={() => articleRef.current?.innerText ?? ""} />
          <button
            onClick={() => setGraphOpen(true)}
            className="p-1.5 rounded-md hover:bg-[var(--c-surface-hover)] transition-colors text-[var(--c-text-3)] hover:text-[var(--c-text-1)]"
            aria-label="Voir le graphe des connexions"
            title="Graphe (g)"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2" />
              <circle cx="4" cy="6" r="2" />
              <circle cx="20" cy="6" r="2" />
              <circle cx="4" cy="18" r="2" />
              <circle cx="20" cy="18" r="2" />
              <line x1="12" y1="12" x2="4" y2="6" />
              <line x1="12" y1="12" x2="20" y2="6" />
              <line x1="12" y1="12" x2="4" y2="18" />
              <line x1="12" y1="12" x2="20" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <p className="text-xs text-[var(--c-text-3)] mb-3">
        {totalMinutes} min de lecture
        {scrollPct > 5 && scrollPct < 95 && (
          <span className="ml-2 opacity-70">· ~{minutesRemaining} min restantes</span>
        )}
      </p>
      {/* Mobile-only metadata (tags / type / domain). On lg+ the TOC sidebar
          renders the same metadata in its "About" block, so we hide this. */}
      {post.metadata && (
        <ArticleMetadata
          metadata={post.metadata}
          variant="inline"
          className="lg:hidden mb-6"
        />
      )}
      <article ref={articleRef} className="max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {markdownContent}
        </ReactMarkdown>
      </article>
      <PrevNext currentPath={post.path} />
      <RelatedArticles currentPath={post.path} />
      {showBackToTop && (
        <button
          onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))] z-50 p-2.5 bg-[var(--c-surface-hover)] hover:bg-[var(--c-border)] border border-[var(--c-border)] rounded-full text-[var(--c-text-2)] hover:text-[var(--c-text-1)] transition-all shadow-lg"
          aria-label="Retour en haut"
          type="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}
      {graphOpen && <GraphView currentPath={post.path} onClose={() => setGraphOpen(false)} />}
    </div>
  )
}
