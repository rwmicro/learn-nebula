// What the garden chat asks the server, without React: the passages and
// prompt for a question (/api/ask/context, what every on-device answer
// starts from) and, while SERVER_LLM_OFFERED is off, the server's own
// streamed answer (/api/ask, /api/ask/explain), kept for when it is back.
// components/chat/GardenChat.tsx owns the state; this only talks HTTP.

import { readAskStream } from "../ask-stream";
import type { ChatMessage, ChatMode, ChatSource } from "../chat-history";
import type { ChatTurn } from "./local-llm";

/** The reader's interface language, two letters: the saved choice, else
 *  the browser's. */
export function preferredLang(): string {
  try {
    const saved = localStorage.getItem("locale");
    if (saved) return saved.slice(0, 2);
  } catch {
    /* ignore */
  }
  return (navigator.language || "fr").slice(0, 2).toLowerCase();
}

/** The last six turns of a conversation, trimmed, as the model's history. */
export function chatHistory(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((m) => m.text.trim())
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }));
}

/** The latest passage the reader asked about in a conversation, or "". */
export function lastPassage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].passage) return messages[i].passage!;
  return "";
}

export type AskContext =
  | { ok: true; system: string; user: string; sources: ChatSource[] }
  | { ok: false; status: number };

/** Retrieval on the server: the system prompt, the user prompt with its
 *  numbered excerpts, and their sources (site-relative URLs only). Throws
 *  on a network error or an abort, like fetch. */
export async function askContext(
  q: {
    question: string;
    selection?: string;
    scope?: string;
    lang?: string;
    socratic?: boolean;
  },
  signal: AbortSignal,
  doFetch: typeof fetch = fetch,
): Promise<AskContext> {
  const resp = await doFetch("/api/ask/context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      question: q.question,
      selection: q.selection || undefined,
      locale: preferredLang(),
      scope: q.scope || undefined,
      lang: q.lang || undefined,
      socratic: q.socratic || undefined,
    }),
    signal,
  });
  if (!resp.ok) return { ok: false, status: resp.status };
  const ctx = (await resp.json()) as { system?: string; user?: string; sources?: ChatSource[] };
  return {
    ok: true,
    system: ctx.system ?? "",
    user: ctx.user ?? "",
    sources: (ctx.sources ?? []).filter((s) => s && s.url && /^\/(?!\/)/.test(s.url)),
  };
}

/** The server's own answer, streamed (NDJSON, lib/ask-stream.ts). `onError`
 *  gets nothing to say on an abort. Only used when SERVER_LLM_OFFERED. */
export async function askServerAnswer(
  q: {
    mode: ChatMode;
    question: string;
    passage: string;
    noteTitle?: string;
    scope?: string;
    lang?: string;
  },
  signal: AbortSignal,
  on: {
    sources: (s: ChatSource[]) => void;
    text: (t: string) => void;
    error: () => void;
    partialError: string;
  },
  doFetch: typeof fetch = fetch,
): Promise<void> {
  try {
    const own = q.mode === "own";
    const resp = await doFetch(own ? "/api/ask/explain" : "/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        own
          ? { passage: q.passage, explanation: q.question, title: q.noteTitle, lang: q.lang || undefined }
          : {
              question: q.question,
              selection: q.passage || undefined,
              locale: preferredLang(),
              scope: q.scope || undefined,
              lang: q.lang || undefined,
              socratic: q.mode === "socratic" || undefined,
            },
      ),
      signal,
    });
    if (!resp.ok || !resp.body) return on.error();
    await readAskStream(resp.body, {
      onSources: (s) => on.sources(s.filter((x) => x?.url && x.title) as ChatSource[]),
      onChunk: on.text,
      partialError: on.partialError,
    });
  } catch (e) {
    if ((e as Error)?.name !== "AbortError") on.error();
  }
}
