export const PENSINE_DIRECTORY = "public/articles/pensine"

export const CODE_EXTENSIONS = ["mdx", "jsx", "tsx", "md"]
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"]

export const SUPPORTED_EXTENSIONS = [
  "md",
  "mdx",
  "pdf",
  "PDF",
  "MD",
  "MDX",
  "apkg",
  "APKG",
  ...IMAGE_EXTENSIONS,
] as const

// UI Constants
export const SEARCH_MAX_RESULTS = 8
export const HEADER_HEIGHT_VAR = '--header-height'

// Rate Limiting
export const RATE_LIMIT_MAX_REQUESTS = 100
export const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute

// Path Validation
export const MAX_PATH_LENGTH = 500