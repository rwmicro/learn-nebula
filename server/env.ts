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

  // Generation: Anthropic when a key is present, otherwise an OpenAI-compatible
  // chat endpoint (Ollama / llama.cpp / LM Studio).
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  genModel: process.env.GEN_MODEL || "claude-haiku-4-5",
  translateModel: process.env.TRANSLATE_MODEL || "claude-sonnet-4-6",
  llmBaseUrl: process.env.LLM_BASE_URL || "",
  llmModel: process.env.LLM_MODEL || "",

  // Retrieval embeddings (OpenAI-compatible /v1/embeddings). Unset → no
  // retrieval (the assistant answers from the model alone, like dev mode).
  embedBaseUrl: process.env.EMBED_BASE_URL || "",
  embedModel: process.env.EMBED_MODEL || "bge-m3",

  // Comments moderation / anti-spam (optional).
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY || "",
  adminToken: process.env.COMMENTS_ADMIN_TOKEN || "",

  // Trust X-Forwarded-For (set true only behind a reverse proxy you control).
  trustProxy: process.env.TRUST_PROXY !== "false",

  // Hard per-IP hourly caps on the paid LLM endpoints (cost guard, on top of the
  // short cooldown). 0 disables the cap. Per-instance, in-memory, IP-keyed.
  askHourly: Number(process.env.ASK_HOURLY_LIMIT ?? 40),
  translateHourly: Number(process.env.TRANSLATE_HOURLY_LIMIT ?? 20),
};

/** Whether any generation backend is configured. */
export function canGenerate(): boolean {
  return Boolean(env.anthropicKey || env.llmBaseUrl);
}
