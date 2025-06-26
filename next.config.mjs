import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeUnwrapImages from "rehype-unwrap-images";
import remarkMath from "remark-math";
import rehypePrismPlus from "rehype-prism-plus";

/** @type {import('next').NextConfig} */ const nextConfig = {
  webpack: (config, { isServer }) => {
    // Ignore PDF files and other binary files during webpack bundling 
    config.module.rules.push({ test: /.(pdf|doc|docx|xls|xlsx|ppt|pptx|apkg)$/, use: { loader: "ignore-loader", }, })

    // Add specific rule to ignore binary files in the pensine folder
    config.module.rules.push({
      test: /public\/articles\/pensine\/.*\.(pdf|doc|docx|xls|xlsx|ppt|pptx|apkg)$/,
      use: "ignore-loader",
    })

    // Alternative: exclude binary files from being processed
    config.resolve.alias = {
      ...config.resolve.alias,
    }

    return config

  },
  eslint: { ignoreDuringBuilds: true, }, typescript: { ignoreBuildErrors: true, }, images: { unoptimized: true, }, pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"], output: "standalone", transpilePackages: ["geist"], images: { remotePatterns: [{ hostname: "**", },], },
}

const withMDX = createMDX({ extension: /.(md|mdx)$/, options: { remarkPlugins: [remarkMath, remarkGfm], rehypePlugins: [rehypeKatex, rehypeUnwrapImages, rehypePrismPlus], }, })

export default withMDX(nextConfig)