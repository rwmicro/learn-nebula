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
import { openaiEmbed, rerank } from "./llm.ts";
import { Bm25 } from "./bm25.ts";

interface Chunk {
  id: string;
  text: string;
  title: string;
  url: string;
}
interface Cached {
  h: string; // sha256(text)
  v: Float32Array;
}

// On-disk vector cache. Vectors are base64 Float32 rather than JSON number
// arrays (~5x smaller, and far cheaper to parse at startup), and the file
// records the model that produced them: vectors from two models don't share a
// space even when their dimension matches, so a model change discards the
// cache instead of silently mixing them.
interface VectorFile {
  version: 2;
  model: string;
  entries: Record<string, { h: string; v: string }>;
}

const EMBED_BATCH = 32;
// A single question embeds in well under a second; if the endpoint takes
// longer than this it's down or busy, and the answer goes ahead without notes
// rather than leaving the reader waiting.
const QUERY_EMBED_TIMEOUT_MS = 8_000;

let state: "disabled" | "loading" | "ready" | "error" = "disabled";
let dim = 0;
let matrix: Float32Array = new Float32Array(0); // N × dim, L2-normalized rows
let metas: Chunk[] = [];
let lex: Bm25 | null = null;

export function ragState() {
  return { state, chunks: metas.length, dim };
}

const hashText = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

const encodeVec = (v: Float32Array) =>
  Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
function decodeVec(s: string): Float32Array {
  const b = Buffer.from(s, "base64");
  // Copy into a fresh, 4-byte-aligned buffer (Buffer pool slices may not be).
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

function normalize(v: ArrayLike<number> & Iterable<number>): Float32Array {
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
  const cache = loadCache();

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
        if (v) cache.set(c.id, { h: hashText(c.text), v: Float32Array.from(v) });
      });
      if (i % (EMBED_BATCH * 20) === 0 && i > 0) {
        console.log(`rag: …${i}/${todo.length}`);
        saveCache(cache); // periodic flush so progress survives a restart
      }
    }
  }
  // Always rewritten with only the current chunks, so notes that were deleted
  // or re-chunked don't keep their vectors in the file forever.
  const live = new Set(chunks.map((c) => c.id));
  for (const id of cache.keys()) if (!live.has(id)) cache.delete(id);
  saveCache(cache);

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
  lex = new Bm25(kept.map((c) => c.text));
  state = "ready";
  console.log(`rag: ready — ${kept.length} chunk(s), dim ${dim}.`);
}

function loadCache(): Map<string, Cached> {
  const cache = new Map<string, Cached>();
  let raw: Partial<VectorFile>;
  try {
    raw = JSON.parse(fs.readFileSync(env.ragVectors, "utf8"));
  } catch {
    return cache; // first run
  }
  if (raw.version !== 2 || !raw.entries) {
    console.log("rag: vector cache is in the old format — re-embedding everything.");
    return cache;
  }
  if (raw.model !== env.embedModel) {
    console.log(
      `rag: vector cache was built with "${raw.model}", now "${env.embedModel}" — re-embedding everything.`,
    );
    return cache;
  }
  for (const [id, c] of Object.entries(raw.entries)) cache.set(id, { h: c.h, v: decodeVec(c.v) });
  return cache;
}

