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

export type Availability = "unavailable" | "downloadable" | "downloading" | "available";

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
  /** Tokens the session can hold, and how many it holds already (the system
   *  prompt). Chrome 138+; older builds named them differently. */
  inputQuota?: number;
  inputUsage?: number;
  measureInputUsage?(input: string): Promise<number>;
  /** A fresh session with the same system prompt and none of the turns. */
  clone?(opts?: { signal?: AbortSignal }): Promise<LmSession>;
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
  const a = await nanoAvailability(lang);
  return a === "available" || (allowDownload && (a === "downloadable" || a === "downloading"));
}

/** Chrome's own answer for `lang`; "unavailable" when the API is missing or
 *  rejects the language (Chrome throws on a code it doesn't know, e.g. "zh"). */
export async function nanoAvailability(lang: string): Promise<Availability> {
  const LM = g().LanguageModel as LmCtor | undefined;
  if (!LM || typeof LM.availability !== "function") return "unavailable";
  try {
    return await LM.availability(lmOptions(baseLang(lang)));
  } catch {
    return "unavailable";
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

/** The same check for a text that may itself start with "System:" (a note
 *  being translated): only the debug banner and the copied system prompt. */
function leaksPrompt(out: string, system: string): boolean {
  const head = out.slice(0, 400);
  if (/^\s*(?:cpu|gpu|npu) backend/i.test(head)) return true;
  if (/TopK:\s*\d+\s*,\s*Temp(?:erature)?:/i.test(head)) return true;
  if (/^\s*Fastest inference/i.test(head)) return true;
  const sys = squash(system).slice(0, 60);
  return sys.length >= 40 && squash(out).includes(sys);
}

/** Whether Nano echoed its prompt on this browser build (see above), or
 *  failed outright in this tab session (see FAILED_KEY). Read by aiRoute(),
 *  not promptAvailable(): the note bundle has a size budget. */
export function nanoBroken(): boolean {
  try {
    if (sessionStorage.getItem(FAILED_KEY)) return true;
    return localStorage.getItem(BROKEN_KEY) === String(navigator.userAgent);
  } catch {
    return false;
  }
}

// A Nano that throws (create() refused, the model crashed, a download that
// can't finish…) used to stay the route: every question then ended on "no
// answer". It is set aside for the tab session instead (a new tab tries
// again), with Chrome's own message kept for the chat's settings.
const FAILED_KEY = "gk-nano-failed";

/** Why Nano was set aside: "echo", Chrome's error ("NotAllowedError: …"),
 *  or "" when it wasn't. */
export function nanoSetAsideReason(): string {
  try {
    const failed = sessionStorage.getItem(FAILED_KEY);
    if (failed) return failed;
    return localStorage.getItem(BROKEN_KEY) === String(navigator.userAgent) ? "echo" : "";
  } catch {
    return "";
  }
}

/** Try Nano again (the chat's settings): forget both marks. */
export function resetNano(): void {
  try {
    sessionStorage.removeItem(FAILED_KEY);
    localStorage.removeItem(BROKEN_KEY);
  } catch {
    /* nothing stored */
  }
}

function markNanoFailed(e: unknown): void {
  const err = e as { name?: string; message?: string } | null;
  const why = [err?.name, err?.message].filter(Boolean).join(": ").slice(0, 300) || "error";
  try {
    sessionStorage.setItem(FAILED_KEY, why);
  } catch {
    /* private mode */
  }
}

function markNanoBroken(): void {
  try {
    localStorage.setItem(BROKEN_KEY, String(navigator.userAgent));
  } catch {
    /* private mode: the check runs again next time */
  }
}

/** The first of `langs` Chrome's model can write, or null. The question's
 *  language (detected) may be one Nano doesn't cover while the reader's
 *  locale is: declaring the unsupported one makes create() throw. */
async function nanoLang(langs: string[]): Promise<string | null> {
  for (const l of [...new Set(langs.map(baseLang).filter(Boolean))])
    if ((await nanoAvailability(l)) !== "unavailable") return l;
  return null;
}

/** Room the session has left for one prompt, minus room for the answer;
 *  null when this Chrome can't say. */
async function fits(session: LmSession, prompt: string): Promise<boolean | null> {
  if (typeof session.measureInputUsage !== "function" || !session.inputQuota) return null;
  const need = await session.measureInputUsage(prompt);
  return need <= session.inputQuota - (session.inputUsage ?? 0) - 64;
}

/** Shorten `prompt` to about `ratio` of its length, keeping its start (the
 *  passages, most relevant first) and its end (the question). */
function shorten(prompt: string, ratio: number): string {
  const keep = Math.max(400, Math.floor(prompt.length * ratio));
  if (keep >= prompt.length) return prompt;
  const tail = Math.min(800, Math.floor(keep / 2));
  return `${prompt.slice(0, keep - tail).trimEnd()}\n…\n${prompt.slice(-tail).trimStart()}`;
}

/** Run one prompt on the device, streaming the text so far into `onText`.
 *  Resolves with the whole answer, or null when the model is missing or fails
 *  before saying anything (the caller then asks the server). An abort
 *  rejects with the AbortError, like fetch.
 *
 *  `prompts` are the same request from the richest to the leanest (with the
 *  conversation, without it): the first that fits the session's input quota
 *  is sent, and the last is shortened when none does — an over-long prompt
 *  otherwise rejects with a QuotaExceededError and the reader gets nothing. */
export async function promptOnDevice(opts: {
  system: string;
  prompt: string | string[];
  lang: string;
  /** Tried when Nano can't write `lang` (the reader's locale). */
  fallbackLang?: string;
  signal?: AbortSignal;
  onText?: (text: string) => void;
  onDownload?: (fraction: number) => void;
}): Promise<string | null> {
  const LM = g().LanguageModel as LmCtor | undefined;
  if (!LM) return null;
  const lang = await nanoLang([opts.lang, opts.fallbackLang ?? ""]);
  if (!lang) return null;
  const prompts = (Array.isArray(opts.prompt) ? opts.prompt : [opts.prompt]).filter(Boolean);
  let session: LmSession | null = null;
  let out = "";
  try {
    session = await LM.create({
      ...lmOptions(lang),
      initialPrompts: [{ role: "system", content: opts.system }],
      signal: opts.signal,
      monitor(m) {
        if (opts.onDownload) m.addEventListener("downloadprogress", (e) => opts.onDownload!(e.loaded));
      },
    });
    let prompt = prompts[prompts.length - 1] ?? "";
    for (const p of prompts) {
      const ok = await fits(session, p);
      if (ok !== false) {
        prompt = p;
        break;
      }
    }
    for (let ratio = 0.7; ratio > 0.1 && (await fits(session, prompt)) === false; ratio -= 0.2)
      prompt = shorten(prompt, ratio);
    // Nothing is shown before HOLD_BACK characters: a leak starts with the
    // backend banner or "System:", and must never reach the reader.
    let shown = false;
    for await (const chunk of session.promptStreaming(prompt, { signal: opts.signal })) {
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
    if (!out.trim()) markNanoFailed({ name: "EmptyAnswer" });
    return out.trim() ? out : null;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    if (out.trim() && !echoesPrompt(out, opts.system)) return out;
    markNanoFailed(e);
    return null;
  } finally {
    try {
      session?.destroy();
    } catch {
      /* already gone */
    }
  }
}

/** One Nano session for a series of unrelated prompts under the same system
 *  prompt (a note translated block by block). */
export interface NanoSeries {
  /** The answer, or null when the model gave nothing usable for this
   *  prompt (too long for the session, an echo, an error). An abort rejects. */
  prompt(text: string, signal?: AbortSignal): Promise<string | null>;
  close(): void;
}

/**
 * Open that session: created once, then cloned for each prompt so the turns
 * don't pile up in its context (promptOnDevice() creates and destroys one
 * per call, which costs a model start each time). Null when Nano can't write
 * `lang`. Unlike promptOnDevice(), a prompt that fails is only that prompt's
 * failure: Nano is not set aside for the tab because one block of a note
 * went wrong.
 */
export async function openNanoSession(opts: {
  system: string;
  lang: string;
  fallbackLang?: string;
  signal?: AbortSignal;
  onDownload?: (fraction: number) => void;
}): Promise<NanoSeries | null> {
  const LM = g().LanguageModel as LmCtor | undefined;
  if (!LM) return null;
  const lang = await nanoLang([opts.lang, opts.fallbackLang ?? ""]);
  if (!lang) return null;
  const create = (signal?: AbortSignal) =>
    LM.create({
      ...lmOptions(lang),
      initialPrompts: [{ role: "system", content: opts.system }],
      signal,
      monitor(m) {
        if (opts.onDownload) m.addEventListener("downloadprogress", (e) => opts.onDownload!(e.loaded));
      },
    });
  let base: LmSession;
  try {
    base = await create(opts.signal);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return null;
  }
  return {
    async prompt(text, signal) {
      let session: LmSession | null = null;
      let out = "";
      try {
        session = typeof base.clone === "function" ? await base.clone({ signal }) : await create(signal);
        if ((await fits(session, text)) === false) return null;
        for await (const chunk of session.promptStreaming(text, { signal }))
          out = out.length > 20 && chunk.startsWith(out) ? chunk : out + chunk;
        return out.trim() && !leaksPrompt(out, opts.system) ? out : null;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw e;
        return null;
      } finally {
        try {
          session?.destroy();
        } catch {
          /* already gone */
        }
      }
    },
    close() {
      try {
        base.destroy();
      } catch {
        /* already gone */
      }
    },
  };
}

/** Start Chrome's first download of Gemini Nano, from inside a click.
 *  While the model is "downloadable", create() needs a user activation; the
 *  chat's own create() comes after language detection and retrieval, when a
 *  click may have expired and Chrome refuses with a NotAllowedError. Does
 *  nothing when the model is already there, or can't be. */
export function warmNano(lang: string): void {
  const LM = g().LanguageModel as LmCtor | undefined;
  if (!LM || typeof LM.availability !== "function") return;
  const o = lmOptions(baseLang(lang));
  LM.availability(o)
    .then((a) => (a === "downloadable" ? LM.create(o) : null))
    .then((s) => s?.destroy())
    .catch(() => {
      /* the chat's own create() reports it */
    });
}
