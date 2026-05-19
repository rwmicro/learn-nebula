# CLAUDE.md

Notes for future Claude sessions working on this repo. Captures non-obvious constraints, conventions, and gotchas — read this before making changes.

## What this is

Next.js 16 (App Router) site deployed as a **fully static export on Cloudflare Pages**. No worker, no server runtime — every page is a prerendered HTML file. Renders a personal knowledge base (~989 markdown articles + binary assets) from a git submodule.

- Live: `https://pensine.nebula.li`
- Assets CDN: `https://assets.nebula.li` (Cloudflare R2 bucket `pensine-assets`)
- Articles repo (submodule at `public/articles/pensine`): `https://github.com/rwmicro/pensine`

## The constraints that shape everything

### 1. There is no runtime server

`next.config.mjs` sets `output: "export"`. The build produces an `out/` directory of HTML/CSS/JS files; Cloudflare Pages serves them directly from its CDN. No worker, no Node, no API routes.

Consequences:
- `fs.readFile`, `fs.readdir`, etc. only work at **build time**. Currently used in `lib/posts.ts`, `lib/treeData.ts`, and `scripts/*.mjs` — all build-time paths.
- No middleware, no `getServerSideProps`, no runtime API routes. Everything dynamic happens client-side (data lives in prebuilt JSON, see below).
- Routes are declared via `generateStaticParams` with `dynamicParams = false`. A URL only exists if its HTML was prerendered at build time.
- `headers()` in `next.config.mjs` is **silently ignored** in export mode. Cache and security headers live in `public/_headers` (Cloudflare Pages convention).

### 2. Cloudflare Pages static assets cap at 25 MiB per file

Binary assets (PDFs, images, .apkg, video) bypass Pages entirely and live in R2. The flow:

- Source of truth: `public/articles/pensine/<path>` on disk (submodule)
- `scripts/sync-r2.sh` uploads binaries to R2 bucket `pensine-assets`
- `scripts/strip-binaries-for-build.mjs` deletes binaries from the build before `next build`
- Client URLs are resolved by `src/lib/assets.ts → getAssetUrl()`:
  - Binary extension → `https://assets.nebula.li/<path>`
  - Text (markdown etc.) → `/articles/pensine/<path>` (served by Pages)

**Cloudflare Pages config** (dashboard, not code):
- Build command: `npm run build:pages` (the `:pages` variant runs the strip step)
- Build output directory: `out`
- Framework preset: none (or "Static HTML"). Do not select Next.js — that auto-applies OpenNext which we no longer use.

## Build pipeline

`scripts/build-pensine-index.mjs` runs before every `next build` (wired in via the npm scripts). It produces:

| File | Purpose | Size |
|---|---|---|
| `public/pensine-index.json` | File/directory tree | ~158 KB |
| `public/pensine-search.json` | Full-text search corpus | ~6 MB raw, ~1.5 MB gzipped |
| `public/sql-wasm.wasm` | sql.js wasm binary copied from `node_modules` | ~650 KB |

These are git-ignored. They're regenerated on every build.

The runtime equivalents (`src/lib/pensine-index.ts`) fetch these JSONs with `cache: "force-cache"` and search/list client-side. **There are no API routes for navigation, search, or anki parsing** — everything is static JSON + client-side compute.

## Pensine submodule workflow

A `post-commit` git hook in the submodule (`.git/modules/public/articles/pensine/hooks/post-commit`) automates the publish pipeline. After each commit in pensine, it:

1. Pushes the submodule to its remote
2. Runs `scripts/sync-r2.sh` to upload changed binaries to R2
3. Bumps the submodule pointer in the parent, commits, and pushes — which triggers a Cloudflare Pages rebuild

**The hook is per-machine.** It's installed via `npm run hooks:install` (one-time per clone). The hook script itself is versioned at `scripts/hooks/pensine-post-commit`; `.git/hooks/` is not.

Pushes from machines without the hook installed (or commits made via GitHub web UI) won't sync R2. If a "true any-push → R2" guarantee is needed, add a GitHub Action to the pensine repo — that work is unstarted.

## Important commands

```bash
npm run dev              # local dev (regenerates pensine-index.json first)
npm run build            # local build
npm run build:pages      # what Cloudflare Pages runs — strips binaries + builds
npm run sync:r2          # upload pensine binaries to R2
npm run hooks:install    # install the post-commit hook (per machine)
npm run index            # rebuild only the pensine indexes (no Next build)
```

## Conventions / gotchas

- **No `fs` outside `scripts/`, `lib/posts.ts`, `lib/treeData.ts`**. Build-time only. If you need data at runtime, fetch JSON from `public/` or assets from R2.
- **Articles are statically prerendered** (`dynamicParams = false` in `[...article]/page.tsx`). Adding a new route requires it to be discoverable by `generateStaticParams`, which walks the pensine submodule.
- **`ArticleClient` returns `null` until `isMounted`** — the article content is rendered client-only after hydration. SEO meta tags still come from `generateMetadata` (run at build). Don't add SSR-only logic to article rendering without understanding this.
- **`force-static` is required** on metadata routes (`robots.ts`, `sitemap.ts`) for export mode. If you add a new one, set `export const dynamic = "force-static"`.
- **`next/image` runs unoptimized** (`images.unoptimized: true`). Static export can't run the optimizer. Use Cloudflare Images via a custom loader if optimization is needed later.
- **`R2_ASSETS_URL`** defaults to `https://assets.nebula.li` and is also overridable via `NEXT_PUBLIC_R2_ASSETS_URL`. Both production and the default agree, so the env var is rarely needed.
- The strip-binaries script runs on the Cloudflare build machine only (ephemeral). **Don't run it locally** — it deletes your working tree's binaries.

## Files that look unused but aren't fully

- `src/lib/api-utils.ts` and `src/lib/security.ts`: previously used by the deleted API routes. Currently unreferenced — tree-shaken out of bundles. Kept in case future API work needs them. Safe to delete if you're sure.
- `src/components/toc-wrapper.tsx` + `src/lib/toc-data.ts`: unreferenced. Same situation.