function saveCache(cache: Map<string, Cached>) {
  try {
    fs.mkdirSync(path.dirname(env.ragVectors), { recursive: true });
    const file: VectorFile = { version: 2, model: env.embedModel, entries: {} };
    for (const [id, c] of cache) file.entries[id] = { h: c.h, v: encodeVec(c.v) };
    // Write-then-rename so a crash mid-write can't leave a truncated cache.
    const tmp = `${env.ragVectors}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(file));
    fs.renameSync(tmp, env.ragVectors);
  } catch (e) {
    console.warn("rag: could not persist vector cache:", e instanceof Error ? e.message : e);
  }
}

export interface RagHit {
  title: string;
  url: string;
  text: string;
  score: number;
  /** Cosine to the query, whatever ordered the hit (the reranker's score is on
   *  a different scale) — what the questions log records as coverage. */
  cosine: number;
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

// What /api/ask retrieves with (and /api/admin/rag-debug replays).
export const ASK_TOP_K = 5;
export const ASK_MIN_SCORE = 0.4;

// Hybrid retrieval: the dense ranking (cosine) and the lexical one (BM25) are
// fused with Reciprocal Rank Fusion, then optionally reordered by a
// cross-encoder reranker (RERANK_URL).
const CANDIDATES = 30; // per ranking, before fusion
const RERANK_POOL = 20; // fused candidates sent to the reranker
const RRF_K = 60;
// A lexical match must earn its place: either it shares a RARE word with the
// question (in ≤1% of chunks — a transliteration, a name, a native-script
// word: exactly what embeddings miss), or it is still semantically close
// (cosine within 0.1 of the dense threshold). Otherwise any chunk sharing a
// common word with the question would get in.
const LEXICAL_RARE_DF = 0.01;
const LEXICAL_COSINE_FLOOR_DELTA = 0.1;
// bge-reranker scores are sigmoid 0..1; unrelated passages sit near 0.
const RERANK_MIN_SCORE = 0.02;
const MAX_PER_NOTE = 2; // keep a single long note from filling every slot
const RERANK_TIMEOUT_MS = 8_000;

/** One retrieval candidate with every score that placed it — what
 *  /api/admin/rag-debug shows. `bm25` is null when the chunk only came in
 *  through the dense ranking, `rerank` when no reranker ran on it. */
export interface ScoredChunk {
  title: string;
  url: string;
  text: string;
  cosine: number;
  bm25: number | null;
  /** Shares a rare query word with the question (see LEXICAL_RARE_DF). */
  rare: boolean;
  rrf: number;
  rerank: number | null;
  /** Kept in the final top-K (after the reranker floor and the per-note cap). */
  kept: boolean;
}

export interface RetrievalTrace {
  /** Candidates in final order (reranked when the reranker ran). */
  candidates: ScoredChunk[];
  hits: RagHit[];
  reranked: boolean;
  rerankError: string | null;
}

/** The whole hybrid pipeline with its intermediate scores, or null when the
 *  index isn't ready / the query vector doesn't match it. search() is this,
 *  minus the trace. */
export async function retrieve(
  query: string,
  topK: number,
  minScore: number,
  prefix = "",
): Promise<RetrievalTrace | null> {
  if (state !== "ready" || !metas.length || !dim) return null;
  const [qv] = await openaiEmbed(
    env.embedBaseUrl,
    env.embedModel,
    [query.slice(0, 2000)],
    undefined,
    QUERY_EMBED_TIMEOUT_MS,
  );
  const q = normalize(qv);
  if (q.length !== dim) {
    // The endpoint now serves a different model than the index was built with
    // (EMBED_MODEL unchanged, model swapped behind it). Say so — an empty
    // result here otherwise looks exactly like "no relevant notes".
    console.warn(`rag: query vector has dim ${q.length}, index has ${dim} — restart to re-embed.`);
    return null;
  }

  const inScope = (i: number) => !prefix || metas[i].url.startsWith(prefix);
  const n = metas.length;
  const cos = new Float32Array(n);
  const dense: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!inScope(i)) continue;
    let dot = 0;
    const off = i * dim;
    for (let d = 0; d < dim; d++) dot += matrix[off + d] * q[d];
    cos[i] = dot;
    if (dot >= minScore) dense.push(i);
  }
  dense.sort((a, b) => cos[b] - cos[a]);
  const lexHits = (lex?.search(query, CANDIDATES, inScope, LEXICAL_RARE_DF) ?? []).filter(
    (h) => h.rare || cos[h.i] >= minScore - LEXICAL_COSINE_FLOOR_DELTA,
  );
  const lexical = lexHits.map((h) => h.i);
  const lexScore = new Map(lexHits.map((h) => [h.i, h]));

  const fused = new Map<number, number>();
  for (const list of [dense.slice(0, CANDIDATES), lexical]) {
    list.forEach((i, rank) => fused.set(i, (fused.get(i) ?? 0) + 1 / (RRF_K + rank + 1)));
  }
  let ranked: { i: number; s: number; rerank: number | null }[] = [...fused]
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => ({ i, s: cos[i], rerank: null }));

  let reranked = false;
  let rerankError: string | null = null;
  if (env.rerankUrl && ranked.length > 1) {
    const pool = ranked.slice(0, RERANK_POOL);
    try {
      const scores = await rerank(
        env.rerankUrl,
        query.slice(0, 2000),
        pool.map(({ i }) => metas[i].text),
        RERANK_TIMEOUT_MS,
      );
      ranked = pool
        .map(({ i }, k) => ({ i, s: scores[k], rerank: scores[k] }))
        .sort((a, b) => b.s - a.s);
      reranked = true;
    } catch (e) {
      // Degrade to the fused order rather than failing the question.
      rerankError = e instanceof Error ? e.message : String(e);
      console.warn("rag: rerank failed —", rerankError);
    }
  }

  const perNote = new Map<string, number>();
  const hits: RagHit[] = [];
  const keptIdx = new Set<number>();
  for (const { i, s, rerank: rr } of ranked) {
    if (hits.length >= topK) break;
    if (rr !== null && rr < RERANK_MIN_SCORE) continue;
    const m = metas[i];
    const c = perNote.get(m.url) ?? 0;
    if (c >= MAX_PER_NOTE) continue;
    perNote.set(m.url, c + 1);
    keptIdx.add(i);
    hits.push({ title: m.title, url: m.url, text: m.text, score: s, cosine: cos[i] });
  }

  const candidates: ScoredChunk[] = ranked.map(({ i, rerank: rr }) => {
    const m = metas[i];
    const l = lexScore.get(i);
    return {
      title: m.title,
      url: m.url,
      text: m.text,
      cosine: cos[i],
      bm25: l ? l.s : null,
      rare: l ? l.rare : false,
      rrf: fused.get(i) ?? 0,
      rerank: rr,
      kept: keptIdx.has(i),
    };
  });
  return { candidates, hits, reranked, rerankError };
}

/** Top-K chunks for `query`, restricted to chunks whose URL starts with
 *  `prefix` when one is given. `minScore` is the cosine a chunk needs to enter
 *  through the dense ranking alone. */
export async function search(
  query: string,
  topK: number,
  minScore: number,
  prefix = "",
): Promise<RagHit[]> {
  return (await retrieve(query, topK, minScore, prefix))?.hits ?? [];
}

export interface RelatedHit {
  title: string;
  url: string;
  score: number;
}

/** Semantically similar notes for a note page's "notes proches" — same index
 *  as search(), just aggregated per note (a note is several chunks) instead of
 *  per chunk, and compared against every OTHER note's centroid. No separate
 *  index is kept for this: N notes × dim is a few MB, cheap to recompute per
 *  request at this site's scale (thousands of chunks, one owner). */
export function relatedNotes(url: string, topK: number): RelatedHit[] {
  if (state !== "ready" || !metas.length || !dim) return [];

  const centroid = new Float32Array(dim);
  let ownChunks = 0;
  for (let i = 0; i < metas.length; i++) {
    if (metas[i].url !== url) continue;
    const off = i * dim;
    for (let d = 0; d < dim; d++) centroid[d] += matrix[off + d];
    ownChunks++;
  }
  if (!ownChunks) return []; // note not in the index (e.g. embeddings still building)
  const q = normalize(Array.from(centroid, (x) => x / ownChunks));

  const sums = new Map<string, { vec: Float32Array; title: string; n: number }>();
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i];
    if (m.url === url) continue;
    let e = sums.get(m.url);
    if (!e) {
      e = { vec: new Float32Array(dim), title: m.title, n: 0 };
      sums.set(m.url, e);
    }
    const off = i * dim;
    for (let d = 0; d < dim; d++) e.vec[d] += matrix[off + d];
    e.n++;
  }

  const scored: RelatedHit[] = [];
  for (const [otherUrl, e] of sums) {
    const nv = normalize(Array.from(e.vec, (x) => x / e.n));
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += nv[d] * q[d];
    scored.push({ title: e.title, url: otherUrl, score: dot });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// --- /api/search ("Proches par le sens" in the ⌘K palette) -----------------

export interface DenseHit {
  title: string;
  url: string;
  text: string;
  cosine: number;
}

/** Dense-only nearest chunks for `query` (no BM25, no reranker, no LLM): the
 *  palette already has exact words through Pagefind; this adds what is close
 *  in meaning. `null` when the index isn't ready or the vector doesn't fit. */
export async function denseSearch(query: string, topK: number, minScore: number): Promise<DenseHit[] | null> {
  if (state !== "ready" || !metas.length || !dim) return null;
  const [qv] = await openaiEmbed(
    env.embedBaseUrl,
    env.embedModel,
    [query.slice(0, 500)],
    undefined,
    QUERY_EMBED_TIMEOUT_MS,
  );
  const q = normalize(qv);
  if (q.length !== dim) return null;
  const scored: { i: number; s: number }[] = [];
  for (let i = 0; i < metas.length; i++) {
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
    cosine: s,
  }));
}
