
/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
    output: 'standalone',
    cacheHandler:
    process.env.NODE_ENV === "production"
      ? (await import('./cache-handler.mjs')).default
      : undefined,
  cacheMaxMemorySize: 0, // disable default in-memory caching
  experimental: {
    mdxRs: true,
  },
  transpilePackages: ["geist"],
};

export default nextConfig;