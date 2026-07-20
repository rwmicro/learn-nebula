/** HTML-escape for interpolating untrusted text into markup strings. Escapes the
 *  significant characters so the result is safe both as element text and inside a
 *  double-quoted attribute. Dependency-free so it's safe to import into the
 *  client bundle (used by both the server HTML builders and the graph tooltip). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
