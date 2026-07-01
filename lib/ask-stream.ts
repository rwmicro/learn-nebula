// Shared NDJSON reader for the RAG assistant stream. The backend emits one JSON
// object per line — {sources} first, then {chunk} text deltas, then an optional
// {error} — and this drives the caller's handlers with the accumulated answer.
//
// Imported by BOTH assistants so the wire format lives in one place: the home
// one (React, HomeContent.tsx) and the note-page one (vanilla public/js/ask.js,
// bundled through esbuild by scripts/bundle-js.mjs).

export interface AskSource {
  title?: string;
  url?: string;
}

export interface AskStreamHandlers {
  /** First line — the retrieved note sources. */
  onSources?: (sources: AskSource[]) => void;
  /** Called after each delta (and on a partial error) with the full text so far. */
  onChunk?: (text: string) => void;
  /** Appended to the answer when the server signals a mid-stream {error}. */
  partialError?: string;
}

interface AskLine {
  sources?: AskSource[];
  chunk?: string;
  error?: unknown;
}

/** Read the assistant's NDJSON stream, driving `handlers`, and return the
 *  accumulated answer text. Aborts propagate (the caller's fetch signal rejects
 *  `reader.read()`), so wrap the call in try/catch to handle AbortError. */
export async function readAskStream(
  body: ReadableStream<Uint8Array>,
  handlers: AskStreamHandlers,
): Promise<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let raw = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: AskLine;
      try {
        msg = JSON.parse(line) as AskLine;
      } catch {
        continue;
      }
      if (msg.sources) {
        handlers.onSources?.(msg.sources);
      } else if (typeof msg.chunk === "string") {
        raw += msg.chunk;
        handlers.onChunk?.(raw);
      } else if (msg.error && handlers.partialError) {
        raw += "\n\n" + handlers.partialError;
        handlers.onChunk?.(raw);
      }
    }
  }
  return raw;
}
