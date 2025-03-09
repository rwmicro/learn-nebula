import { MDXComponents } from "mdx/types"
import Link from "next/link"
import { ComponentPropsWithoutRef } from "react"
import { highlight } from "sugar-high"

type AnchorProps = ComponentPropsWithoutRef<"a">

interface ImageWithCaptionProps extends ComponentPropsWithoutRef<"img"> {
  src: string
  alt: string
}

const ImageWithCaption = ({ src, alt, ...props }: ImageWithCaptionProps) => {
  const parts = alt.split("|")
  const [size, link, ...description] =
    parts.length === 3 ? parts : [null, alt, ""]

  // Use regex to check if caption contains a link
  const linkRegex = /(https?:\/\/[^\s]+)/g
  const linkMatch = link.match(linkRegex)

  let width, height
  if (size) {
    const [w, h] = size.split("x")
    width = w ? parseInt(w) : undefined
    height = h ? parseInt(h) : undefined
  }

  return (
    <figure className="flex flex-col w-full items-center py-10">
      <img
        src={src}
        alt={description.join("|") || "Image"}
        width={width || 800}
        height={height || 800}
        className="w-2/3 max-w-[50vw] rounded-lg"
        {...props}
      />
      <figcaption className="pt-3 font-dmsans text-sm text-center text-gray-500 mb-5">
        <span>{description}</span>
        {linkMatch && (
          <span>
            <br />© Sources :{" "}
            <a
              href={linkMatch[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              {linkMatch[0]}
            </a>
          </span>
        )}
      </figcaption>
    </figure>
  )
}

const components: MDXComponents = {
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
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        {...props}
      >
        {children}
      </a>
    )
  },
  h1: ({ children, ...props }) => {
    const id =
      typeof children === "string"
        ? children.toLowerCase().replace(/\s+/g, "-")
        : ""
    return (
      <h1
        {...props}
        id={id}
        className="text-3xl font-medium mt-8 mb-4 text-[#1b1b1b]"
      >
        {children}
      </h1>
    )
  },
  h2: ({ children, ...props }) => {
    const id =
      typeof children === "string"
        ? children.toLowerCase().replace(/\s+/g, "-")
        : ""
    return (
      <h2
        {...props}
        id={id}
        className="text-2xl font-medium mt-6 mb-3 text-[#1b1b1b]"
      >
        {children}
      </h2>
    )
  },
  h3: ({ children, ...props }) => {
    const id =
      typeof children === "string"
        ? children.toLowerCase().replace(/\s+/g, "-")
        : ""
    return (
      <h3
        {...props}
        id={id}
        className="text-2xl font-medium mt-4 mb-2 text-[#1b1b1b]"
      >
        {children}
      </h3>
    )
  },
  h4: ({ children, ...props }) => {
    const id =
      typeof children === "string"
        ? children.toLowerCase().replace(/\s+/g, "-")
        : ""
    return (
      <h4
        {...props}
        id={id}
        className="text-xl font-medium mt-3 mb-1 text-[#1b1b1b]"
      >
        {children}
      </h4>
    )
  },
  h5: ({ children, ...props }) => {
    const id =
      typeof children === "string"
        ? children.toLowerCase().replace(/\s+/g, "-")
        : ""
    return (
      <h5
        {...props}
        id={id}
        className="text-lg font-medium mt-2 mb-1 text-[#1b1b1b]"
      >
        {children}
      </h5>
    )
  },
  h6: ({ children, ...props }) => {
    const id =
      typeof children === "string"
        ? children.toLowerCase().replace(/\s+/g, "-")
        : ""
    return (
      <h6
        {...props}
        id={id}
        className="text-base font-medium mt-1 mb-1 text-[#1b1b1b]"
      >
        {children}
      </h6>
    )
  },
  p: ({ children, ...props }) => {
    return (
      <p {...props} className="text-base font-normal leading-7 text-[#222222]">
        {children}
      </p>
    )
  },
  em: (props: ComponentPropsWithoutRef<"em">) => (
    <em className="font-medium" {...props} />
  ),
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
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-medium text-black" {...props} />
  ),
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
  img: (props: ComponentPropsWithoutRef<"img">) => {
    return <ImageWithCaption {...(props as ImageWithCaptionProps)} />
  },
  code: ({ children, ...props }: ComponentPropsWithoutRef<"code">) => {
    const codeHTML = highlight(children as string)
    return <code dangerouslySetInnerHTML={{ __html: codeHTML }} {...props} />
  },
  blockquote: ({ children, ...props }) => {
    return (
      <blockquote {...props} className="border-l-4 border-gray-400 pl-4">
        {children}
      </blockquote>
    )
  },
  pre: ({ children, ...props }) => {
    return (
      <pre
        {...props}
        className="bg-neutral-100 p-3 rounded border-gray-400 pl-4 relative my-2 text-sm font-mono break-all overflow-scroll"
      >
        <div className="text-xs text-gray-500 absolute right-4">Code</div>
        {children}
      </pre>
    )
  },
}

export default components
