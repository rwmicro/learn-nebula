"use client"
import type { Post } from "@/utils/types"
import React, { useState, useEffect, useRef, useCallback } from "react"
import Breadcrumb from "../breadcrumb"
import { getAssetUrl } from "@/lib/assets"
import { logger } from "@/lib/logger"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import type { Components } from "react-markdown"
import Link from "next/link"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism"
import { useTheme } from "next-themes"
import MermaidDiagram from "../MermaidDiagram"
import RelatedArticles from "../RelatedArticles"
import { CopyButton } from "../CopyButton"
import { PrevNext } from "../PrevNext"

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
  const { resolvedTheme } = useTheme()
  const syntaxStyle = resolvedTheme === "dark" ? vscDarkPlus : vs

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
      <SyntaxHighlighter
        language={language}
        style={syntaxStyle}
        customStyle={{ margin: 0, borderRadius: "0", padding: "1.5rem", background: "var(--code-block-bg)" }}
        showLineNumbers={false}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  )
}

const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1 id={headingId(children)} className="group text-3xl font-medium mt-4 mb-4 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 id={headingId(children)} className="group text-2xl font-medium mt-6 mb-3 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 id={headingId(children)} className="group text-2xl font-medium mt-4 mb-2 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 id={headingId(children)} className="group text-xl font-medium mt-3 mb-1 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 id={headingId(children)} className="group text-lg font-medium mt-2 mb-1 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 id={headingId(children)} className="group text-base font-medium mt-1 mb-1 text-[var(--c-text-1)] flex items-center gap-2" {...props}>
      {children}
      <a href={`#${headingId(children)}`} className="opacity-0 group-hover:opacity-100 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-opacity font-normal text-xl" aria-label="Lien vers cette section">#</a>
    </h6>
  ),
  p: ({ children, ...props }) => (
    <p className="text-base font-normal leading-7 text-[var(--c-text-2)]" {...props}>
      {children}
    </p>
  ),
  a: ({ href, children, ...props }) => {
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
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-8 text-[var(--c-text-2)]" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-8 text-[var(--c-text-2)]" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-md leading-7 text-[var(--c-text-2)]" {...props}>
      {children}
    </li>
  ),
  table: ({ children, ...props }) => (
    <table
      className="w-full text-sm text-left rtl:text-right text-[var(--c-text-2)] border border-[var(--c-border)] rounded border-spacing-0 border-separate my-2 overflow-hidden"
      {...props}
    >
      {children}
    </table>
  ),
  thead: ({ children, ...props }) => (
    <thead className="text-md text-[var(--c-text-1)] font-medium" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-6 p-2 bg-[var(--c-surface-hover)]" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="p-2 px-6" {...props}>
      {children}
    </td>
  ),
  tr: ({ children, ...props }) => (
    <tr className="border border-[var(--c-border)]" {...props}>
      {children}
    </tr>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-medium text-[var(--c-text-1)]" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
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
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-4 border-[var(--c-border)] pl-4" {...props}>
      {children}
    </blockquote>
  ),
  img: ({ src, alt, ...props }) => {
    // Security: only allow relative paths or trusted domains
    let imgSrc = "/placeholder.svg"
    if (typeof src === "string") {
      if (src.startsWith("/")) {
        // Relative path starting with /
        imgSrc = src
      } else if (src.startsWith("http://") || src.startsWith("https://")) {
        // Only allow trusted domains
        const trustedDomains = ["pensine.nebula.li", "nebula.li", "upload.wikimedia.org", "wikipedia.org"]
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
        <img
          src={imgSrc}
          alt={alt || "Image"}
          className="w-full md:w-2/3 md:max-w-[50vw] rounded-lg"
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
  const [ArticleComponent, setArticleComponent] = useState<React.ComponentType | null>(null)
  const [markdownContent, setMarkdownContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const contentRef = useRef<HTMLDivElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [highlightTerm, setHighlightTerm] = useState("")
  const [highlightCount, setHighlightCount] = useState(0)

  const handleScroll = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const scrollable = scrollHeight - clientHeight
    if (scrollable > 0) {
      setScrollProgress((scrollTop / scrollable) * 100)
      setShowBackToTop(scrollTop > 300)
    }
  }, [])

  // Read highlight term from URL query param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setHighlightTerm(params.get("highlight") ?? "")
  }, [])

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
  }, [highlightTerm, markdownContent, ArticleComponent])

  const fileExtension = post.path.split(".").pop()?.toLowerCase() || ""

  useEffect(() => {
    const loadComponent = async () => {
      try {
        // Security: validate path doesn't contain traversal patterns
        const dangerousPatterns = ['..', '//', '\\', '\0', '%00', '%2e%2e']
        const lowerPath = post.path.toLowerCase()
        for (const pattern of dangerousPatterns) {
          if (lowerPath.includes(pattern)) {
            throw new Error("Invalid path")
          }
        }

        if (fileExtension === "md") {
          const response = await fetch(`/articles/pensine${post.path}`)
          if (!response.ok) {
            throw new Error("Failed to load content")
          }
          const raw = await response.text()
          // Strip YAML frontmatter before rendering
          const content = raw.startsWith("---")
            ? raw.replace(/^---[\s\S]*?\n---\n?/, "")
            : raw
          setMarkdownContent(content)
          setLoading(false)
        } else if (fileExtension === "mdx") {
          // Additional validation: only allow safe characters (Unicode letters, numbers, etc.)
          const cleanPath = post.path.replace(/\.mdx$/i, "").replace(/^\//, "")
          if (!/^[\p{L}\p{N}\-_/\s]+$/u.test(cleanPath)) {
            throw new Error("Invalid path")
          }
          const importedModule = await import(`../../../public/articles/pensine/${cleanPath}.mdx`)
          setArticleComponent(() => importedModule.default)
          setLoading(false)
        } else {
          setLoading(false)
        }
      } catch (err) {
        logger.error("Failed to load component", {
          error: err instanceof Error ? err.message : String(err),
        })
        // Generic error message to user
        setError("Failed to load content")
        setLoading(false)
      }
    }

    loadComponent()
  }, [post.path, fileExtension])

  if (loading) {
    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-auto h-full bg-[var(--c-bg)]">
        <Breadcrumb formattedPath={formattedPath} />
        <h2 className="text-3xl text-left font-medium py-2 text-[var(--c-text-1)]">{post.title}</h2>
        <p className="text-[var(--c-text-2)]">Chargement...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll h-full bg-[var(--c-bg)]">
        <Breadcrumb formattedPath={formattedPath} />
        <h2 className="text-3xl text-left font-medium py-2 text-[var(--c-text-1)]">{post.title}</h2>
        <div className="text-red-500 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <h3 className="font-semibold">Error loading content</h3>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  // Render .md files using react-markdown
  if (fileExtension === "md" && markdownContent) {
    return (
      <div ref={contentRef} onScroll={handleScroll} className="w-full p-4 pt-0 px-10 xl:px-20 pb-10 overflow-scroll h-full bg-[var(--c-bg)]">
        {/* Progress bar */}
        <div className="sticky top-0 left-0 right-0 h-0.5 bg-[var(--c-border)] z-10 -mx-10 xl:-mx-20 mb-0">
          <div className="h-full bg-[var(--c-text-3)] transition-all duration-150" style={{ width: `${scrollProgress}%` }} />
        </div>
        {/* Highlight banner */}
        {highlightTerm && (
          <div className="sticky top-0.5 z-10 -mx-10 xl:-mx-20 mb-0">
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
        <Breadcrumb formattedPath={formattedPath} />
        <h2 className="text-3xl text-left font-medium my-2 text-[var(--c-text-1)]">{post.title.replace(/\.md$/i, "")}</h2>
        <p className="text-xs text-[var(--c-text-3)] mb-6">{estimateReadingTime(markdownContent)} min de lecture</p>
        <article className="max-w-none">
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
            className="fixed bottom-6 right-6 z-50 p-2.5 bg-[var(--c-surface-hover)] hover:bg-[var(--c-border)] border border-[var(--c-border)] rounded-full text-[var(--c-text-2)] hover:text-[var(--c-text-1)] transition-all shadow-lg"
            aria-label="Retour en haut"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        )}
      </div>
    )
  }

  // Render .mdx files using imported component
  if (fileExtension === "mdx" && ArticleComponent) {
    return (
      <div ref={contentRef} onScroll={handleScroll} className="w-full p-4 pt-0 px-10 xl:px-20 pb-10 overflow-scroll h-full bg-[var(--c-bg)]">
        {/* Progress bar */}
        <div className="sticky top-0 left-0 right-0 h-0.5 bg-[var(--c-border)] z-10 -mx-10 xl:-mx-20 mb-0">
          <div className="h-full bg-[var(--c-text-3)] transition-all duration-150" style={{ width: `${scrollProgress}%` }} />
        </div>
        <Breadcrumb formattedPath={formattedPath} />
        <h2 className="text-3xl text-left font-medium my-2 text-[var(--c-text-1)]">{post.title.replace(/\.mdx$/i, "")}</h2>
        <article className="prose dark:prose-invert max-w-none">
          <ArticleComponent />
        </article>
        <PrevNext currentPath={post.path} />
        <RelatedArticles currentPath={post.path} />
        {showBackToTop && (
          <button
            onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-50 p-2.5 bg-[var(--c-surface-hover)] hover:bg-[var(--c-border)] border border-[var(--c-border)] rounded-full text-[var(--c-text-2)] hover:text-[var(--c-text-1)] transition-all shadow-lg"
            aria-label="Retour en haut"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        )}
      </div>
    )
  }

  // Fallback: No content available
  return (
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll h-full bg-[var(--c-bg)]">
      <Breadcrumb formattedPath={formattedPath} />
      <h2 className="text-3xl text-left font-medium py-2 text-[var(--c-text-1)]">{post.title}</h2>
      <div className="text-[var(--c-text-3)] p-4">
        <p>Content not available</p>
      </div>
    </div>
  )
}
