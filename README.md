# Garden of Knowledge

A personal knowledge garden — a website generated from an Obsidian-style note
vault, self-hosted with Docker.

The site itself is a **static export** (plain HTML/CSS/JS). A small **Node
server** sits in front of it to power three optional features that need a
backend: the RAG assistant, comments, and on-demand translation.

## Stack

- **Next.js** (App Router, `output: "export"`) + **React 19** + **TypeScript** + **Tailwind v4**
- Markdown rendered at build with a custom **unified** (remark/rehype) pipeline
- **KaTeX** (math), **Shiki** (code), **Mermaid** (diagrams), **Pagefind** (search)
- Backend: **Hono** on Node, **SQLite** (comments), an OpenAI-compatible endpoint
  for embeddings/generation (or the Anthropic API)

## Content

Notes live in `content/posts/**` as Markdown with YAML (`---`) or TOML (`+++`)
frontmatter. They are fetched at build from the public vault repo
(`rwmicro/pensine`) by `scripts/fetch-notes.mjs`.

- **`Garden of Knowledge.md`** is the home/index note.
- Folders become the navigable tree; URLs are slugified to ASCII
  (`Applied Sciences/… → /posts/applied-sciences/…`).
- `sources/`, `audio/` and `_manim/` folders are kept out of the tree/search
  (their files are still served, so embedded clips keep working).
- Standalone images/PDFs are copied to `/vault/…` and listed in the tree.

**In notes:** `[[wikilinks]]`, footnotes → Tufte margin notes, ` ```mermaid `
diagrams, math, highlighted code, local/remote images, and a YouTube link on its
own line becomes a click-to-load player.

## Develop

Package manager is **pnpm**.

```bash
pnpm install
pnpm dev      # dev server (http://localhost:3000)
pnpm build    # static export → out/ (+ Pagefind index)
pnpm lint     # ESLint
pnpm test     # unit tests (vitest) + Playwright
pnpm server   # run the Node backend against a built out/
```

Two things only work after a full build: **full-text search** (Pagefind indexes
`out/`) and the **/api/** routes (served by the Node backend, not `next dev`).

Set the real domain in `lib/site.ts` (`SITE_URL`) before deploying — it drives
canonical URLs, Open Graph, the sitemap and robots.

## Deploy with Docker

A multi-arch image (amd64 + arm64) is built from `main` and pushed to GHCR:
`ghcr.io/rwmicro/learn-nebula:latest`. It bundles the pre-built site + the Node
server. Runtime secrets are **not** baked in — pass them at run time.

```bash
cp .env.example .env          # fill in the vars you need (see below)
docker compose pull
docker compose up -d          # serves the site on :8080
```

The image is private on GHCR, so `docker login ghcr.io -u <user>` first (with a
`read:packages` token), or make the package public.

### Environment

Everything is optional — leave a group blank to disable that feature.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude for the assistant + translation (else use the `LLM_*` vars) |
| `LLM_BASE_URL`, `LLM_MODEL` | OpenAI-compatible chat endpoint (e.g. Ollama/LM Studio) |
| `EMBED_BASE_URL`, `EMBED_MODEL` | OpenAI-compatible embeddings endpoint (enables RAG) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret (spam check on comments) |
| `COMMENTS_ADMIN_TOKEN` | bearer token to moderate comments |
| `TRUST_PROXY` | `true` when behind nginx/Caddy (reads `X-Forwarded-For`) |

`docker-compose.yml` also ships an optional **Ollama** service so the assistant
and embeddings can run locally with no API key.

**Comments persist across rebuilds:** the SQLite DB and the RAG vector cache live
in `/data`, mounted as the named volume `gk-data`. Don't remove that volume and
your comments survive `docker compose pull && up -d`.

## How it fits together

- **Pages:** `app/` (home, `posts/[...slug]`, graph, cartes). Note `<main>` is an
  HTML string so content `<p>` stay direct children of `<main>` (dropcap rule).
- **Build libs:** `lib/content.ts` (loading, tree, slugs, wikilinks),
  `lib/markdown.ts` (unified pipeline), `lib/graph-data.ts`, `lib/seo.ts`.
- **Backend:** `server/` — `routes/ask.ts` (RAG), `routes/comments.ts` (SQLite +
  Turnstile), `routes/translate.ts`.
- **Client enhancers:** vanilla scripts in `public/js/`, bundled by
  `scripts/bundle-js.mjs` into `note.bundle.js`.

See **CLAUDE.md** for the agent-oriented map (commands, gotchas, conventions).
