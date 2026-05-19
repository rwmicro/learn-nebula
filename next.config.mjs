import createMDX from "@next/mdx"
import remarkGfm from "remark-gfm"
import rehypeKatex from "rehype-katex"
import rehypeUnwrapImages from "rehype-unwrap-images"
import remarkMath from "remark-math"
import rehypePrismPlus from "rehype-prism-plus"
import { visit } from "unist-util-visit"

// Extracts raw mermaid code into a data attribute before rehype-prism-plus transforms it
function rehypeMermaidExtract() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName === "pre" && node.children?.[0]?.tagName === "code") {
        const codeNode = node.children[0]
        const classes = Array.isArray(codeNode.properties?.className) ? codeNode.properties.className : []
        if (classes.includes("language-mermaid")) {
          const text = codeNode.children
            .filter((n) => n.type === "text")
            .map((n) => n.value)
            .join("")
          node.properties = { ...(node.properties || {}), "data-mermaid": text }
        }
      }
    })
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable TypeScript checks
  typescript: {
    ignoreBuildErrors: false,
  },

  // Full static export — every page is a prerendered HTML file served by
  // Cloudflare Pages CDN. No worker, no runtime server. See public/_headers
  // for cache/CSP/security headers (next.config headers() are ignored in export mode).
  //
  // Only enable in production builds. In `next dev` with `output: export`,
  // Webpack HMR breaks the static-params cache after the first hot update,
  // producing spurious "missing param" errors on routes that exist.
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  trailingSlash: false,

  images: {
    // Required for static export: skip the built-in image optimizer.
    // Remote images still load, just unoptimized.
    unoptimized: true,
  },

  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  transpilePackages: ["geist"],


  // Security headers
  // NOTE: headers() is ignored when output: "export" is set. Cache + security
  // headers live in public/_headers (consumed by Cloudflare Pages).

  // Exclude problematic directories from bundling
  webpack: (config) => {
    // Ignore binary files during webpack bundling (excluding .apkg since we handle it via API)
    config.module.rules.push({
      test: /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/,
      use: "ignore-loader",
    })

    // Allow browser-only packages to resolve without Node.js built-ins
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }

    return config
  },
}

const withMDX = createMDX({
  extension: /\.(md|mdx)$/,
  options: {
    remarkPlugins: [remarkMath, remarkGfm],
    rehypePlugins: [rehypeKatex, rehypeUnwrapImages, rehypeMermaidExtract, rehypePrismPlus],
  },
})

export default withMDX(nextConfig)
