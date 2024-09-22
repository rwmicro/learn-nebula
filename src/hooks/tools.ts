export function sanitizePath(path: string): string {
  const withoutExtension = path.replace(/(\.mdx|.md?)$/, "");
  const formattedPath = withoutExtension.replace(/\//g, " / ");
  return formattedPath;
}
