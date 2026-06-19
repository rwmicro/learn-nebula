/// <reference types="@cloudflare/workers-types" />

// RAG assistant endpoint (Cloudflare Pages Function), semantic retrieval edition.
//
// Pipeline, all server-side:
//   1. embed the question with Workers AI (@cf/baai/bge-m3, multilingual)
//   2. query the Vectorize index for the nearest note chunks
//   3. ask Claude Haiku to answer *only* from those chunks, streamed back
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

const SYSTEM = `Tu es l'assistant de « The Gardener », un jardin de notes personnel.
Règles :
- Réponds UNIQUEMENT à partir des extraits de notes fournis dans le message de l'utilisateur.
- Si la réponse n'y figure pas, dis-le clairement (« Je ne trouve pas cela dans les notes ») — n'invente rien et n'utilise pas de connaissances générales extérieures aux notes.
- Quand c'est utile, cite le titre des notes que tu utilises.
- Réponds en français, de façon concise et claire.`;

interface ChunkMeta {
  title?: string;
  url?: string;
  text?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return json(
      { error: "Assistant non configuré (ANTHROPIC_API_KEY manquante)." },
      503,
    );
  }

  let payload: { question?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }
  const question = (payload.question ?? "").trim();
  if (!question || question.length > MAX_QUESTION) {
    return json({ error: "Question manquante ou trop longue." }, 400);
  }

  // 1. Embed the question.
  let queryVector: number[];
  try {
    const embedding = (await env.AI.run(EMBED_MODEL, { text: [question] })) as {
      data: number[][];
    };
    queryVector = embedding.data[0];
  } catch {
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
  } catch {
    // Index missing/empty — fall through and let the model say it doesn't know.
  }

  // 3. Generate the grounded answer, streamed back as plain text.
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: GEN_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: context
          ? `Extraits de notes :\n\n${context}\n\n---\nQuestion : ${question}`
          : `(Aucune note pertinente n'a été trouvée pour cette question.)\n\nQuestion : ${question}`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch {
        controller.enqueue(
          encoder.encode("\n\n[L'assistant a rencontré une erreur.]"),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      // Sources travel in a header so the streamed body stays pure answer text.
      "x-sources": encodeURIComponent(JSON.stringify(sources)),
    },
  });
};

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
