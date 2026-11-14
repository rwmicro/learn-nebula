// Which model writes the garden's AI answers, and one call to run it. Shared
// by the chat (components/chat/GardenChat.tsx) and the vanilla note bundle
// (public/js/translate.js).
//
// Everything runs on the reader's device: Chrome's Gemini Nano when it covers
// the language (lib/browser-ai.ts), else the downloadable Qwen3.5-2B
// (lib/local-llm.ts). The server only retrieves passages (/api/ask/context).
// Its own generation (/api/ask, /api/ask/explain, /api/translate through
// Claude or an OpenAI-compatible backend) is still there but not offered:
// SERVER_LLM_OFFERED turns it back on as the last fallback.

import {
  echoesPrompt,
  nanoBroken,
  openNanoSession,
  promptAvailable,
  promptOnDevice,
} from "./browser-ai";
import {
  loadLocalModel,
  localModelCached,
  localModelEnabled,
  localModelError,
  localModelLoaded,
  localModelLoading,
  localModelSupported,
  onLoadProgress,
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

export async function aiRoute(lang: string, alsoLang = ""): Promise<AiRoute> {
  // `alsoLang`: the question's own language, which generateOnDevice() tries
  // first (fallbackLang = `lang`, the reader's locale).
  if (
    !nanoBroken() &&
    ((await promptAvailable(lang)) ||
      (!!alsoLang && alsoLang !== lang && (await promptAvailable(alsoLang))))
  )
    return "nano";
  if (await localModelSupported()) {
    if (!localModelEnabled()) return "download";
    // Agreed to, but the files are not on the device (the download was cut
    // short, or the browser cleared them): the reader is asked again rather
    // than a gigabyte starting by itself, maybe on mobile data.
    if (localModelLoaded() || localModelLoading() || (await localModelCached())) return "local";
    return "download";
  }
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
  /** For Nano, when it can't write `lang`: the reader's locale. */
  fallbackLang?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  onText?: (text: string) => void;
  /** Chrome downloading Gemini Nano on its first use (0…1). */
  onDownload?: (fraction: number) => void;
}): Promise<string | null> {
  // An answer saved before echoes were caught is the old prompt, not a turn.
  const history = (opts.history ?? []).filter(
    (t) => t.role === "user" || !echoesPrompt(t.content),
  );
  if (opts.route === "nano") {
    // The Prompt API session takes one prompt here: earlier turns go in front.
    const past = history
      .map(
        (t) =>
          `${t.role === "user" ? "Utilisateur" : "Assistant"} : ${t.content}`,
      )
      .join("\n\n");
    const out = await promptOnDevice({
      system: opts.system,
      // Without the conversation when it doesn't fit Nano's input quota.
      prompt: past ? [`${past}\n\nUtilisateur : ${opts.prompt}`, opts.prompt] : opts.prompt,
      lang: opts.lang,
      fallbackLang: opts.fallbackLang,
      signal: opts.signal,
      onText: opts.onText,
      onDownload: opts.onDownload,
    });
    // Nano failed (or echoed its prompt and is now set aside): the
    // downloaded model, when the reader agreed to it, answers instead.
    if (out !== null || !localModelEnabled() || !(await localModelSupported()))
      return out;
  }
  return promptLocal({
    system: opts.system,
    prompt: opts.prompt,
    history,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
    onText: opts.onText,
  });
}

/** The device's model held ready for a series of unrelated prompts under
 *  one system prompt: a note translated block by block. */
export interface DeviceSeries {
  /** The answer, or null when the model gave nothing for this prompt. An
   *  abort rejects. */
  run(prompt: string, opts?: { maxTokens?: number; signal?: AbortSignal }): Promise<string | null>;
  close(): void;
}

/**
 * Open it: Nano's session is created once (lib/browser-ai.ts), the
 * downloaded model is loaded first, with `onLoad` following its download or
 * its loading (0…1). Null when no model can start; `reason()` then says why
 * when the device told.
 */
export async function openDeviceSeries(opts: {
  route: "nano" | "local";
  system: string;
  lang: string;
  fallbackLang?: string;
  signal?: AbortSignal;
  onLoad?: (fraction: number) => void;
}): Promise<DeviceSeries | null> {
  const localOk = async () => localModelEnabled() && (await localModelSupported());
  const local = async (): Promise<DeviceSeries | null> => {
    const off = onLoadProgress((p) => p.total > 0 && opts.onLoad?.(Math.min(1, p.loaded / p.total)));
    const ok = await loadLocalModel();
    off();
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!ok) return null;
    return {
      run: (prompt, o) => promptLocal({ system: opts.system, prompt, maxTokens: o?.maxTokens, signal: o?.signal }),
      close() {},
    };
  };
  if (opts.route === "local") return local();
  const nano = await openNanoSession({
    system: opts.system,
    lang: opts.lang,
    fallbackLang: opts.fallbackLang,
    signal: opts.signal,
    onDownload: opts.onLoad,
  });
  if (!nano) return (await localOk()) ? local() : null;
  // Nano answers; what it can't (a block too long for its session), the
  // downloaded model does when the reader has it.
  let backup: DeviceSeries | null | undefined;
  return {
    async run(prompt, o) {
      const out = await nano.prompt(prompt, o?.signal);
      if (out !== null) return out;
      if (backup === undefined) backup = (await localOk()) ? await local() : null;
      return backup ? backup.run(prompt, o) : null;
    },
    close: () => nano.close(),
  };
}

/** Why the downloaded model last failed, in the device's words ("" if it
 *  didn't say). */
export function deviceError(): string {
  return localModelError();
}
