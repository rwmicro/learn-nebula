# Security

This site is a **fully static** Next.js export — no backend, database or
server-side code. That removes whole classes of risk by construction. Notes are
authored by the site owner (no user input), and all assets are first-party
(self-hosted fonts, KaTeX, Mermaid, Pagefind); there are no third-party scripts.

## Content-Security-Policy & headers

A baseline CSP and `Referrer-Policy` ship as `<meta>` tags (see
`lib/site.ts → buildCSP`). Some directives (`frame-ancestors`, HSTS,
`X-Content-Type-Options`) only work as **real response headers**, so set them at
the edge (Cloudflare) or origin (nginx). Notes:

- `script-src` keeps `'unsafe-inline'` (Next.js inline bootstrap; a static export
  cannot mint a per-request nonce) and `'wasm-unsafe-eval'` (Pagefind's
  WebAssembly). `'unsafe-eval'` is added **only in dev** (React fast-refresh).
- `img-src` allows `https:` because notes embed remote images (Wikipedia, etc.).
- `media-src` allows `https:` because pronunciation clips
  (`![word](clip.mp3)`) resolve straight to the vault repo's
  raw.githubusercontent.com instead of being bundled into the deployment — a
  vault can hold thousands of small per-word clips, more than Cloudflare
  Pages' 20,000-file-per-deployment cap.

### nginx

```nginx
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; img-src 'self' data: https:; media-src 'self' https:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

Do **not** send `Strict-Transport-Security` / `upgrade-insecure-requests` on the
`.onion` (HTTP) build.

### Cloudflare

Add the same headers via _Rules → Transform Rules → Modify Response Header_.
