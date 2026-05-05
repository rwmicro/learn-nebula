const URL_STRIPPABLE_EXTENSIONS = /\.(md|mdx|pdf|apkg|jpg|jpeg|png|gif|webp|svg)$/i

export function stripUrlExtension(p: string): string {
  return p.replace(URL_STRIPPABLE_EXTENSIONS, "")
}

export function filePathToSlugSegments(filePath: string): string[] {
  return stripUrlExtension(filePath).replace(/^\//, "").split("/").filter(Boolean)
}

export function sanitizePath(path: string): string {
  return stripUrlExtension(path)
    .replace(/^\//, "")
    .replace(/\//g, " / ")
}

export function cleanPath(path: string): string {
  const normalize = (p: string) =>
    p
      .trim()
      .replace(/\/+/g, "/")
      .replace(/^\/|\/$/g, "")
      .replace(/\s*\/\s*/g, "/")
  try {
    return normalize(decodeURIComponent(path))
  } catch {
    return normalize(path)
  }
}

export function encodePathForUrl(path: string): string {
  return cleanPath(path).split("/").map(encodeURIComponent).join("/")
}

export function decodePathFromUrl(encodedPath: string): string {
  try {
    return decodeURIComponent(encodedPath)
  } catch {
    return encodedPath
  }
}

export function buildNavigationPath(path: string): string {
  return `/${encodePathForUrl(stripUrlExtension(path))}`
}

export function encodeURL(path: string): string {
  return buildNavigationPath(path)
}
