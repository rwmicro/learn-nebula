
/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
    output: 'standalone',
  experimental: {
    mdxRs: true,
  },
  transpilePackages: ["geist"],
};

export default nextConfig;
