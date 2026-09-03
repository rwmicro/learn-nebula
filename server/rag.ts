// Self-hosted RAG retrieval: Vectorize + Workers-AI become a local flat index.
//
//   build time (CI): scripts/build-rag-chunks.mjs writes data/rag-chunks.json
//                    — just the note chunks (id, text, title, url), no vectors.
//   runtime:         embed each chunk once through the OpenAI-compatible
//                    /v1/embeddings endpoint (EMBED_BASE_URL), cache the vectors
//                    on the volume, and hold a normalized matrix in memory for
//                    cosine search. Incremental: only re-embed changed chunks.
//
// If EMBED_BASE_URL is unset, retrieval is disabled and the assistant answers
// from the model alone (like the dev path). Embedding runs in the background so
// the server serves immediately; search() returns [] until it's ready.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env.ts";
import { openaiEmbed } from "./llm.ts";

interface Chunk {
  id: string;
  text: string;
  title: string;
  url: string;
}
interface Cached {
  h: string; // sha256(text)
  v: number[];
}

const EMBED_BATCH = 32;

let state: "disabled" | "loading" | "ready" | "error" = "disabled";
let dim = 0;
let matrix: Float32Array = new Float32Array(0); // N × dim, L2-normalized rows
let metas: Chunk[] = [];

export function ragState() {
  return { state, chunks: metas.length, dim };
}

const hashText = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

function normalize(v: number[]): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** Kick off index construction in the background. Safe to call once at startup.
 *  Retries with backoff so a slow-starting embeddings service (e.g. the TEI
 *  container still downloading its model on first `docker compose up`) doesn't
 *  leave retrieval permanently disabled — it comes up on its own once ready. */
export function initRag(): void {
  if (!env.embedBaseUrl) {
    state = "disabled";
    console.log("rag: EMBED_BASE_URL unset — retrieval disabled (model-only answers).");
    return;
  }
  state = "loading";
  let attempt = 0;
  const run = () => {
    build().catch((e) => {
      attempt++;
      const wait = Math.min(60_000, 5_000 * attempt); // 5s, 10s, … capped at 60s
      state = "loading";
      console.warn(
        `rag: index build failed (attempt ${attempt}) — ${e instanceof Error ? e.message : e}; retrying in ${wait / 1000}s (is ${env.embedBaseUrl} up?)`,
      );
      const t = setTimeout(run, wait);
      if (typeof t.unref === "function") t.unref();
    });
  };
  run();
}

