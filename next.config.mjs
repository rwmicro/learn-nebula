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
      {
        protocol: "https",
        hostname: "assets.nebula.li",
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


  // Security headers
  async headers() {
    const longImmutable = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      { key: "CDN-Cache-Control", value: "public, max-age=31536000, immutable" },
    ]
    const staticAsset = [
      { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
      { key: "CDN-Cache-Control", value: "public, max-age=31536000, stale-while-revalidate=86400" },
    ]
    const htmlPage = [
      { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
      { key: "CDN-Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" },
    ]

    return [
      {
        source: "/_next/static/:path*",
        headers: longImmutable,
      },
      {
        source: "/_next/image/:path*",
        headers: staticAsset,
      },
      {
        source: "/articles/:path*",
        headers: staticAsset,
      },
      {
        source: "/img/:path*",
        headers: staticAsset,
      },
      {
        source: "/favicons/:path*",
        headers: staticAsset,
      },
      {
        source: "/:file(favicon\\.(?:ico|png|svg)|apple-touch-icon\\.png|android-chrome-.*\\.png|mstile-.*\\.png|safari-pinned-tab\\.svg|opengraph-image\\.png|twitter-image\\.png|site\\.webmanifest|browserconfig\\.xml|robots\\.txt|sitemap\\.xml|sql-wasm\\.wasm|placeholder\\.svg)",
        headers: staticAsset,
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "CDN-Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/:path*",
        headers: htmlPage,
      },
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
            value: "SAMEORIGIN",
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
              "img-src 'self' data: https://pensine.nebula.li https://nebula.li https://assets.nebula.li https://upload.wikimedia.org https://*.wikipedia.org",
              "font-src 'self' data:",
              "connect-src 'self' https://assets.nebula.li",
              "frame-src 'self' https://assets.nebula.li",
              "frame-ancestors 'self'",
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

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
