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

  // Image optimization with restricted remote patterns
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pensine.nebula.li",
      },
      {
        protocol: "https",
        hostname: "nebula.li",
      },
      // Wikipedia / Wikimedia
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "*.wikipedia.org",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
  output: "standalone",
  transpilePackages: ["geist"],

  // Don't bundle sql.js - load it at runtime to avoid ESM/CJS issues
  serverExternalPackages: ["sql.js"],

  // Security headers
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed for MDX/React dynamic rendering
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://pensine.nebula.li https://nebula.li https://upload.wikimedia.org https://*.wikipedia.org",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ]
  },

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
