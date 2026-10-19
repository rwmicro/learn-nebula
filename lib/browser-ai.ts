// Chrome's built-in, on-device AI (Gemini Nano, desktop Chrome 138+):
// LanguageDetector and the Prompt API (LanguageModel). Free, keyless, and
// nothing leaves the browser — so these are tried first, and every caller
// falls back to the server (or to nothing) when they are absent, which is
// every browser but desktop Chrome.
//
// Shared by the React assistant (components/PinnedAssistant.tsx,
// HomeContent.tsx) and the vanilla note bundle (public/js/translate.js), the
// way lib/ask-stream.ts is. Every function feature-detects and never throws.
//
// Downloads: create() fetches the model the first time, which Chrome only
// allows with a user activation. Callers on a page load pass
// `allowDownload: false` (use the model only when it is already there);
// callers inside a click pass true.

type Availability = "unavailable" | "downloadable" | "downloading" | "available";

interface Monitor {
  addEventListener(type: "downloadprogress", cb: (e: { loaded: number }) => void): void;
}
interface Detector {
  detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]>;
}
interface DetectorCtor {
  availability(): Promise<Availability>;
  create(opts?: { monitor?: (m: Monitor) => void }): Promise<Detector>;
}
interface LmSession {
  promptStreaming(input: string, opts?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy(): void;
}
interface LmOptions {
  expectedInputs?: { type: "text"; languages: string[] }[];
  expectedOutputs?: { type: "text"; languages: string[] }[];
}
interface LmCtor {
  availability(opts?: LmOptions): Promise<Availability>;
  create(
    opts?: LmOptions & {
      initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
      monitor?: (m: Monitor) => void;
      signal?: AbortSignal;
    },
  ): Promise<LmSession>;
}

const g = (): Record<string, unknown> =>
  (typeof self !== "undefined" ? self : {}) as unknown as Record<string, unknown>;

/** Base subtag, lower-cased: "zh-Hant" → "zh", "EN" → "en". */
export function baseLang(code: string): string {
  return String(code || "").toLowerCase().split(/[-_]/)[0];
}

let detector: Promise<Detector | null> | null = null;

/** Most likely language of `text` (base subtag), or null when the detector is
 *  missing, unsure (below `minConfidence`) or the text is too short to say —
 *  a few words give unreliable answers. */
export async function detectLanguage(
  text: string,
  opts: { allowDownload?: boolean; minConfidence?: number; minChars?: number } = {},
): Promise<string | null> {
  const LD = g().LanguageDetector as DetectorCtor | undefined;
  const sample = String(text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!LD || sample.length < (opts.minChars ?? 12)) return null;
  try {
    if (!detector) {
      const a = await LD.availability();
      if (a === "unavailable") return null;
      if (a !== "available" && !opts.allowDownload) return null;
      detector = LD.create().catch(() => null);
    }
    const d = await detector;
    if (!d) {
      detector = null;
      return null;
    }
    const [top] = await d.detect(sample);
    if (!top || top.detectedLanguage === "und") return null;
    return top.confidence >= (opts.minConfidence ?? 0.7) ? baseLang(top.detectedLanguage) : null;
  } catch {
    return null;
  }
}

const lmOptions = (lang: string): LmOptions => ({
  expectedInputs: [{ type: "text", languages: [lang] }],
  expectedOutputs: [{ type: "text", languages: [lang] }],
});

/** Whether the on-device model can answer in `lang` right now — or, with
 *  `allowDownload`, after a download. The model only covers a few output
 *  languages (English, Spanish, Japanese at first), so a French reader
 *  usually gets "no" and the server answers. */
export async function promptAvailable(lang: string, allowDownload = true): Promise<boolean> {
  const LM = g().LanguageModel as LmCtor | undefined;
  if (!LM || typeof LM.availability !== "function") return false;
  try {
    const a = await LM.availability(lmOptions(baseLang(lang)));
    return a === "available" || (allowDownload && (a === "downloadable" || a === "downloading"));
  } catch {
    return false;
  }
}

/** Run one prompt on the device, streaming the text so far into `onText`.
 *  Resolves with the whole answer, or null when the model is missing or fails
 *  before saying anything (the caller then asks the server). An abort
 *  rejects with the AbortError, like fetch. */
export async function promptOnDevice(opts: {
  system: string;
  prompt: string;
  lang: string;
  signal?: AbortSignal;
  onText?: (text: string) => void;
  onDownload?: (fraction: number) => void;
}): Promise<string | null> {
  const LM = g().LanguageModel as LmCtor | undefined;
  if (!LM) return null;
  let session: LmSession | null = null;
  let out = "";
  try {
    session = await LM.create({
      ...lmOptions(baseLang(opts.lang)),
      initialPrompts: [{ role: "system", content: opts.system }],
      signal: opts.signal,
      monitor(m) {
        if (opts.onDownload) m.addEventListener("downloadprogress", (e) => opts.onDownload!(e.loaded));
      },
    });
    for await (const chunk of session.promptStreaming(opts.prompt, { signal: opts.signal })) {
      // Chrome streams deltas; early builds streamed the whole text so far.
      out = out.length > 20 && chunk.startsWith(out) ? chunk : out + chunk;
      opts.onText?.(out);
    }
    return out.trim() ? out : null;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return out.trim() ? out : null;
  } finally {
    try {
      session?.destroy();
    } catch {
      /* already gone */
    }
  }
}
