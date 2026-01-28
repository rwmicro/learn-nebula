"use client"
import type { Post } from "@/utils/types"
import React, { useState, useEffect } from "react"
import Breadcrumb from "../breadcrumb"
import { logger } from "@/lib/logger"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import type { Components } from "react-markdown"
import Link from "next/link"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"

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

const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1 id={headingId(children)} className="text-3xl font-medium mt-4 mb-4 text-[#1b1b1b] dark:text-[#e5e5e5]" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 id={headingId(children)} className="text-2xl font-medium mt-6 mb-3 text-[#1b1b1b] dark:text-[#e5e5e5]" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 id={headingId(children)} className="text-2xl font-medium mt-4 mb-2 text-[#1b1b1b] dark:text-[#e5e5e5]" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 id={headingId(children)} className="text-xl font-medium mt-3 mb-1 text-[#1b1b1b] dark:text-[#e5e5e5]" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 id={headingId(children)} className="text-lg font-medium mt-2 mb-1 text-[#1b1b1b] dark:text-[#e5e5e5]" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 id={headingId(children)} className="text-base font-medium mt-1 mb-1 text-[#1b1b1b] dark:text-[#e5e5e5]" {...props}>
      {children}
    </h6>
  ),
  p: ({ children, ...props }) => (
    <p className="text-base font-normal leading-7 text-[#222222] dark:text-[#a0a0a0]" {...props}>
      {children}
    </p>
  ),
  a: ({ href, children, ...props }) => {
    const className = "text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
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
    <ul className="list-disc pl-8 text-[#404040] dark:text-[#a0a0a0]" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-8 text-[#404040] dark:text-[#a0a0a0]" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-md leading-7 text-[#404040] dark:text-[#a0a0a0]" {...props}>
      {children}
    </li>
  ),
  table: ({ children, ...props }) => (
    <table
      className="w-full text-sm text-left rtl:text-right text-neutral-700 dark:text-[#a0a0a0] border border-neutral-200 dark:border-[#2a2a2a] rounded border-spacing-0 border-separate my-2 overflow-hidden"
      {...props}
    >
      {children}
    </table>
  ),
  thead: ({ children, ...props }) => (
    <thead className="text-md text-neutral-900 dark:text-[#e5e5e5] font-medium" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-6 p-2 bg-neutral-200 dark:bg-[#1a1a1a]" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="p-2 px-6" {...props}>
      {children}
    </td>
  ),
  tr: ({ children, ...props }) => (
    <tr className="border dark:border-[#2a2a2a]" {...props}>
      {children}
    </tr>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-medium text-black dark:text-[#e5e5e5]" {...props}>
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
        <code className="bg-gray-100 dark:bg-[#2a2a2a] text-gray-800 dark:text-[#e5e5e5] px-1.5 py-0.5 rounded text-sm font-mono border border-gray-200 dark:border-[#3a3a3a]" {...props}>
          {children}
        </code>
      )
    }
    return <code className={className}>{children}</code>
  },
  pre: ({ children }: { children?: React.ReactNode }) => {
    const codeElement = React.Children.toArray(children).find(
      (child) => React.isValidElement(child) && child.type === "code"
    ) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined

    if (!codeElement) {
      return (
        <pre className="bg-[var(--code-block-bg)] text-white p-4 rounded-lg overflow-x-auto my-4">
          {children}
        </pre>
      )
    }

    const className = codeElement.props.className || ""
    const match = /language-(\w+)/.exec(className)
    const language = match ? match[1] : "text"
    const codeString = String(codeElement.props.children).replace(/\n$/, "")

    return (
      <div className="relative my-4 rounded-lg overflow-hidden">
        <span className="absolute top-0 right-0 bg-gray-700 text-gray-200 text-xs font-mono px-3 py-1 rounded-bl-lg z-10">
          {language}
        </span>
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            borderRadius: "0.5rem",
            padding: "1.5rem",
            paddingTop: "2.5rem",
            background: "var(--code-block-bg, #263238)",
          }}
          showLineNumbers={false}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    )
  },
  blockquote: ({ children, ...props }) => (
    <blockquote className="border-l-4 border-gray-400 dark:border-[#252525] pl-4" {...props}>
      {children}
    </blockquote>
  ),
  img: ({ src, alt, ...props }) => {
    // Security: only allow relative paths or trusted domains
    let imgSrc = "/placeholder.png"
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
        imgSrc = `/articles/pensine/${src}`
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
          <span className="block pt-3 font-dmsans text-sm text-center text-gray-500 dark:text-[#6b6b6b] mb-5">
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
          const content = await response.text()
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
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-auto h-full bg-[#F9F9F9] dark:bg-[#0a0a0a]">
        <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
        <h2 className="text-3xl text-left font-medium py-2 dark:text-[#e5e5e5]">{post.title}</h2>
        <p className="dark:text-[#a0a0a0]">Chargement...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll h-full bg-[#F9F9F9] dark:bg-[#0a0a0a]">
        <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
        <h2 className="text-3xl text-left font-medium py-2 dark:text-[#e5e5e5]">{post.title}</h2>
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
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll h-full bg-[#F9F9F9] dark:bg-[#0a0a0a]">
        <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
        <h2 className="text-3xl text-left font-medium my-2 dark:text-[#e5e5e5]">{post.title.replace(/\.md$/i, "")}</h2>
        <article className="max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {markdownContent}
          </ReactMarkdown>
        </article>
      </div>
    )
  }

  // Render .mdx files using imported component
  if (fileExtension === "mdx" && ArticleComponent) {
    return (
      <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll h-full bg-[#F9F9F9] dark:bg-[#0a0a0a]">
        <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
        <h2 className="text-3xl text-left font-medium my-2 dark:text-[#e5e5e5]">{post.title.replace(/\.mdx$/i, "")}</h2>
        <article className="prose dark:prose-invert max-w-none">
          <ArticleComponent />
        </article>
      </div>
    )
  }

  // Fallback: No content available
  return (
    <div className="w-full p-4 pt-0 px-10 xl:px-20 pb-5 overflow-scroll h-full bg-[#F9F9F9] dark:bg-[#0a0a0a]">
      <Breadcrumb formattedPath={formattedPath} currentPath={post.path} />
      <h2 className="text-3xl text-left font-medium py-2 dark:text-[#e5e5e5]">{post.title}</h2>
      <div className="text-gray-500 dark:text-[#6b6b6b] p-4">
        <p>Content not available</p>
      </div>
    </div>
  )
}
