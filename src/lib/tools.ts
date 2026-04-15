/**
 * Path manipulation utilities for the application
 */

/**
 * Sanitizes a path by removing file extensions and formatting slashes
 * @param path - The path to sanitize
 * @returns The sanitized path
 */
export function sanitizePath(path: string): string {
  return path
    .replace(/(\.mdx|\.md?)$/, "")
    .replace(/^\//, "")
    .replace(/\//g, " / ")
}

/**
 * Encodes a URL by removing file extensions and encoding special characters
 * @param path - The path to encode
 * @returns The encoded URL
 */
export function encodeURL(path: string): string {
  return encodeURIComponent(path.replace(/\.(md|mdx|pdf)$/, ""))
}

/**
 * Cleans a path by removing encoding and normalizing slashes
 * @param path - The path to clean
 * @returns The cleaned path
 */
export function cleanPath(path: string): string {
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

/**
 * Encodes a path for use in URLs
 * @param path - The path to encode
 * @returns The encoded path
 */
export function encodePathForUrl(path: string): string {
  const cleanedPath = cleanPath(path)
  return cleanedPath.split("/").map(encodeURIComponent).join("/")
}

/**
 * Decodes a path from a URL
 * @param encodedPath - The encoded path
 * @returns The decoded path
 */
export function decodePathFromUrl(encodedPath: string): string {
  try {
    return decodeURIComponent(encodedPath)
  } catch {
    return encodedPath
  }
}

/**
 * Builds a navigation path from a file path
 * @param path - The file path
 * @returns The navigation path with leading slash
 */
export function buildNavigationPath(path: string): string {
  const encoded = encodePathForUrl(path)
  return `/${encoded}`
}
