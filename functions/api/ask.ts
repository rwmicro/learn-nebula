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

interface Env {
  ANTHROPIC_API_KEY: string;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
}

const GEN_MODEL = "claude-haiku-4-5";
const EMBED_MODEL = "@cf/baai/bge-m3";
const TOP_K = 5;
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
const REPLY_LINE: Record<ReplyLang, string> = {
  fr: "Réponds en français, de façon concise et claire.",
  en: "Reply in English, concisely and clearly.",
  es: "Responde en español, de forma concisa y clara.",
  zh: "用中文简洁明了地回答。",
};
const DEFAULT_Q: Record<ReplyLang, string> = {
  fr: "Explique ce passage.",
  en: "Explain this passage.",
  es: "Explica este pasaje.",
  zh: "解释这段内容。",
};

function buildSystem(replyLang: ReplyLang): string {
  const replyLine = REPLY_LINE[replyLang];
  return [
    "Tu es l'assistant de « The Gardener », un jardin de notes personnel.",
    "Règles :",
    "- Réponds UNIQUEMENT à partir des extraits de notes fournis dans le message de l'utilisateur.",
    "- Si un « passage sélectionné » est fourni, c'est l'extrait que l'utilisateur veut comprendre : appuie-toi dessus en priorité.",
    "- Si la réponse n'y figure pas, dis-le clairement (« Je ne trouve pas cela dans les notes ») — n'invente rien et n'utilise pas de connaissances générales extérieures aux notes.",
    "- Quand c'est utile, cite le titre des notes que tu utilises.",
    "- Le texte peut utiliser du Markdown léger (**gras**, *italique*, `code`, listes `- `).",
    "- " + replyLine,
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
  if (!env.ANTHROPIC_API_KEY) {
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

  // 1. Embed the query — fold in the selection so retrieval finds its source note.
  let queryVector: number[];
  try {
    const queryText = (
      selection ? `${question}\n${selection}` : question
    ).slice(0, 2000);
    const embedding = (await env.AI.run(EMBED_MODEL, {
      text: [queryText],
    })) as { data?: number[][] };
    if (!embedding?.data?.length || !embedding.data[0]?.length) {
      inFlight.delete(ip);
      return json({ error: "Échec de l'embedding." }, 502);
    }
    queryVector = embedding.data[0];
  } catch (e) {
    console.error("ask: embed failed", e);
    inFlight.delete(ip);
    return json({ error: "Indexation sémantique indisponible." }, 502);
  }

  // 2. Retrieve the nearest note chunks.
  const sources: { title: string; url: string }[] = [];
  let context = "";
  try {
    const result = (await env.VECTORIZE.query(queryVector, {
      topK: TOP_K,
      returnMetadata: "all",
    })) as { matches: { metadata?: ChunkMeta }[] };

    const seen = new Set<string>();
    const blocks: string[] = [];
    for (const match of result.matches) {
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
    console.warn("ask: vectorize query failed", e);
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

  const client = getAnthropic(env.ANTHROPIC_API_KEY);
  const stream = client.messages.stream({
    model: GEN_MODEL,
    max_tokens: 1024,
    system: buildSystem(replyLang),
    messages: [
      {
        role: "user",
        content: noteContext
          ? `${noteContext}\n\n---\nQuestion : ${question}`
          : `(Aucune note pertinente n'a été trouvée pour cette question.)\n\nQuestion : ${question}`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(ndLine({ sources })));
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(ndLine({ chunk: event.delta.text })),
            );
          }
        }
      } catch (e) {
        console.error("ask: stream failed", e);
        controller.enqueue(
          encoder.encode(ndLine({ error: "stream_failed" })),
        );
      } finally {
        inFlight.delete(ip);
        controller.close();
      }
    },
    cancel() {
      // Client aborted (AbortController, navigation away). Free the slot.
      inFlight.delete(ip);
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};
