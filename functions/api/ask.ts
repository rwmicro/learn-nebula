/// <reference types="@cloudflare/workers-types" />

// RAG assistant endpoint (Cloudflare Pages Function), semantic retrieval edition.
//
// Pipeline, all server-side:
//   1. embed the question with Workers AI (@cf/baai/bge-m3, multilingual)
//   2. query the Vectorize index for the nearest note chunks
//   3. ask Claude Haiku to answer *only* from those chunks, streamed back as
//      NDJSON ({sources}, then {chunk: "…"} per delta, then optional {error})
//
// The note chunks are embedded and upserted at build time by
// scripts/index-notes.mjs. The Anthropic key is the `ANTHROPIC_API_KEY` secret;
// `AI` and `VECTORIZE` are bindings declared in wrangler.toml. Same-origin
// (`/api/ask`), so the site's `connect-src 'self'` CSP already allows the call.

import Anthropic from "@anthropic-ai/sdk";
import { llmConfig, openaiChatDeltas } from "./_llm";

interface Env {
  ANTHROPIC_API_KEY?: string;
  AI?: Ai;
  VECTORIZE?: VectorizeIndex;
  // Dev-only (see .dev.vars): when set, generation goes to an OpenAI-compatible
  // endpoint (e.g. LM Studio) and semantic retrieval is skipped. Unset in prod.
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
}

const GEN_MODEL = "claude-haiku-4-5";
const EMBED_MODEL = "@cf/baai/bge-m3";
const TOP_K = 5;
// Cosine similarity floor for a retrieved chunk to count as relevant. Vectorize
// always returns the TOP_K nearest, even for an off-topic question; without a
// floor those near-random chunks get stuffed into the context and listed as
// sources under a "je ne trouve pas" answer. bge-m3 relevant matches sit well
// above this; ~random ones fall below.
const MIN_SCORE = 0.4;
const MAX_QUESTION = 1000; // chars
const MAX_SELECTION = 4000; // chars

// Module-scope client: reused across hot Worker invocations instead of being
// re-instantiated per request.
let cachedClient: Anthropic | null = null;
function getAnthropic(key: string): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: key });
  return cachedClient;
}

// In-flight set keyed by IP — refuses parallel duplicates from the same
// client (the typical misclick / impatient resend). Cleared once the stream
// finishes. Not a real rate limiter (Workers are ephemeral and per-region),
// just a cheap dedupe to avoid burning tokens on accidental double-submits.
const inFlight = new Set<string>();

// Per-IP cooldown via the Cache API: this endpoint spends Anthropic + Workers AI
// tokens, so throttle rapid sequential calls to blunt scripted abuse. Per-colo
// (the cache is per data centre) and best-effort — for a hard global limit, add
// a Cloudflare WAF rate-limiting rule or Turnstile on top. Fails open if the
// cache is unavailable.
const RATE_COOLDOWN_S = 3;
async function rateLimited(ip: string): Promise<boolean> {
  if (ip === "anon") return false;
  try {
    const cache = caches.default;
    const key = new Request(`https://ratelimit.internal/ask/${encodeURIComponent(ip)}`);
    if (await cache.match(key)) return true;
    await cache.put(
      key,
      new Response("1", { headers: { "cache-control": `max-age=${RATE_COOLDOWN_S}` } }),
    );
    return false;
  } catch {
    return false;
  }
}

type ReplyLang = "fr" | "en" | "es" | "zh";
const REPLY_LANGS = new Set<string>(["fr", "en", "es", "zh"]);
const DEFAULT_Q: Record<ReplyLang, string> = {
  fr: "Explique ce passage.",
  en: "Explain this passage.",
  es: "Explica este pasaje.",
  zh: "解释这段内容。",
};

function buildSystem(): string {
  return [
    "Tu es l'assistant de « The Gardener », un jardin de notes personnel.",
    "Règles :",
    "- Réponds UNIQUEMENT à partir des extraits de notes fournis dans le message de l'utilisateur.",
    "- Si un « passage sélectionné » est fourni, c'est l'extrait que l'utilisateur veut comprendre : appuie-toi dessus en priorité.",
    "- Si la réponse n'y figure pas, dis-le clairement (« Je ne trouve pas cela dans les notes ») — n'invente rien et n'utilise pas de connaissances générales extérieures aux notes.",
    "- Quand c'est utile, cite le titre des notes que tu utilises.",
    "- Le texte peut utiliser du Markdown léger (**gras**, *italique*, `code`, listes `- `).",
    "- Réponds TOUJOURS dans la même langue que la question de l'utilisateur (celle qui suit « Question : » ci-dessous), de façon concise et claire — quelle que soit la langue des notes.",
  ].join("\n");
}

