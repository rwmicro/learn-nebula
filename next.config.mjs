/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static site: `next build` emits a static export into `out/`.
  output: "export",
  // Hugo served pretty URLs with a trailing slash (/posts/slug/).
  trailingSlash: true,
  // We process images ourselves at build time with sharp (see lib/images.ts),
  // so the built-in optimizer (which needs a server) is disabled.
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
