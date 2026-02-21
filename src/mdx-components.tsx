import type { MDXComponents } from "mdx/types"
import Link from "next/link"
import type { ComponentPropsWithoutRef } from "react"
import React from "react"
import MermaidDiagram from "./components/MermaidDiagram"

type AnchorProps = ComponentPropsWithoutRef<"a">

interface ImageWithCaptionProps extends ComponentPropsWithoutRef<"img"> {
  src: string
  alt: string
}

function ImageWithCaption({ src, alt, ...props }: ImageWithCaptionProps) {
  const parts = alt.split("|")
  const [size, link, ...description] = parts.length === 3 ? parts : [null, alt, ""]

  // This regex matches any substring in 'link' that starts with 'http:/' or 'https:/'
  // and continues until the next whitespace character. It is used to detect and extract URLs with a single slash after the colon.
  const linkRegex = /(https?:\/[^\s]+)/g
  const linkMatch = link.match(linkRegex)

  let width, height
  if (size) {
    const [w, h] = size.split("x")
    width = w ? Number.parseInt(w) : undefined
    height = h ? Number.parseInt(h) : undefined
  }

  // Use div instead of figure to avoid HTML nesting issues
  return (
    <span className="flex flex-col w-full items-center py-5 md:py-10">
      <img
        src={linkMatch ? src : "/articles/pensine/" + src}
        alt={description.join("|") || "Image"}
        width={width || 800}
        height={height || 800}
        className="w-full md:w-2/3 md:max-w-[50vw] rounded-lg"
        {...props}
      />
      <span className="block pt-3 font-dmsans text-sm text-center text-gray-500 mb-5">
        <span>{description}</span>
        {linkMatch && (
          <span>
            <br />© Sources :{" "}
            <a href={linkMatch[0]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              {linkMatch[0]}
            </a>
          </span>
        )}
      </span>
    </span>
  )
}

const components: MDXComponents = {
  // Handle images directly
  img: ({ src, alt, ...props }: ComponentPropsWithoutRef<"img">) => {
    if (!src) {
      // Fix type errors: ensure src is always a string
      return <img src={typeof src === "string" && src ? src : "/placeholder.svg"} alt={alt ?? ""} {...props} />
    }
    return (
      <ImageWithCaption
        src={typeof src === "string" && src ? src : "/placeholder.svg"}
        alt={alt ?? ""}
        {...props}
      />
    )
  },

  // Override paragraph to handle standalone images
  p: ({ children }) => {
    // Check if the paragraph contains only an image
    if (React.Children.count(children) === 1 && React.isValidElement(children) && children.type === "img") {
      // Return the image directly without wrapping in p tag
      return <>{children}</>
    }

    return <p className="text-base font-normal leading-7 text-[#222222]">{children}</p>
  },
  a: ({ href, children, ...props }: AnchorProps) => {
    const className = "text-blue-500 hover:text-blue-700"
    if (href?.startsWith("/")) {
      return (
        <Link href={href} className={className} {...props}>
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
  h1: ({ children, ...props }) => {
    const id = typeof children === "string" ? children.toLowerCase().replace(/\s+/g, "-") : ""
    return (
      <h1 {...props} id={id} className="text-3xl font-medium mt-4 mb-4 text-[#1b1b1b]">
        {children}
      </h1>
    )
  },
  h2: ({ children, ...props }) => {
    const id = typeof children === "string" ? children.toLowerCase().replace(/\s+/g, "-") : ""
    return (
      <h2 {...props} id={id} className="text-2xl font-medium mt-6 mb-3 text-[#1b1b1b]">
        {children}
      </h2>
    )
  },
  h3: ({ children, ...props }) => {
    const id = typeof children === "string" ? children.toLowerCase().replace(/\s+/g, "-") : ""
    return (
      <h3 {...props} id={id} className="text-2xl font-medium mt-4 mb-2 text-[#1b1b1b]">
        {children}
      </h3>
    )
  },
  h4: ({ children, ...props }) => {
    const id = typeof children === "string" ? children.toLowerCase().replace(/\s+/g, "-") : ""
    return (
      <h4 {...props} id={id} className="text-xl font-medium mt-3 mb-1 text-[#1b1b1b]">
        {children}
      </h4>
    )
  },
  h5: ({ children, ...props }) => {
    const id = typeof children === "string" ? children.toLowerCase().replace(/\s+/g, "-") : ""
    return (
      <h5 {...props} id={id} className="text-lg font-medium mt-2 mb-1 text-[#1b1b1b]">
        {children}
      </h5>
    )
  },
  h6: ({ children, ...props }) => {
    const id = typeof children === "string" ? children.toLowerCase().replace(/\s+/g, "-") : ""
    return (
      <h6 {...props} id={id} className="text-base font-medium mt-1 mb-1 text-[#1b1b1b]">
        {children}
      </h6>
    )
  },

  em: (props: ComponentPropsWithoutRef<"em">) => <em className="font-medium" {...props} />,
  ul: ({ children, ...props }) => {
    return (
      <ul {...props} className="list-disc pl-8 text-[#404040]">
        {children}
      </ul>
    )
  },
  ol: ({ children, ...props }) => {
    return (
      <ol {...props} className="list-decimal pl-8 text-[#404040]">
        {children}
      </ol>
    )
  },
  li: ({ children, ...props }) => {
    return (
      <li {...props} className="text-md leading-7 text-[#404040]">
        {children}
      </li>
    )
  },
  strong: (props: ComponentPropsWithoutRef<"strong">) => <strong className="font-medium text-black" {...props} />,
  table: ({ children, ...props }) => {
    return (
      <table
        {...props}
        className="w-full text-sm text-left rtl:text-right text-neutral-700 border border-neutral-200 rounded border-spacing-0 border-separate my-2 overflow-hidden"
      >
        {children}
      </table>
    )
  },
  thead: ({ children, ...props }) => {
    return (
      <thead {...props} className="text-md text-neutral-900 font-medium">
        {children}
      </thead>
    )
  },
  th: ({ children, ...props }) => {
    return (
      <th {...props} className="px-6 p-2 bg-neutral-200">
        {children}
      </th>
    )
  },
  td: ({ children, ...props }) => {
    return (
      <td {...props} className="p-2 px-6">
        {children}
      </td>
    )
  },
  tr: ({ children, ...props }) => {
    return (
      <tr {...props} className="border">
        {children}
      </tr>
    )
  },

  code: ({ children, ...props }: ComponentPropsWithoutRef<"code">) => {
    return (
      <code {...props} className="bg-gray-100 dark:bg-[#1a1a1a] text-gray-800 dark:text-[#e5e5e5] px-1.5 py-0.5 rounded text-sm font-mono break-all overflow-scroll border border-gray-200 dark:border-[#2a2a2a]">
        {children}
      </code>
    )
  },

  blockquote: ({ children, ...props }) => {
    return (
      <blockquote {...props} className="border-l-4 border-gray-400 pl-4">
        {children}
      </blockquote>
    )
  },

  pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => {
    const mermaidCode = (props as Record<string, unknown>)["data-mermaid"]
    if (typeof mermaidCode === "string" && mermaidCode) {
      return <MermaidDiagram chart={mermaidCode} />
    }
    return (
      <pre {...props} className="bg-[#1e1e1e] text-white p-4 rounded-lg overflow-x-auto my-4 text-sm font-mono">
        {children}
      </pre>
    )
  },
}

export function useMDXComponents(): MDXComponents {
  return components
}
