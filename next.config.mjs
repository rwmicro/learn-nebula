/** @type {import('next').NextConfig} */
const nextConfig = {
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
    unoptimized: true,
  },

  pageExtensions: ["js", "jsx", "ts", "tsx"],
  transpilePackages: ["geist"],

  // Security headers
  // NOTE: headers() is ignored when output: "export" is set. Cache + security
  // headers live in public/_headers (consumed by Cloudflare Pages).

  webpack: (config) => {
    // Ignore binary file extensions during webpack bundling.
    config.module.rules.push({
      test: /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/,
      use: "ignore-loader",
    })

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }

    return config
  },
}

export default nextConfig