async function build() {
  let chunks: Chunk[] = [];
  try {
    chunks = JSON.parse(fs.readFileSync(env.ragChunks, "utf8"));
  } catch {
    console.warn(`rag: no chunks at ${env.ragChunks} — retrieval will be empty.`);
    state = "ready";
    return;
  }

  // Load the vector cache (id -> {hash, vector}) from the volume.
  const cache = new Map<string, Cached>();
  try {
    const raw: Record<string, Cached> = JSON.parse(fs.readFileSync(env.ragVectors, "utf8"));
    for (const [id, c] of Object.entries(raw)) cache.set(id, c);
  } catch {
    /* first run */
  }

  const todo = chunks.filter((c) => cache.get(c.id)?.h !== hashText(c.text));
  if (todo.length) {
    console.log(`rag: embedding ${todo.length}/${chunks.length} chunk(s) via ${env.embedBaseUrl}…`);
    for (let i = 0; i < todo.length; i += EMBED_BATCH) {
      const batch = todo.slice(i, i + EMBED_BATCH);
      // Some endpoints 400 on an empty input; never send a blank string.
      const texts = batch.map((c) => (c.text.trim() ? c.text : " "));
      let vecs: (number[] | undefined)[];
      try {
        vecs = await openaiEmbed(env.embedBaseUrl, env.embedModel, texts);
      } catch (batchErr) {
        // Retry one-by-one: tolerates a per-request batch/token limit or a
        // single oversized chunk. If the WHOLE fallback batch fails it's a
        // config error (wrong model, chat model loaded, endpoint down) — rethrow
        // with the real reason instead of logging thousands of warnings.
        console.warn(
          `rag: batch embed failed, retrying individually — ${batchErr instanceof Error ? batchErr.message : batchErr}`,
        );
        vecs = new Array(texts.length);
        let ok = 0;
        for (let k = 0; k < texts.length; k++) {
          try {
            vecs[k] = (await openaiEmbed(env.embedBaseUrl, env.embedModel, [texts[k]]))[0];
            ok++;
          } catch (itemErr) {
            if (k === texts.length - 1 && ok === 0) throw itemErr;
            console.warn(`rag: skipped chunk ${batch[k].id} (embed failed)`);
          }
        }
      }
      batch.forEach((c, j) => {
        const v = vecs[j];
        if (v) cache.set(c.id, { h: hashText(c.text), v });
      });
      if (i % (EMBED_BATCH * 20) === 0 && i > 0) {
        console.log(`rag: …${i}/${todo.length}`);
        saveCache(cache); // periodic flush so progress survives a restart
      }
    }
    saveCache(cache);
  }

  // Build the in-memory normalized matrix (only chunks we have vectors for).
  const kept = chunks.filter((c) => cache.has(c.id));
  dim = kept.length ? cache.get(kept[0].id)!.v.length : 0;
  const m = new Float32Array(kept.length * dim);
  kept.forEach((c, i) => {
    const nv = normalize(cache.get(c.id)!.v);
    m.set(nv, i * dim);
  });
  matrix = m;
  metas = kept;
  state = "ready";
  console.log(`rag: ready — ${kept.length} chunk(s), dim ${dim}.`);
}

function saveCache(cache: Map<string, Cached>) {
  try {
    fs.mkdirSync(path.dirname(env.ragVectors), { recursive: true });
    const obj: Record<string, Cached> = {};
    for (const [id, c] of cache) obj[id] = c;
    fs.writeFileSync(env.ragVectors, JSON.stringify(obj));
  } catch (e) {
    console.warn("rag: could not persist vector cache:", e instanceof Error ? e.message : e);
  }
}

export interface RagHit {
  title: string;
  url: string;
  text: string;
  score: number;
}

// A scope slug is a slugified folder path (lib/content.ts slugifyPath), so it is
// strictly [a-z0-9-] segments — which also makes it safe to echo into the LLM
// prompt. Anything else is treated as "no scope" rather than rejected, so a
// stale client can never break asking.
const SCOPE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** Validate a folder scope slug and turn it into a chunk-URL prefix ("" = all). */
export function scopePrefix(scope: unknown): string {
  if (typeof scope !== "string") return "";
  const s = scope.trim().replace(/^\/+|\/+$/g, "");
  if (!s || s.length > 120 || !SCOPE_RE.test(s)) return "";
  return `/posts/${s}/`;
}

/** Embed the query and return the top-K chunks above `minScore` (cosine),
 *  restricted to chunks whose URL starts with `prefix` when one is given. */
export async function search(
  query: string,
  topK: number,
  minScore: number,
  prefix = "",
): Promise<RagHit[]> {
  if (state !== "ready" || !metas.length || !dim) return [];
  const [qv] = await openaiEmbed(env.embedBaseUrl, env.embedModel, [query.slice(0, 2000)]);
  const q = normalize(qv);
  if (q.length !== dim) return []; // embedding model changed vs the cache
  const n = metas.length;
  const scored: { i: number; s: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (prefix && !metas[i].url.startsWith(prefix)) continue;
    let dot = 0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) dot += matrix[off + d] * q[d];
    if (dot >= minScore) scored.push({ i, s: dot });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, topK).map(({ i, s }) => ({
    title: metas[i].title,
    url: metas[i].url,
    text: metas[i].text,
    score: s,
  }));
}
