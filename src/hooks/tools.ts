export function sanitizePath(path: string): string {
  return path
  .replace(/(\.mdx|.md?)$/, "")
  .replace(/^\//, "")
  .replace(/\//g, " / ");
}

export function encodeURL(path: string): string {
  return encodeURIComponent(path.replace(/\.(md|mdx|pdf)$/, ""));
}

export function cleanPath(path: string): string {
  // Remove any existing encoding and clean the path
  try {
    const decoded = decodeURIComponent(path)
    return decoded
      .trim()
      .replace(/\/+/g, "/")
      .replace(/^\/|\/$/g, "")
      .replace(/\s*\/\s*/g, "/")
  } catch {
    return path
      .trim()
      .replace(/\/+/g, "/")
      .replace(/^\/|\/$/g, "")
      .replace(/\s*\/\s*/g, "/")
  }
}

export function encodePathForUrl(path: string): string {
  // Clean the path first, then encode it completely
  const cleanedPath = cleanPath(path)

  return encodeURIComponent(cleanedPath)
}

export function decodePathFromUrl(encodedPath: string): string {
  // Decode the path from URL
  try {
    return decodeURIComponent(encodedPath)
  } catch {
    return encodedPath
  }
}

export function buildNavigationPath(path: string): string {
  // Build a clean, fully encoded navigation path
  const encoded = encodePathForUrl(path)
  return `/${encoded}`
}