interface ChunkMeta {
  title?: string;
  url?: string;
  text?: string;
}

function ndLine(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const llm = llmConfig(env);
  if (!llm && !env.ANTHROPIC_API_KEY) {
    return json(
      { error: "Assistant non configuré (ANTHROPIC_API_KEY manquante)." },
      503,
    );
  }

  let payload: { question?: string; selection?: string; locale?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }

  const replyLang: ReplyLang = REPLY_LANGS.has(payload.locale ?? "")
    ? (payload.locale as ReplyLang)
    : "fr";
  const defaultQ = DEFAULT_Q[replyLang];
  const selection = (payload.selection ?? "").trim().slice(0, MAX_SELECTION);
  const question = (
    (payload.question ?? "").trim() || (selection ? defaultQ : "")
  ).slice(0, MAX_QUESTION);
  if (!question) {
    return json({ error: "Question manquante." }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "anon";
  if (await rateLimited(ip)) {
    return json({ error: "Trop de requêtes — réessaie dans un instant." }, 429);
  }
  if (inFlight.has(ip)) {
    return json({ error: "Une requête est déjà en cours." }, 429);
  }
  inFlight.add(ip);

  // 1 + 2. Semantic retrieval (embed → Vectorize). Skipped when running against
  // a local OpenAI-compatible model (dev) or when the AI/VECTORIZE bindings are
  // absent — the assistant then answers without note context.
  const sources: { title: string; url: string }[] = [];
  let context = "";
  const ai = env.AI;
  const vectorize = env.VECTORIZE;
  if (!llm && ai && vectorize) {
    try {
      // Fold the selection into the query so retrieval finds its source note.
      const queryText = (
        selection ? `${question}\n${selection}` : question
      ).slice(0, 2000);
      const embedding = (await ai.run(EMBED_MODEL, {
        text: [queryText],
      })) as { data?: number[][] };
      if (!embedding?.data?.length || !embedding.data[0]?.length) {
        inFlight.delete(ip);
        return json({ error: "Échec de l'embedding." }, 502);
      }
      const result = (await vectorize.query(embedding.data[0], {
        topK: TOP_K,
        returnMetadata: "all",
      })) as { matches: { score?: number; metadata?: ChunkMeta }[] };

      const seen = new Set<string>();
      const blocks: string[] = [];
      for (const match of result.matches ?? []) {
        // Skip weak matches so an off-topic question yields no context (the model
        // then says it can't find it) instead of a wall of irrelevant sources.
        if ((match.score ?? 1) < MIN_SCORE) continue;
        const md = match.metadata ?? {};
        blocks.push(`## ${md.title ?? "Note"}\n${md.text ?? ""}`);
        if (md.url && md.title && !seen.has(md.url)) {
          seen.add(md.url);
          sources.push({ title: md.title, url: md.url });
        }
      }
      context = blocks.join("\n\n");
    } catch (e) {
      // Index missing/empty — fall through and let the model say it doesn't know.
      console.warn("ask: retrieval failed", e);
    }
  }

  // 3. Stream the grounded answer back as NDJSON. First line = sources, then
  // one `{chunk: "…"}` per text delta, and a trailing `{error}` if the stream
  // dies mid-way so the client can show a clear failure indicator.
  const noteContext = [
    selection
      ? `Passage sélectionné par l'utilisateur dans une note :\n« ${selection} »`
      : "",
    context ? `Extraits de notes pertinents :\n\n${context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = buildSystem();
  const userContent = noteContext
    ? `${noteContext}\n\n---\nQuestion : ${question}`
    : `(Aucune note pertinente n'a été trouvée pour cette question.)\n\nQuestion : ${question}`;

  // Aborts the upstream generation when the client disconnects.
  const ac = new AbortController();

  // Unified text-delta source: local OpenAI-compatible model (dev) or Claude.
  async function* deltas(): AsyncGenerator<string> {
    if (llm) {
      yield* openaiChatDeltas(
        llm,
        [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        { maxTokens: 1024, signal: ac.signal },
      );
      return;
    }
    const client = getAnthropic(env.ANTHROPIC_API_KEY!);
    const stream = client.messages.stream({
      model: GEN_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(ndLine({ sources })));
      try {
        for await (const d of deltas()) {
          controller.enqueue(encoder.encode(ndLine({ chunk: d })));
        }
      } catch (e) {
        console.error("ask: stream failed", e);
        controller.enqueue(encoder.encode(ndLine({ error: "stream_failed" })));
      } finally {
        inFlight.delete(ip);
        controller.close();
      }
    },
    cancel() {
      // Client aborted (AbortController, navigation away). Free the slot.
      inFlight.delete(ip);
      ac.abort();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};
