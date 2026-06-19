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

## Assistant (semantic RAG over the notes)

A Cloudflare Pages Function (`functions/api/ask.ts`) answers questions using
**only** the notes: it embeds the question with Workers AI (`@cf/baai/bge-m3`),
retrieves the nearest note chunks from a **Vectorize** index, and has **Claude
Haiku 4.5** answer from those chunks (streamed). Chunks are embedded and upserted
at build time by `scripts/index-notes.mjs`. The assistant runs on Cloudflare only
(Functions + bindings) — not under `next dev` or `npm start`.

### One-time setup

```bash
# 1. Create the Vectorize index (bge-m3 = 1024 dims, cosine).
npx wrangler vectorize create garden-notes --dimensions=1024 --metric=cosine
```

The `AI` and `VECTORIZE` bindings are declared in `wrangler.toml`; set `name`
there to your Pages project name. `public/_routes.json` routes `/api/*` to the
Function (everything else stays static).

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Pages → Settings → **secret** (Production + Preview) | Claude Haiku generation at runtime |
| `CLOUDFLARE_ACCOUNT_ID` | Pages **build** env var | build-time embedding + Vectorize upsert |
| `CLOUDFLARE_API_TOKEN` | Pages **build** env var | token with **Workers AI: Run** + **Vectorize: Edit** |
| `VECTORIZE_INDEX` | optional build env var | index name (default `garden-notes`) |

The `AI` / `VECTORIZE` runtime bindings come from `wrangler.toml` (or the Pages
dashboard → Settings → Functions → bindings), **not** env vars. If the two build
variables are absent the indexer skips with a warning, so previews still build —
the assistant just has nothing to retrieve until a build runs with them set.

### Local test

```bash
pnpm build                       # also runs the indexer if build vars are set
echo 'ANTHROPIC_API_KEY="sk-..."' > .dev.vars   # gitignored
npx wrangler pages dev out       # serves Functions + bindings locally
```

> ⚠️ The endpoint is public and costs tokens per call. Add a **Cloudflare Rate
> Limiting** rule on `/api/ask` before going live (the Function already caps
> `max_tokens` and question length).

## Deployment

Deploy via **Cloudflare Pages** (build command `pnpm build`, output `out/`) so the
assistant Function and its bindings ship too. The static site alone (`out/`) can
go to any host (rsync, …) but then `/api/ask` is unavailable. See
[SECURITY.md](SECURITY.md) for the recommended response headers (CSP, HSTS…).

## Architecture notes

- Pages build their `<main>` as an HTML string (rendered via
  `dangerouslySetInnerHTML`) so content paragraphs stay direct children of
  `<main>` — required by the dropcap selectors (`main > p:first-of-type`).
- Markdown pipeline: `lib/markdown.ts`; content loading + tree + slugs:
  `lib/content.ts`; SEO/JSON-LD: `lib/seo.ts`, `lib/jsonld.ts`.
- Client behaviour is plain scripts in `public/js/` (search, lightbox, TOC
  scrollspy, mermaid), loaded from `app/layout.tsx`.
