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
Pages because the vault exceeds Pages' 20,000-file-per-deploy cap. The backend is
`server/` (Hono). The old Cloudflare Pages Functions (`functions/`), the CF
deploy workflow, and `_routes.json`/`_redirects` were removed from `main`; they
live on the `cloudflare-deploy` branch, the Cloudflare fallback.

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
npx pnpm@10.28.0 run --stream server    # run the Node backend against a built out/ — see gotcha below
npx pnpm@10.28.0 build:server           # esbuild bundle → build/server/index.mjs (what the image runs)
```

Also: `pnpm format` (prettier), `pnpm test` (build + Playwright), `pnpm
build:docker` (site + RAG chunks, what the Docker CI runs).

### Big gotchas
- **Bare `pnpm server` / `pnpm run server` silently does nothing** — pnpm
  10.28.0's default (non-streamed) reporter exits in ~1.3s with zero output,
  before the script ever prints a line, no error, exit code 0. Confirmed not a
  one-off: reproduced repeatedly, while `pnpm exec tsx server/index.ts` (same
  effective command, bypassing the `run` lifecycle) always works. Fix: add
  `--stream` **between `run` and the script name** —
  `pnpm run --stream server` — which reliably keeps it alive; the bare
  `pnpm --stream server` shorthand does NOT fix it (the flag lands somewhere
  `run`'s shorthand parser doesn't honour the same way). If a future pnpm
  version fixes this upstream, this note (and the `--stream` in the command
  above) can go.
- **`/api/*` do NOT run under `next dev`** — they're served by the Node backend
  in `server/`. To exercise the assistant / comments / translate, build (`out/`)
  then `pnpm server` with the relevant env vars (see `.env.example`).
- **Full-text search (Pagefind) only exists after `pnpm build`** (indexes `out/`).
  In dev the command palette's "Dans le texte" group simply never appears.
- **UI messages ship as files, not inline**: `scripts/build-i18n.ts` writes
  `public/i18n/<locale>.<hash>.js` (git-ignored, immutable cache); the
  `<head>` bootstrap in `app/layout.tsx` loads `fr` + the stored locale, and
  `public/js/i18n.js` fetches any other one on switch. Run predev/build (or
  `tsx scripts/build-i18n.ts`) after editing `messages/*.json`.
- **The image runs the compiled server** (`build/server/index.mjs`, Dockerfile
  `server` stage, `node_modules` external) with a read-only root filesystem
  in prod: write only under `/data` (or `/tmp`). CI bundles and boots it.
- **`public/js/note.bundle.js` is generated** by `bundle-js.mjs` (git-ignored) —
  never edit it; edit the source `public/js/*.js` and re-run bundle-js.
- Verify UI changes **visually** (Playwright screenshots, desktop+mobile) — much
  of this codebase is layout/canvas that tsc can't validate.
- **`scripts/fetch-notes.mjs` keeps a persistent clone at `.cache/pensine`**
  (gitignored; CI restores/saves it via `actions/cache`, key `pensine-vault-*`),
  updated in place rather than re-cloned. The ~700MB of Anki `.apkg` decks are
  git-lfs objects — a throwaway clone re-pulling them on every build/CI run is
  what exhausts the GitHub account's shared LFS bandwidth quota (it ran out in
  Sept 2026). Don't reintroduce a fresh-clone-per-run pattern here. The ~10k
  pronunciation `.mp3` clips (214MB, ≤110KB each) were moved out of LFS into
  plain git for that reason; keep them there. If LFS can't be fetched,
  `copy-vault-images.mjs` skips the pointer stubs and warns in the build log.

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
- **Search** is the command palette, `public/js/palette.js` (⌘K / Ctrl K, "/",
  or the home's search field): note titles (`/notes-index.json`), disciplines,
  tags, PDFs and Anki decks (`/palette-extra.json`), and note bodies via
  Pagefind; "?" opens the keyboard shortcuts help.
- **Client components**: `components/HomeContent.tsx` (browse tree, RAG
  assistant, lazy graph preview; its search field opens the palette),
  `components/Graph.tsx` (force-graph), `Header.tsx` (masthead + mobile hamburger),
  `LangSwitcher.tsx`, etc.
- **Backend** (`server/`, Hono on Node, typecheck with `tsc -p server/tsconfig.json`):
  `index.ts` mounts `routes/ask.ts` (RAG: embed the question via an
  OpenAI-compatible endpoint → hybrid search over `data/rag-chunks.json`, in-memory
  cosine + BM25 (`bm25.ts`) fused by RRF, optional TEI reranker via `RERANK_URL`
  → Anthropic or OpenAI-compatible generation, NDJSON stream), `routes/comments.ts`
  (SQLite via better-sqlite3, Turnstile), `routes/translate.ts` (translations
  cached in the same SQLite file, keyed on model + languages + source).
  Chunks (`scripts/build-rag-chunks.mjs`) are split at headings and start with a
  `Title › Section` breadcrumb line; the vector cache on `/data` records the
  embedding model and is discarded when it changes. Config is
  centralised in `server/env.ts` (all `process.env`); everything degrades to
  "disabled" when its vars are unset.
  **Reader accounts** (same SQLite file): magic-link login by e-mail
  (`routes/auth.ts`, nodemailer via `SMTP_*`, or `AUTH_DEV_LOG=true` to print
  the link in dev), `gk_session` HttpOnly cookie (only SHA-256 hashes of login
  tokens and sessions are stored), and `routes/account.ts`: `/api/me`,
  `/api/progress/sync` (merges with `lib/progress-transfer.ts`'s
  `validateImport`/`mergeValue`, so new `PROGRESS_KEYS` sync with no server
  change), `/api/account`, `/api/shop` (items from `lib/avatar.ts`). Coins are
  decided server-side only, from the stored-vs-merged diff (`accounts.ts`,
  pure + tested; SQL in `account-store.ts`) into an append-only `coin_events`
  ledger. Mutating account routes require a same-site `Origin`
  (`session.ts`). `server/tsconfig.json` includes the DOM lib because
  `progress-transfer.ts` carries browser glue.
- **`/admin/`** (`components/AdminPanel.tsx`, `robots: {index:false}`): owner-only
  console, not linked from the public nav. Sections, cards and dashboard tiles
  are declared in `components/admin/config.tsx`; data is shared through
  `components/admin/store.ts`. Signed in by the owner's reader session
  (`ADMIN_EMAILS`) or the pasted `COMMENTS_ADMIN_TOKEN` (`server/auth.ts`).
  Server side: `server/routes/admin.ts`, `admin-tools.ts`, `admin-console.ts`
  (LLM usage, 30-day activity, the `admin_events` journal written by
  `audit()`, owner replies with an author badge, ignored prerequisites,
  webhook test). Its UI deliberately doesn't follow the site's typography
  (compact sans, dense sortable tables); "?" lists the keyboard shortcuts.
- **Retrieval scope**: `/api/ask` takes an optional `scope` — a slugified folder
  path validated by `scopePrefix()` (`server/rag.ts`), which filters the cosine
  search to chunks whose URL starts with `/posts/<scope>/`. It feeds the
  assistant's language picker (`getLanguageScopes()` in `lib/content.ts` lists
  the `Languages - Dialects` sub-folders at build), so a question about one
  language stops retrieving chunks from the seventeen others. The slug charset
  is what makes it safe to echo the folder name into the system prompt.
- **Share images**: `scripts/build-og-images.ts` (tsx, before `next build`)
  draws a 1200×630 card per note into `public/og/` (git-ignored; fonts in
  `assets/og/`). Files are named by a hash of what they show (`lib/og.ts`), so
  rebuilds only draw new/renamed notes. Note pages use the card only when the
  file exists and the note has no image of its own. Never fails the build.
- **`/jardin/`** (vault in numbers, `lib/garden-stats.ts`, server-only SVG) and
  **`/parcours/<slug>/fiche/`** (printable revision sheet: definitions,
  `[!important]` key points via `lib/path-sheet.ts`, quiz questions, answers on
  the last page) are pure build-time pages.
- **Widget goals**: a widget block can carry `objectif`, `cible`, `indice`,
  `bravo`, `erreur` lines (syntax in pensine's `sources/CLAUDE.md`); builders in
  `public/js/widgets.js` publish their values through `ctx.report()` and
  `withGoals()` checks them. A reached goal fires `gk:widget-goal`.
- **Pronunciation practice** (`public/js/pronounce.js`): after a clip plays, a
  mic button opens a coach that records the reader (MediaRecorder, max 6 s,
  nothing leaves the browser) and draws both waveforms. Playback goes through
  Web Audio, not a `blob:` URL, so no CSP `media-src` change is needed; the
  server's `Permissions-Policy` allows `microphone=(self)`.
- **Mermaid diagrams** are SVG rendered at build (`scripts/render-mermaid.mjs`,
  Chromium). `lib/mermaid-theme.js` then moves the rules every diagram of a
  type shares into one hashed `/_next/static/css/mermaid.<hash>.css`, with
  the theme's hex swapped for the site's colour tokens: the diagrams follow
  light/dark, and each SVG keeps only its author's `classDef`/`style` rules.
  `pinLabelInk()` (`lib/mermaid-source.js`) gives a pale custom fill dark
  text so it stays legible in dark mode. `public/js/diagram-zoom.js` adds
  "Agrandir" (full-screen pan/zoom). The browser fallback
  (`mermaid-render.js`) keeps mermaid's inline light theme in a `.keep-light`
  card.

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
- Runtime secrets are passed at `docker run` / compose (`.env.example` is the
  canonical list — every var, what it enables, what it degrades to when unset),
  never baked into the image. Comments + the RAG vector cache live on a `/data`
  volume, so they survive rebuilds — don't drop that volume.
- **Production deployment lives OUTSIDE this repo**, in a separate private
  infra project (`soc-infrastructure`, Ansible + podman-compose, **branch
  `raspberry-pi`** — that repo's `main` is stale; its CI checks that every
  var of this `.env.example` is passed in `compose.pensine.yml`) that pulls
  `ghcr.io/rwmicro/learn-nebula:latest` and renders its own `.env` from
  `.env.example`'s contract, plus its own TEI sidecar (with the same amd64 vs
  `cpu-arm64-*` split noted above, under its own var name). This repo's
  `docker-compose.test.yml` is **local dev/test only** (`build: .`, e.g. a local
  LM Studio as the generation backend) — don't treat it as prod config, and
  don't assume a change here needs to be mirrored there or vice versa.
- The tracked lockfile is **`pnpm-lock.yaml`** (what Docker/CI use). A stale,
  untracked npm `package-lock.json` may linger locally; it's unused — safe to delete.

## Reader feedback
- `public/js/error-beacon.js` (site-wide) posts uncaught errors to
  `/api/client-error` (deduped by message+source, ≤5 per page, capped table
  `client_errors`); "Signaler" in the selection menu posts a passage + remark
  to `/api/report` (`error_reports`). Both show in /admin (Site / Contenu).
  Normalisation is `lib/feedback.ts` (tested). `app/error.tsx` and
  `app/admin/error.tsx` are the React error boundaries.
- Under each note's title, "historique" links to the file's GitHub commits
  (`noteHistoryUrl()` in `lib/site.ts`, from NOTES_REPO_URL/BRANCH/SUBDIR).

## Newer browser features (all feature-detected, hidden when absent)
- **Passkeys** (`server/routes/passkey.ts`, `@simplewebauthn`, RP from
  PUBLIC_URL/SITE_URL) beside the magic link; **Web Push reminders**
  (`server/push*.ts`, VAPID_*; Declarative Web Push payload, handled in
  `public/sw.js`); app badge = cards due (`lib/app-badge.ts`).
- **On-device AI** (`lib/browser-ai.ts`): Translator first in `translate.js`,
  LanguageDetector `lang` hint to `/api/ask`, Prompt API for "Avec mes mots"
  and the socratic mode with `/api/ask/explain` / `socratic: true` as server
  fallback (prompts shared in `lib/ask-prompts.ts`). On-device speech check
  in the pronunciation coach (`lib/speech-match.ts`, `processLocally` only).
- **`/api/search`**: embedding-only nearest notes for the palette's "Proches
  par le sens" group (`server/routes/search.ts`, needs RAG).
- **Duel / tandem** (`/duel/`, `components/Duel.tsx`, `lib/duo-rtc.ts`):
  WebSocket signaling at `/api/room/:code` (`server/rooms.ts`, @hono/node-ws,
  two peers, nothing stored), RTCDataChannel / audio, optional Cloudflare
  TURN via TURN_KEY_ID/TURN_KEY_API_TOKEN. The duel only appears on notes with
  ≥ 2 `[!quiz]` cards that have a `- [x]` choice (`public/js/duo-invite.js`).
- Native CSS: anchor-positioned popovers (`lib/anchor-popover.ts`) for the
  link preview and glossary, `scroll-state` sticky bar and scroll-driven
  progress (JS fallbacks kept), `@starting-style`, `field-sizing`; Wake Lock
  (`lib/wake-lock.ts`) in review and lesson mode; Document PiP review
  (`components/ReviewPip.tsx`).

## CI

`.github/workflows/ci.yml` (typecheck app **and** `server/`, compile + boot
the server, oxlint + ESLint, unit tests, and a full static-export build on
push/PR) and `docker.yml` (image build/push, above; its actions are pinned by
SHA since it holds the GHCR write token). `uptime.yml` probes
`https://4d52.net/healthz` every 15 min from outside and opens/closes a
`site-down` issue (optional ntfy via secret `UPTIME_NTFY_URL`).
`ghcr-retention.yml` (weekly) keeps `latest` + the 10 newest `sha-*` images
and every manifest they reference; dry run unless repo var `GHCR_PRUNE=true`.
pensine's own `check-notes.yml` runs `scripts/vault-health.ts` on each vault
PR (base vs head) and fails only on what the PR adds — keep that script's
JSON shape stable. The Cloudflare deploy workflow lives on `cloudflare-deploy`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
