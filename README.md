# Garden of Knowledge

A personal knowledge garden — a static website generated from an Obsidian-style
note vault.

## Stack

- **Next.js** (App Router, static export `output: "export"`) + **React 19** + **TypeScript**
- Markdown rendered at build time with a custom **unified** (remark/rehype) pipeline
- **KaTeX** (math, rendered at build), **Shiki** (code), **Mermaid** (diagrams, client-side)
- **Pagefind** (full-text search), self-hosted fonts

Everything is static: `next build` emits plain HTML/CSS/JS into `out/` — no server,
no database, no backend.

## Content

Notes live in `content/posts/**` as Markdown with YAML (`---`) or TOML (`+++`)
frontmatter (Obsidian export). Conventions:

- **`content/posts/Garden of Knowledge.md`** is the home/index note.
- **`content/posts/sources/`** (templates, attachments) is **ignored** (not published).
- Folders become the navigable tree on the home page; URLs are slugified to ASCII
  (`Applied Sciences/… → /posts/applied-sciences/…`).
- Standalone images/PDFs in the vault are copied to `/vault/…` and listed in the tree.

### Supported in notes

- `[[wikilinks]]`, `[[note|alias]]`, `[[file.pdf]]` (resolved to other notes/assets)
- Footnotes → Tufte-style **margin notes**
- ` ```mermaid ` diagrams, math (`\( … \)`, `\[ … \]`), fenced code (highlighted)
- Local images/PDFs (relative or vault-relative) and remote `https` images
- First heading `# Title` is dropped (the title comes from the frontmatter/filename)

## Commands

```bash
npm install
npm run dev      # dev server (search needs a build; see below)
npm run build    # static export -> out/ (+ Pagefind index)
npm start        # serve the built out/ locally
npm run format   # Prettier
npm test         # build + Playwright
```

`prebuild`/`predev` copy vault assets and the Mermaid bundle into `public/`.
**Full-text search only works after `npm run build`** (Pagefind indexes `out/`),
so use `npm start` to test it — not `npm run dev`.

## Configuration (`lib/site.ts`)

- **`SITE_BASE_URL`** — set the real domain before deploying (drives canonical,
  Open Graph, sitemap, robots). The default is a placeholder.
- `INCLUDE_DRAFTS=true` — include `draft: true` notes.
- `SITE_BASE_URL="http://…onion/"` — build for a Tor onion service.

## Deployment

Deploy the contents of `out/` to any static host (rsync, Cloudflare, …). See
[SECURITY.md](SECURITY.md) for the recommended response headers (CSP, HSTS…).

## Architecture notes

- Pages build their `<main>` as an HTML string (rendered via
  `dangerouslySetInnerHTML`) so content paragraphs stay direct children of
  `<main>` — required by the dropcap selectors (`main > p:first-of-type`).
- Markdown pipeline: `lib/markdown.ts`; content loading + tree + slugs:
  `lib/content.ts`; SEO/JSON-LD: `lib/seo.ts`, `lib/jsonld.ts`.
- Client behaviour is plain scripts in `public/js/` (search, lightbox, TOC
  scrollspy, mermaid), loaded from `app/layout.tsx`.
