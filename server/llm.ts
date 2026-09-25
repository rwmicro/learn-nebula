// LLM access for the self-hosted (Docker) backend. Two generation backends —
// Anthropic (Claude) when ANTHROPIC_API_KEY is set, or any OpenAI-compatible
// /v1 endpoint (Ollama, llama.cpp, LM Studio…) via LLM_BASE_URL — plus an
// OpenAI-compatible /v1/embeddings call for RAG retrieval.
//
// Self-contained (no Cloudflare Workers types) so it runs under plain Node.

import Anthropic from "@anthropic-ai/sdk";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAICompat {
  baseUrl: string; // includes /v1
  model: string;
}

/** Build an OpenAI-compatible chat config from base URL + model, or null. */
export function chatConfig(baseUrl?: string, model?: string): OpenAICompat | null {
  if (!baseUrl) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), model: model || "local-model" };
}

function chat(
  cfg: OpenAICompat,
  messages: ChatMessage[],
  opts: { maxTokens: number; stream: boolean; signal?: AbortSignal },
): Promise<Response> {
  return fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: opts.maxTokens,
      stream: opts.stream,
    }),
    signal: opts.signal,
  });
}

/** Stream text deltas from an OpenAI-compatible /chat/completions SSE response. */
export async function* openaiChatDeltas(
  cfg: OpenAICompat,
  messages: ChatMessage[],
  opts: { maxTokens: number; signal?: AbortSignal },
): AsyncGenerator<string> {
  const res = await chat(cfg, messages, { ...opts, stream: true });
  if (!res.ok || !res.body) throw new Error(`LLM chat failed: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* keep-alive / partial line */
      }
    }
  }
}

/** Full completion text from an OpenAI-compatible /chat/completions call. */
export async function openaiChatText(
  cfg: OpenAICompat,
  messages: ChatMessage[],
  opts: { maxTokens: number },
): Promise<string> {
  const res = await chat(cfg, messages, { ...opts, stream: false });
  if (!res.ok) throw new Error(`LLM chat failed: ${res.status}`);
  const j = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return j.choices?.[0]?.message?.content ?? "";
}

/** Embed texts through an OpenAI-compatible /v1/embeddings endpoint. */
export async function openaiEmbed(
  baseUrl: string,
  model: string,
  input: string[],
  signal?: AbortSignal,
  timeoutMs = 45_000,
): Promise<number[][]> {
  // Cap the wait: a hung embeddings endpoint would otherwise stall /api/ask
  // forever (retrieval is awaited before the answer starts streaming), which
  // looks like "the response never arrives". A timeout surfaces it as an error.
  // The default suits index batches; a single query passes something shorter.
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) {
    // Surface the server's reason (LM Studio/Ollama return a JSON/text body,
    // e.g. "model not found" or a context-length error) — a bare status is
    // useless for debugging a 400.
    const body = await res.text().catch(() => "");
    throw new Error(
      `embeddings failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ""} (model="${model}")`,
    );
  }
  const j = (await res.json()) as { data?: { embedding: number[] }[] };
  const out = (j.data ?? []).map((d) => d.embedding);
  if (out.length !== input.length) {
    throw new Error(`embeddings count mismatch: got ${out.length} for ${input.length}`);
  }
  return out;
}

/** Score `texts` against `query` with a cross-encoder reranker, through TEI's
 *  /rerank API ({query, texts} → [{index, score}], score in 0..1). Returns one
 *  score per text, in input order. */
export async function rerank(
  url: string,
  query: string,
  texts: string[],
  timeoutMs: number,
): Promise<number[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, texts, truncate: true }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`rerank failed: ${res.status}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }
  const j = (await res.json()) as { index: number; score: number }[];
  const scores = Array.from({ length: texts.length }, () => 0);
  for (const r of j) if (r.index >= 0 && r.index < texts.length) scores[r.index] = r.score;
  return scores;
}

// Reused across requests instead of re-instantiating per call.
let anthropic: Anthropic | null = null;
export function anthropicClient(key: string): Anthropic {
  if (!anthropic) anthropic = new Anthropic({ apiKey: key });
  return anthropic;
}

/** Stream Claude text deltas (mirrors openaiChatDeltas' shape). */
export async function* anthropicDeltas(
  key: string,
  model: string,
  system: string,
  userContent: string,
  maxTokens: number,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const stream = anthropicClient(key).messages.stream(
    {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    },
    { signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}
