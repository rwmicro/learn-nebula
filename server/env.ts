// Central runtime configuration, all from environment variables so the same
// image runs anywhere. Nothing here is secret at import time; secrets are read
// lazily where used.

import "./load-env.ts"; // load a local .env first (imported before we read process.env)
import path from "node:path";

const cwd = process.cwd();

export const env = {
  port: Number(process.env.PORT || 8085),
  // Static export served at "/". Built in CI, copied into the image.
  staticDir: process.env.STATIC_DIR || path.join(cwd, "out"),

  // Comments store (SQLite). Put it on a mounted volume so it persists.
  dbPath: process.env.DB_PATH || path.join(cwd, "data", "comments.db"),

  // RAG: chunks baked into the image at build; vectors embedded at runtime and
  // cached on the volume next to the DB.
  ragChunks: process.env.RAG_CHUNKS || path.join(cwd, "data", "rag-chunks.json"),
  ragVectors:
    process.env.RAG_VECTORS ||
    path.join(path.dirname(process.env.DB_PATH || path.join(cwd, "data", "x")), "rag-vectors.json"),

  // Build-time reports for /admin, baked into the image next to the chunks
  // (scripts/build-info.mjs, scripts/vault-health.ts). Admin-only: they live
  // outside out/ so the static server never exposes them.
  buildInfo: process.env.BUILD_INFO || path.join(cwd, "data", "build-info.json"),
  vaultHealth: process.env.VAULT_HEALTH || path.join(cwd, "data", "vault-health.json"),
  prereqSuggestions:
    process.env.PREREQ_SUGGESTIONS || path.join(cwd, "data", "prereq-suggestions.json"),
  factsToCheck: process.env.FACTS_TO_CHECK || path.join(cwd, "data", "facts-to-check.json"),
  // The set of real note slugs and Anki deck slugs, written at build by
  // scripts/build-content-manifest.ts and baked into the image next to the
  // chunks. The progress-sync coin logic checks a read/review against it before
  // paying, so fabricated slugs/keys can't mint coins (server/content-manifest.ts).
  // Absent (e.g. a dev run with no build) → validation is skipped and activity
  // pays as before, so nothing breaks without a build.
  contentManifest: process.env.CONTENT_MANIFEST || path.join(cwd, "data", "content-manifest.json"),

  // /admin "Reconstruire le site": a fine-grained token with Actions
  // read/write on GITHUB_REPO dispatches .github/workflows/docker.yml and
  // lists its runs. Unset → the card shows the feature as disabled.
  githubToken: process.env.GITHUB_TOKEN || "",
  githubRepo: process.env.GITHUB_REPO || "rwmicro/learn-nebula",
  // /admin "Accepter" on prerequisite suggestions: commits the frontmatter
  // edit to the vault on a new branch and opens a PR. Needs Contents + Pull
  // requests write on PENSINE_REPO; falls back to GITHUB_TOKEN. Unset → disabled.
  pensineRepo: process.env.PENSINE_REPO || "rwmicro/pensine",
  pensineToken: process.env.PENSINE_TOKEN || process.env.GITHUB_TOKEN || "",

  // Generation: Anthropic when a key is present, otherwise an OpenAI-compatible
  // chat endpoint (Ollama / llama.cpp / LM Studio).
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  genModel: process.env.GEN_MODEL || "claude-haiku-4-5-20251001",
  translateModel: process.env.TRANSLATE_MODEL || "claude-haiku-4-5-20251001",
  llmBaseUrl: process.env.LLM_BASE_URL || "",
  llmModel: process.env.LLM_MODEL || "",

  // Retrieval embeddings (OpenAI-compatible /v1/embeddings). Unset → no
  // retrieval (the assistant answers from the model alone, like dev mode).
  embedBaseUrl: process.env.EMBED_BASE_URL || "",
  embedModel: process.env.EMBED_MODEL || "bge-m3",
  // Optional cross-encoder reranker (TEI /rerank endpoint, full URL, e.g. a
  // second TEI running BAAI/bge-reranker-v2-m3). Unset → hybrid order is kept.
  rerankUrl: process.env.RERANK_URL || "",

  // Comments moderation / anti-spam (optional).
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY || "",
  adminToken: process.env.COMMENTS_ADMIN_TOKEN || "",
  // Reader accounts (lower-cased e-mails, comma-separated) that /admin accepts
  // through their normal login session instead of the pasted token.
  adminEmails: (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // How old a login session may be and still carry admin rights: past it, a
  // fresh magic link is needed (the reader session itself keeps working).
  adminSessionMaxAgeMs: Number(process.env.ADMIN_SESSION_HOURS ?? 12) * 3_600_000,
  // /admin flags an account that earned at least this many coins in 24 h
  // (the daily caps allow ~110 a day plus streak bonuses). 0 = never.
  coinAlert24h: Number(process.env.COIN_ALERT_24H ?? 150),
  // Name shown on the owner's replies to comments (default: lib/site.ts AUTHOR).
  commentAuthorName: process.env.COMMENT_AUTHOR_NAME || "",
  // Fired (fire-and-forget) when a comment lands in the moderation queue, so
  // checking /admin doesn't have to be a polling habit. Any URL that accepts a
  // plain-text POST body works — e.g. an ntfy.sh topic.
  commentWebhookUrl: process.env.COMMENT_WEBHOOK_URL || "",

  // Reader accounts (server/routes/auth.ts): login by e-mailed magic link.
  // SMTP_HOST unset → login is disabled (503), unless AUTH_DEV_LOG=true, which
  // prints the link to the console instead of mailing it (local dev only).
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  // Implicit TLS (port 465). Default: on for 465, STARTTLS otherwise.
  smtpSecure: process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : Number(process.env.SMTP_PORT || 587) === 465,
  mailFrom: process.env.MAIL_FROM || "",
  authDevLog: process.env.AUTH_DEV_LOG === "true",
  // Base URL of the login links and the origin mutating account requests must
  // come from. Defaults to the site's SITE_URL (lib/site.ts); override for a
  // local test (e.g. http://localhost:8085).
  publicUrl: (process.env.PUBLIC_URL || "").replace(/\/$/, ""),
  // Public Turnstile site key handed to the login form by /api/auth/config.
  // The static site already inlines NEXT_PUBLIC_TURNSTILE_SITE_KEY at build;
  // this is the runtime copy (same value).
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "",

  // Trust X-Forwarded-For (set true only behind a reverse proxy you control).
  trustProxy: process.env.TRUST_PROXY !== "false",
  // When set, read the client IP from ONLY this request header (e.g.
  // "cf-connecting-ip") instead of the CF-Connecting-IP → X-Real-IP →
  // X-Forwarded-For cascade. Pin it to the one header your proxy sets and
  // overwrites itself, so a client can't pick its own IP and slip every per-IP
  // limit below (see server/http.ts). Lower-cased; only consulted when
  // trustProxy is on. Unset → the legacy cascade.
  clientIpHeader: (process.env.CLIENT_IP_HEADER || "").trim().toLowerCase(),

  // Hard per-IP hourly caps on the paid LLM endpoints (cost guard, on top of the
  // short cooldown). 0 disables the cap. Per-instance, in-memory, IP-keyed.
  askHourly: Number(process.env.ASK_HOURLY_LIMIT ?? 40),
  translateHourly: Number(process.env.TRANSLATE_HOURLY_LIMIT ?? 20),
  // Instance-wide daily caps on the same paid endpoints — a backstop the
  // per-IP caps can't give, since an attacker who can vary the observed IP
  // (or simply uses many) bypasses per-IP accounting. Counts every request to
  // the endpoint, all IPs together. 0 disables. Per-instance, in-memory.
  askDaily: Number(process.env.ASK_DAILY_LIMIT ?? 1000),
  translateDaily: Number(process.env.TRANSLATE_DAILY_LIMIT ?? 400),
};

/** Whether any generation backend is configured. */
export function canGenerate(): boolean {
  return Boolean(env.anthropicKey || env.llmBaseUrl);
}
