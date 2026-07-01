# CLAUDE.md

Operational guide for working in this repo. For the product overview, content
conventions, and Cloudflare/assistant setup, read **README.md** first (and
SECURITY.md for headers). This file covers what an agent needs to *change* code
safely.

## What this is

"The Gardener" / *Garden of Knowledge* — a personal digital-garden site.
Next.js 16 App Router, **static export** (`output: "export"`), React 19,
TypeScript, Tailwind v4. Deployed to **Cloudflare Pages** (project `the-gardener`).
Notes are fetched at build from the public repo `rwmicro/pensine` into
`content/posts/` by `scripts/fetch-notes.mjs`.

## Commands

Package manager is **pnpm** (`packageManager: pnpm@10.28.0`). `pnpm`/`corepack`
are **not on PATH** here — use `npx pnpm@10.28.0 …` (or `node_modules/.bin/*`).

```bash
node_modules/.bin/tsc --noEmit     # typecheck (fast; run after every change)
node_modules/.bin/eslint .         # lint (0 errors required; 16 warnings are known)
node_modules/.bin/vitest run       # unit tests (lib/*.test.ts)
node scripts/bundle-js.mjs         # rebuild public/js/note.bundle.js after editing public/js/*.js
npx pnpm@10.28.0 dev               # dev server (runs predev: bundle-js, copy-images, build-anki)
npx pnpm@10.28.0 build             # full static export → out/
```

Also: `pnpm lint:fix`, `pnpm format` (prettier), `pnpm test` (build + Playwright).

### Big gotchas
- **`/api/*` Pages Functions do NOT run under `next dev`** (they 404). They need
  `npx wrangler pages dev out` with bindings/secrets. So the RAG assistant and
  comments can't be end-to-end tested with the plain dev server.
- **Full-text search (Pagefind) only exists after `pnpm build`** (indexes `out/`).
  In dev the home search gracefully falls back to title/folder filtering.
- **`public/js/note.bundle.js` is generated** by `bundle-js.mjs` (git-ignored) —
  never edit it; edit the source `public/js/*.js` and re-run bundle-js.
- Verify UI/graph changes **visually** (Playwright screenshots, desktop+mobile) —
  much of this codebase is layout/canvas that tsc can't validate.

## Architecture map

- **Pages**: `app/page.tsx` (home), `app/posts/[...slug]/page.tsx` (notes via
  `components/SinglePage.tsx`), `app/graph/`, `app/cartes/` (Anki), `app/feed.xml/`.
  Note `<main>` is built as an HTML string (`dangerouslySetInnerHTML`) so content
  `<p>` stay direct children of `<main>` (dropcap selectors depend on it).
- **Content/build libs**: `lib/content.ts` (loading, tree, slugs, wikilinks,
  backlinks, `getPdfAssets`, `getHomeTree`, `formatDateLong`), `lib/markdown.ts`
  (unified pipeline), `lib/graph-data.ts` (`buildGraph`; `theme` = level-2
  discipline), `lib/html.ts` (note HTML fragments), `lib/site.ts` (config + CSP),
  `lib/seo.ts`/`lib/jsonld.ts`.
- **Client components**: `components/HomeContent.tsx` (search with scopes
  notes/pdf/anki/themes, browse tree, RAG assistant, lazy graph preview),
  `components/Graph.tsx` (force-graph: radial DAG by folder, discipline colours,
  size by depth, wikilink edges hover-only, controls panel = legend/filter +
  Liens/Notes toggles + locate box), `Header.tsx`, `LangSwitcher.tsx`, etc.
- **Backend** (Cloudflare Pages Functions, `functions/api/`): `ask.ts` (RAG:
  bge-m3 embed → Vectorize → Claude Haiku 4.5, NDJSON stream, per-IP Cache-API
  rate-limit + in-flight dedupe), `comments.ts` (D1, Turnstile), `translate.ts`.
  Typecheck with `tsc -p functions/tsconfig.json` (functions/ is excluded from
  the root tsconfig).

## Conventions that bite

- **i18n**: custom. `lib/i18n.ts` `t()` resolves at build against the **default
  locale `fr`**; `messages/{fr,en,es,zh}.json` — keep all four **in key sync**
  when adding a key. Runtime swap is `public/js/i18n.js` via `data-i18n*`
  attributes; it only re-runs on load when a **non-default** locale is stored, so
  build-time output must already be correct for `fr` (e.g. `formatDateLong` uses
  `fr-FR`). Bundles are inlined into the page by `app/layout.tsx` (`I18N_BOOTSTRAP`).
- **CSS scoping**: `assets/css/global.css` (Tailwind `@theme` + everywhere),
  `main.css` (note pages `/posts/*` and the 404 only), `graph.css` (graph page).
  Fluid type via `clamp()` + `cqi` container units; containers use `@container`.
  `app/not-found.tsx` is a global boundary — must NOT import route-scoped CSS.
- **Note-page scripts**: `public/js/*.js` are vanilla IIFEs bundled by
  **esbuild** (`scripts/bundle-js.mjs`, import-resolving + minified) into
  `note.bundle.js`, loaded once via `components/NoteScripts.tsx`. Only
  `i18n.js`/`instantpage.js`/`lightbox.js` load site-wide from `layout.tsx`.
  Shared client logic lives in `lib/*.ts` imported by **both** the vanilla bundle
  and React — e.g. `lib/ask-stream.ts` (`readAskStream`, the NDJSON parser used
  by `public/js/ask.js` and `HomeContent.tsx`).
- **ESLint**: flat config (`eslint-config-next` 16). `react-hooks/set-state-in-effect`
  is intentionally downgraded to a warning (false positives for the client-only
  init / external-store sync this static export uses).

## Deployment — pending user actions (not derivable from code)

- `wrangler.toml` has `database_id = "REPLACE_WITH_DATABASE_ID"` → `/api/comments`
  won't work until the D1 DB is created.
- Lockfiles: project uses pnpm but the tracked lockfile is stale **npm**
  `package-lock.json`; `pnpm-lock.yaml` was gitignored (now un-ignored) — commit
  it and delete `package-lock.json`.
- Set Pages secrets: `ANTHROPIC_API_KEY`, `TURNSTILE_SECRET_KEY`,
  `COMMENTS_ADMIN_TOKEN`; build vars `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`.
- `/api/ask` spends tokens per call; the in-code rate-limit is per-colo
  best-effort — add a Cloudflare WAF rate-limit rule (or Turnstile) for a hard cap.

## CI

`.github/workflows/ci.yml` (typecheck + lint + unit tests on push/PR) and
`deploy.yml` (Cloudflare Pages deploy, **opt-in** via repo variable
`ENABLE_CF_DEPLOY=true` + secrets).
