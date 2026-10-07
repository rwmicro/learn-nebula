// Central site configuration.

// The canonical base URL (apex, no www). Overridable at build time, e.g. for a
// Tor onion build: SITE_BASE_URL="https://example.onion" next build
export const SITE_URL = (
  process.env.SITE_BASE_URL ?? "https://4d52.net"
).replace(/\/$/, "");

export const SITE_TITLE = "The Gardener";
export const SITE_DESCRIPTION = "Garden of knowledge";
export const AUTHOR = "The Gardener";

// Original author of the site and its source code (credited in the footer).
export const ORIGINAL_AUTHOR = "David Álvarez Rosa";
export const ORIGINAL_AUTHOR_URL = "https://david.alvarezrosa.com";

/** NAV entries store an i18n key in `name`; navHtml resolves it via t() at
 * build time and the runtime swap (/js/i18n.js) does the same at locale
 * change. */
export const NAV = [
  { name: "nav.home", href: "/" },
  { name: "nav.parcours", href: "/parcours/" },
  { name: "nav.themes", href: "/themes/" },
  { name: "nav.graph", href: "/graph/" },
  { name: "nav.frise", href: "/frise/" },
  { name: "nav.cartes", href: "/cartes/" },
  { name: "nav.random", href: "/hasard/" },
];

/** RSS autodiscovery (app/feed.xml) for `metadata.alternates.types`. Shared
 *  by the root layout and lib/seo.ts: Next merges metadata shallowly, so a
 *  page that sets its own `alternates` (the canonical URL) would otherwise
 *  drop the layout's feed link. */
export const FEED_ALTERNATES = {
  "application/rss+xml": [{ url: "/feed.xml", title: SITE_TITLE }],
};

// Social profiles for the Person JSON-LD (none yet).
export const SAME_AS: string[] = [];

// Drafts are published only when explicitly requested.
export const INCLUDE_DRAFTS = process.env.INCLUDE_DRAFTS === "true";

export function absoluteURL(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Content-Security-Policy delivered as a <meta> tag. `frame-ancestors` and a few
 * other directives are ignored in meta form, so the same policy is also shipped
 * as a real response header by server/index.ts.
 *
 * `script-src` keeps 'unsafe-inline' because a static export cannot emit a
 * per-request nonce for Next.js's inline bootstrap; the attack surface is small
 * since the site is fully static with no backend, third-party scripts or input.
 */
export function buildCSP(): string {
  // React/Turbopack use eval() in dev only; production never needs it.
  const dev = process.env.NODE_ENV !== "production";
  // Turnstile loads its script + an iframed challenge from challenges.cloudflare.com.
  const turnstile = "https://challenges.cloudflare.com";
  // Cloudflare Web Analytics beacon (cookieless): script host + beacon endpoint.
  const cfa = "https://static.cloudflareinsights.com";
  const scriptSrc =
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${turnstile} ${cfa}` +
    (dev ? " 'unsafe-eval'" : "");
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // Notes embed remote images (Wikipedia, etc.); allow HTTPS images.
    "img-src 'self' data: https:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // 'wasm-unsafe-eval' lets Pagefind's search run its WebAssembly.
    scriptSrc,
    "connect-src 'self' https://cloudflareinsights.com",
    // Turnstile's challenge iframe + the click-to-load YouTube facade (#16),
    // which swaps in a youtube-nocookie.com player only after a click.
    `frame-src ${turnstile} https://www.youtube-nocookie.com`,
    "form-action 'none'",
    "frame-ancestors 'none'",
  ];
  // Only force HTTPS upgrades on an HTTPS site (not on a .onion HTTP build).
  if (!dev && SITE_URL.startsWith("https://"))
    directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
