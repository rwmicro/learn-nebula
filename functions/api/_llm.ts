/// <reference types="@cloudflare/workers-types" />

// Dev-only escape hatch: route generation to an OpenAI-compatible endpoint
// (e.g. LM Studio at http://127.0.0.1:1234/v1) instead of Anthropic, so the
// chat + translation work under `wrangler pages dev out` without Anthropic /
// Workers AI / Vectorize bindings. Enabled when LLM_BASE_URL is set (see
// .dev.vars); unset in production, where the Anthropic path runs unchanged.
//
// Underscore-prefixed → Cloudflare Pages does not turn this into a route.

export interface LlmConfig {
  baseUrl: string; // includes /v1, e.g. "http://127.0.0.1:1234/v1"
  model: string;
}

export function llmConfig(env: {
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
}): LlmConfig | null {
  if (!env.LLM_BASE_URL) return null;
  return {
    baseUrl: env.LLM_BASE_URL.replace(/\/+$/, ""),
    model: env.LLM_MODEL || "local-model",
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function chat(
  cfg: LlmConfig,
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
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: { maxTokens: number; signal?: AbortSignal },
): AsyncGenerator<string> {
  const res = await chat(cfg, messages, { ...opts, stream: true });
  if (!res.ok || !res.body) {
    throw new Error(`LLM chat failed: ${res.status}`);
  }
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
      if (!line.startsWith("data:")) continue; // skip blank lines / comments
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // keep-alive / partial line — ignore
      }
    }
  }
}

/** Full completion text from an OpenAI-compatible /chat/completions call. */
export async function openaiChatText(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: { maxTokens: number },
): Promise<string> {
  const res = await chat(cfg, messages, { ...opts, stream: false });
  if (!res.ok) throw new Error(`LLM chat failed: ${res.status}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}
