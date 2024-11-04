export function sanitizePath(path: string): string {
  return path
  .replace(/(\.mdx|.md?)$/, "")
  .replace(/^\//, "")
  .replace(/\//g, " / ");
}

export function encodeURL(path: string): string {
  return encodeURIComponent(path.replace(/\.(md|mdx|pdf)$/, ""));
}