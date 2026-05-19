export const PENSINE_DIRECTORY = "public/articles/pensine"

export const CODE_EXTENSIONS = ["mdx", "jsx", "tsx", "md"]
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"]

// Extensions servies depuis R2 (binaires) plutôt que depuis le repo
export const BINARY_EXTENSIONS = new Set([
  "pdf",
  "apkg",
  "zip",
  "mp4",
  "mp3",
  "webm",
  "mov",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  ...IMAGE_EXTENSIONS,
])

// URL de base R2 pour les assets binaires (configurée via env var sur Cloudflare Pages)
export const R2_ASSETS_URL = process.env.NEXT_PUBLIC_R2_ASSETS_URL || "https://assets.nebula.li"

// Normalize all extension comparisons to lowercase. Callers that look up files
// from disk must do so case-insensitively (see lib/posts.ts, lib/treeData.ts).
export const SUPPORTED_EXTENSIONS = [
  "md",
  "mdx",
  "pdf",
  "apkg",
  ...IMAGE_EXTENSIONS,
] as const

export const TEXT_EXTENSIONS = ["md", "mdx"] as const

// UI Constants
export const SEARCH_MAX_RESULTS = 8
export const HEADER_HEIGHT_VAR = '--header-height'