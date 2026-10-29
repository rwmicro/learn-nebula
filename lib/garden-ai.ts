// Which model writes the garden's AI answers, and one call to run it. Shared
// by the chat (components/GardenChat.tsx) and the vanilla note bundle
// (public/js/translate.js).
//
// Everything runs on the reader's device: Chrome's Gemini Nano when it covers
// the language (lib/browser-ai.ts), else the downloadable LFM3-1.7B
// (lib/local-llm.ts). The server only retrieves passages (/api/ask/context).
// Its own generation (/api/ask, /api/ask/explain, /api/translate through
// Claude or an OpenAI-compatible backend) is still there but not offered:
// SERVER_LLM_OFFERED turns it back on as the last fallback.

import { promptAvailable, promptOnDevice } from "./browser-ai";
import {
  localModelEnabled,
  localModelSupported,
  promptLocal,
  type ChatTurn,
} from "./local-llm";

import { SERVER_LLM_OFFERED } from "./garden-ai-flags";

export { SERVER_LLM_OFFERED, deviceWord } from "./garden-ai-flags";

/** - "nano": Chrome's built-in model covers the language;
 *  - "local": the downloaded model is agreed to (it may still be loading);
 *  - "download": the device could run it once downloaded;
 *  - "server": nothing on the device, the server's LLM is offered;
 *  - "none": nothing can answer here. */
export type AiRoute = "nano" | "local" | "download" | "server" | "none";

export async function aiRoute(lang: string): Promise<AiRoute> {
  if (await promptAvailable(lang)) return "nano";
  if (await localModelSupported())
    return localModelEnabled() ? "local" : "download";
  return SERVER_LLM_OFFERED ? "server" : "none";
}

/** Run one prompt on the device's model ("nano" or "local" route), streaming
 *  the text so far. Null when it can't answer; an abort rejects. */
export async function generateOnDevice(opts: {
  route: "nano" | "local";
  system: string;
  prompt: string;
  history?: ChatTurn[];
  lang: string;
  maxTokens?: number;
  signal?: AbortSignal;
  onText?: (text: string) => void;
}): Promise<string | null> {
  if (opts.route === "nano") {
    // The Prompt API session takes one prompt here: earlier turns go in front.
    const past = (opts.history ?? [])
      .map(
        (t) =>
          `${t.role === "user" ? "Utilisateur" : "Assistant"} : ${t.content}`,
      )
      .join("\n\n");
    return promptOnDevice({
      system: opts.system,
      prompt: past ? `${past}\n\nUtilisateur : ${opts.prompt}` : opts.prompt,
      lang: opts.lang,
      signal: opts.signal,
      onText: opts.onText,
    });
  }
  return promptLocal({
    system: opts.system,
    prompt: opts.prompt,
    history: opts.history,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
    onText: opts.onText,
  });
}
