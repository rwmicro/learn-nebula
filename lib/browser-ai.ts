// Chrome's built-in, on-device AI (Gemini Nano, desktop Chrome 138+):
// LanguageDetector and the Prompt API (LanguageModel). Free, keyless, and
// nothing leaves the browser — so these are tried first, and every caller
// falls back to the server (or to nothing) when they are absent, which is
// every browser but desktop Chrome.
//
// Shared by the garden chat (components/chat/GardenChat.tsx) and the vanilla
// note bundle (public/js/translate.js), the way lib/ask-stream.ts is. Every
// function feature-detects and never throws.
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
  if (nanoBroken()) return false;
  try {
    const a = await LM.availability(lmOptions(baseLang(lang)));
    return a === "available" || (allowDownload && (a === "downloadable" || a === "downloading"));
  } catch {
    return false;
  }
}

// Some Chrome builds (seen on desktop Linux, Gemini Nano on the CPU
// backend) don't answer: they print a debug banner ("CPU backend", "Fastest
// inference", "TopK: 64, Temp: 1") and then the whole prompt as the model
// was fed it ("System: … End.User: … End.Model:"). That is the system
// prompt and the retrieved passages, not an answer. Such output is
// discarded, and Nano is set aside on this browser build (the key holds the
// user agent, so a Chrome update tries it again) for the next route: the
// downloadable model, or the "not available here" sheet.

const BROKEN_KEY = "gk-nano-broken";
const HOLD_BACK = 120;

const squash = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

/** Whether `out` is Chrome echoing the prompt (or its debug banner) instead
 *  of answering it. */
export function echoesPrompt(out: string, system = ""): boolean {
  const head = out.slice(0, 400);
  if (/^\s*(?:cpu|gpu|npu) backend/i.test(head)) return true;
  if (/TopK:\s*\d+\s*,\s*Temp(?:erature)?:/i.test(head)) return true;
  if (/^\s*Fastest inference/i.test(head)) return true;
  if (/\bEnd\.\s*(?:User|Model|System)\s*:/.test(out)) return true;
  if (/^\s*System\s*:/.test(out)) return true;
  // The system prompt itself, copied back: a 60-character stretch of its
  // opening is far longer than any answer quotes by chance.
  const sys = squash(system).slice(0, 60);
  return sys.length >= 40 && squash(out).includes(sys);
}

function nanoBroken(): boolean {
  try {
    return localStorage.getItem(BROKEN_KEY) === String(navigator.userAgent);
  } catch {
    return false;
  }
}

function markNanoBroken(): void {
  try {
    localStorage.setItem(BROKEN_KEY, String(navigator.userAgent));
  } catch {
    /* private mode: the check runs again next time */
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
    // Nothing is shown before HOLD_BACK characters: a leak starts with the
    // backend banner or "System:", and must never reach the reader.
    let shown = false;
    for await (const chunk of session.promptStreaming(opts.prompt, { signal: opts.signal })) {
      // Chrome streams deltas; early builds streamed the whole text so far.
      out = out.length > 20 && chunk.startsWith(out) ? chunk : out + chunk;
      if (echoesPrompt(out, opts.system)) {
        markNanoBroken();
        if (shown) opts.onText?.("");
        return null;
      }
      if (shown || out.length >= HOLD_BACK) {
        shown = true;
        opts.onText?.(out);
      }
    }
    if (echoesPrompt(out, opts.system)) {
      markNanoBroken();
      return null;
    }
    if (!shown && out.trim()) opts.onText?.(out);
    return out.trim() ? out : null;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return out.trim() && !echoesPrompt(out, opts.system) ? out : null;
  } finally {
    try {
      session?.destroy();
    } catch {
      /* already gone */
    }
  }
}
