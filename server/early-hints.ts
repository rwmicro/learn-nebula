// A `Link` header for HTML responses, so Cloudflare's Early Hints can send a
// 103 with the critical CSS and the body font while the Pi is still answering.
//
// The stylesheets are content-hashed, so their names change on every build;
// they are read from out/404.html at startup. That page renders only the root
// layout (app/not-found.tsx must not import route CSS), so what it links is
// exactly what every page needs.

import fs from "node:fs";
import path from "node:path";

const LINK_TAG = /<link\b[^>]*>/gi;
const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];

/** The `Link` header value for the stylesheets and fonts an HTML page links. */
export function linkHeaderFrom(html: string): string | null {
  const out = new Set<string>();
  for (const tag of html.match(LINK_TAG) ?? []) {
    const rel = attr(tag, "rel");
    const href = attr(tag, "href");
    // Same-origin paths only: a header can't carry a crossorigin choice per
    // host, and a stray quote or comma would split the header.
    if (!href || !/^\/(?!\/)[^\s"<>,;]*$/.test(href)) continue;
    if (rel === "stylesheet") out.add(`<${href}>; rel=preload; as=style`);
    else if (rel === "preload" && attr(tag, "as") === "font")
      out.add(`<${href}>; rel=preload; as=font; type="font/woff2"; crossorigin`);
  }
  return out.size ? [...out].join(", ") : null;
}

/** Read once at startup; null (no header) when the export has no 404 page. */
export function loadLinkHeader(staticDir: string): string | null {
  try {
    return linkHeaderFrom(fs.readFileSync(path.join(staticDir, "404.html"), "utf8"));
  } catch {
    return null;
  }
}
