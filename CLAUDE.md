# CLAUDE.md

Operational guide for working in this repo. Read **README.md** first for the
product overview, content conventions, and the Docker setup. This file covers
what an agent needs to *change* code safely.

## What this is

"The Gardener" / *Garden of Knowledge* — a personal digital-garden site.
Next.js 16 App Router, **static export** (`output: "export"`), React 19,
TypeScript, Tailwind v4. Notes are fetched at build from the public repo
`rwmicro/pensine` into `content/posts/` by `scripts/fetch-notes.mjs`.

**Deployed as a self-hosted Docker image** (a Node/Hono server in front of the
static `out/`), built for amd64+arm64 and pushed to GHCR. It moved off Cloudflare
Pages because the vault exceeds Pages' 20,000-file-per-deploy cap. The
`cloudflare-deploy` branch (+ `functions/`, `deploy.yml`) is the Cloudflare
fallback; on `main` the backend is `server/`, not `functions/`.

## Commands

Package manager is **pnpm** (`packageManager: pnpm@10.28.0`). `pnpm`/`corepack`
are **not on PATH** here — use `npx pnpm@10.28.0 …` (or `node_modules/.bin/*`).

```bash
node_modules/.bin/tsc --noEmit          # typecheck the app (fast; run after every change)
node_modules/.bin/tsc -p server/tsconfig.json   # typecheck the Node server (server/ is excluded from the root tsconfig)
node_modules/.bin/eslint .              # lint (0 errors required; a handful of warnings are known)
node_modules/.bin/vitest run            # unit tests (lib/*.test.ts, server/*.test.ts)
node scripts/bundle-js.mjs              # rebuild public/js/note.bundle.js after editing public/js/*.js
npx pnpm@10.28.0 dev                    # dev server (runs predev: bundle-js, copy-images, build-anki)
npx pnpm@10.28.0 build                  # full static export → out/
npx pnpm@10.28.0 server                 # run the Node backend against a built out/
```

Also: `pnpm format` (prettier), `pnpm test` (build + Playwright), `pnpm
build:docker` (site + RAG chunks, what the Docker CI runs).

### Big gotchas
- **`/api/*` do NOT run under `next dev`** — they're served by the Node backend
  in `server/`. To exercise the assistant / comments / translate, build (`out/`)
  then `pnpm server` with the relevant env vars (see `.env.example`).
- **Full-text search (Pagefind) only exists after `pnpm build`** (indexes `out/`).
  In dev the home search gracefully falls back to title/folder filtering.
- **`public/js/note.bundle.js` is generated** by `bundle-js.mjs` (git-ignored) —
  never edit it; edit the source `public/js/*.js` and re-run bundle-js.
- Verify UI changes **visually** (Playwright screenshots, desktop+mobile) — much
  of this codebase is layout/canvas that tsc can't validate.

## Architecture map

- **Pages**: `app/page.tsx` (home), `app/posts/[...slug]/page.tsx` (notes via
  `components/SinglePage.tsx`), `app/graph/`, `app/cartes/` (Anki). Note `<main>`
  is built as an HTML string (`dangerouslySetInnerHTML`) so content `<p>` stay
  direct children of `<main>` (dropcap selectors depend on it).
- **Content/build libs**: `lib/content.ts` (loading, tree, slugs, wikilinks,
  backlinks, `getPdfAssets`, `getHomeTree`, `IGNORE_DIRS`), `lib/markdown.ts`
  (unified pipeline: callouts, manim, YouTube facade, vault assets, sidenotes),
  `lib/graph-data.ts` (`buildGraph`; `theme` = level-2 discipline), `lib/html.ts`
  (note HTML fragments), `lib/site.ts` (config + CSP), `lib/seo.ts`/`lib/jsonld.ts`.
- **Client components**: `components/HomeContent.tsx` (search with scopes
  notes/pdf/anki/themes, browse tree, RAG assistant, lazy graph preview),
  `components/Graph.tsx` (force-graph), `Header.tsx` (masthead + mobile hamburger),
  `LangSwitcher.tsx`, etc.
- **Backend** (`server/`, Hono on Node, typecheck with `tsc -p server/tsconfig.json`):
  `index.ts` mounts `routes/ask.ts` (RAG: embed the question via an
  OpenAI-compatible endpoint → in-memory cosine search over `data/rag-chunks.json`
  → Anthropic or OpenAI-compatible generation, NDJSON stream), `routes/comments.ts`
  (SQLite via better-sqlite3, Turnstile), `routes/translate.ts`. Config is
  centralised in `server/env.ts` (all `process.env`); everything degrades to
  "disabled" when its vars are unset.

## Conventions that bite

- **i18n**: custom. `lib/i18n.ts` `t()` resolves at build against the **default
  locale `fr`**; `messages/{fr,en,es,zh,ar}.json` — keep all **five in key sync**
  when adding a key. Runtime swap is `public/js/i18n.js` via `data-i18n*`
  attributes; it only re-runs on load when a **non-default** locale is stored, so
  build-time output must already be correct for `fr` (e.g. `formatDateLong` uses
  `fr-FR`).
- **CSS scoping**: `assets/css/global.css` (Tailwind `@theme` + everywhere; the
  `--color-garden` CTA token lives here), `main.css` (note pages `/posts/*` and
  the 404 only), `graph.css` (graph page). Fluid type via `clamp()` + `cqi`
  container units. `app/not-found.tsx` is a global boundary — must NOT import
  route-scoped CSS.
- **Note-page scripts**: `public/js/*.js` are vanilla IIFEs bundled by **esbuild**
  (`scripts/bundle-js.mjs`) into `note.bundle.js`, loaded once via
  `components/NoteScripts.tsx` (the `SCRIPTS` array lists them). Only
  `i18n.js`/`instantpage.js`/`lightbox.js` load site-wide from `layout.tsx`.
  Shared client logic lives in `lib/*.ts` imported by **both** the vanilla bundle
  and React — e.g. `lib/ask-stream.ts` (the NDJSON parser).
- **ESLint**: flat config (`eslint-config-next` 16). `react-hooks/set-state-in-effect`
  is intentionally a warning (false positives for the client-only init this
  static export uses).

## Deployment

- **`.github/workflows/docker.yml`** ("Docker image (GHCR)"): on push to `main`,
  after CI passes and if repo var `ENABLE_DOCKER_BUILD=true`, builds the static
  site + RAG chunks and pushes a multi-arch image to
  `ghcr.io/rwmicro/learn-nebula:latest`. A "Free disk space" step is required or
  the multi-arch buildx runs the runner out of disk.
- Runtime secrets are passed at `docker run` / compose (`.env.example`), never
  baked into the image. Comments + the RAG vector cache live on the `gk-data`
  volume (`/data`), so they survive rebuilds — don't drop that volume.
- The tracked lockfile is **`pnpm-lock.yaml`** (what Docker/CI use). A stale,
  untracked npm `package-lock.json` may linger locally; it's unused — safe to delete.

## CI

`.github/workflows/ci.yml` (typecheck app **and** `server/`, lint, unit tests on
push/PR), `docker.yml` (image build/push, above), and `deploy.yml` (legacy
Cloudflare Pages deploy, opt-in via `ENABLE_CF_DEPLOY=true` — the fallback path).
