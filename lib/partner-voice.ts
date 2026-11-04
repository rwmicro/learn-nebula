// The ears and the voice of /parler/'s partner (components/play/LanguagePartner.tsx).
//
// Listening: the browser's speech recognition, on the device when it has the
// language pack (Chrome's `processLocally`, installed once on a click), else
// the browser's own service (Google in Chrome, Apple in Safari): the page
// says which. Firefox has none: the keyboard stays.
//
// Speaking: the natural voice (Piper, lib/piper-voice.ts) when the reader
// turned it on in a note ("Voix naturelle") and the language has one, else
// the best system voice. Both feature-detect and never throw.

import { piperSupported, piperVoiceFor, readWithPiper, type PiperReading } from "./piper-voice";

type SR = {
  new (): SRInstance;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
  prototype: object;
};
interface SRInstance {
  lang: string;
  processLocally?: boolean;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recogniser(): SR | null {
  const w = globalThis as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return recogniser() !== null;
}

/** "local": on the device; "cloud": the browser's service; "none". */
export type ListenMode = "local" | "cloud" | "none";

const modes = new Map<string, Promise<ListenMode>>();

/** How `tag` would be recognised here, without installing anything. */
export function listenMode(tag: string): Promise<ListenMode> {
  const R = recogniser();
  if (!R) return Promise.resolve("none");
  if (!modes.has(tag))
    modes.set(
      tag,
      (async () => {
        if (typeof R.available !== "function" || !("processLocally" in R.prototype)) return "cloud";
        try {
          const a = await R.available({ langs: [tag], processLocally: true });
          return a === "available" ? "local" : "cloud";
        } catch {
          return "cloud";
        }
      })(),
    );
  return modes.get(tag)!;
}

/** Install the language pack when the browser offers one (call it from a
 *  click: install() wants a user activation). Resolves the mode to use. */
export async function prepareListening(tag: string): Promise<ListenMode> {
  const R = recogniser();
  if (!R) return "none";
  if ((await listenMode(tag)) === "local") return "local";
  if (typeof R.available === "function" && typeof R.install === "function" && "processLocally" in R.prototype) {
    try {
      const a = await R.available({ langs: [tag], processLocally: true });
      if ((a === "downloadable" || a === "downloading") && (await R.install({ langs: [tag], processLocally: true }))) {
        modes.set(tag, Promise.resolve("local"));
        return "local";
      }
    } catch {
      /* stays on the browser's service */
    }
  }
  return "cloud";
}

export interface Listening {
  /** Stop listening; resolves with the alternatives heard (best first). */
  stop(): Promise<string[]>;
  /** Stop and drop what was heard. */
  cancel(): void;
}

/** Listen in `tag` until stop(); `onInterim` gets the words so far. */
export function listen(tag: string, mode: ListenMode, onInterim?: (text: string) => void): Listening | null {
  const R = recogniser();
  if (!R || mode === "none") return null;
  let r: SRInstance;
  try {
    r = new R();
  } catch {
    return null;
  }
  r.lang = tag;
  if (mode === "local") r.processLocally = true;
  r.interimResults = true;
  r.continuous = true;
  r.maxAlternatives = 3;
  const finals: string[] = [];
  let firstAlts: string[] = [];
  let interim = "";
  let ended = false;
  let resolveEnd: () => void = () => {};
  const endP = new Promise<void>((res) => (resolveEnd = res));
  r.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) {
        finals[i] = res[0]?.transcript ?? "";
        if (i === 0) firstAlts = Array.from({ length: res.length }, (_, k) => res[k].transcript);
      } else interim += res[0]?.transcript ?? "";
    }
    onInterim?.(`${finals.filter(Boolean).join(" ")} ${interim}`.trim());
  };
  r.onend = () => {
    ended = true;
    resolveEnd();
  };
  r.onerror = () => {
    ended = true;
    resolveEnd();
  };
  try {
    r.start();
  } catch {
    return null;
  }
  return {
    async stop() {
      if (!ended) {
        try {
          r.stop();
        } catch {
          /* already ended */
        }
        // Some engines never fire onend after stop(): give up after 2.5 s.
        await Promise.race([endP, new Promise((res) => setTimeout(res, 2500))]);
      }
      const best = `${finals.filter(Boolean).join(" ")} ${interim}`.trim();
      if (!best) return [];
      // Alternatives only make sense for a one-result line.
      const alts = finals.filter(Boolean).length === 1 ? firstAlts.slice(1) : [];
      return [best, ...alts.filter((a) => a && a !== best)];
    },
    cancel() {
      try {
        r.abort();
      } catch {
        /* already ended */
      }
    },
  };
}

// --- speaking ------------------------------------------------------------------

const NATURAL_KEY = "gk-piper";

/** Whether the reader turned on the natural voice (in a note's "Affichage"). */
export function naturalVoiceOn(): boolean {
  try {
    return localStorage.getItem(NATURAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNaturalVoice(on: boolean): void {
  try {
    if (on) localStorage.setItem(NATURAL_KEY, "1");
    else localStorage.removeItem(NATURAL_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

export function naturalVoiceFor(lang: string): boolean {
  return piperSupported() && piperVoiceFor(lang) !== null;
}

function voiceScore(v: SpeechSynthesisVoice): number {
  const id = `${v.name} ${v.voiceURI}`.toLowerCase();
  let s = 0;
  if (/premium/.test(id)) s += 4;
  else if (/enhanced|amélioré|natural|neural/.test(id)) s += 3;
  if (/eloquence|speech\.synthesis\.voice/.test(id)) s -= 3;
  if (v.localService) s += 1;
  return s;
}

function systemVoice(tag: string): SpeechSynthesisVoice | null {
  const synth = globalThis.speechSynthesis;
  if (!synth) return null;
  const base = tag.toLowerCase().split("-")[0];
  const exact = tag.toLowerCase();
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of synth.getVoices()) {
    const l = (v.lang || "").toLowerCase().replace("_", "-");
    if (!l.startsWith(base)) continue;
    const s = voiceScore(v) + (l === exact ? 0.5 : 0);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

export function canSpeak(tag: string): boolean {
  return naturalVoiceFor(tag) || (!!globalThis.speechSynthesis && typeof SpeechSynthesisUtterance === "function");
}

export interface Speaking {
  stop(): void;
  /** Resolves once the line has been said (or stopped). */
  done: Promise<void>;
}

let ctx: AudioContext | null = null;

/** Make the AudioContext inside a click (iOS needs it for the natural voice). */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Say `text` in `tag` at `rate` (1 = normal). The natural voice when it is
 *  on and the language has one; it reads at its own pace, so a slower rate
 *  ("plus lentement") goes to the system voice. */
export function speak(text: string, tag: string, rate = 1, onProgress?: (pct: number) => void): Speaking {
  let stopped = false;
  let piper: PiperReading | null = null;
  let finish: () => void = () => {};
  const done = new Promise<void>((res) => (finish = res));
  const system = () => {
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== "function" || stopped) return finish();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = tag;
    const v = systemVoice(tag);
    if (v) u.voice = v;
    u.rate = rate;
    u.onend = () => finish();
    u.onerror = () => finish();
    // Chrome sometimes never fires onend (no voice for the language, a long
    // utterance): the turn can't wait for it forever.
    setTimeout(finish, 3000 + (text.length * 120) / rate);
    if (synth.speaking || synth.pending) synth.cancel();
    synth.speak(u);
    synth.resume();
  };
  if (naturalVoiceOn() && naturalVoiceFor(tag) && rate >= 0.9 && ctx) {
    void readWithPiper({
      ctx,
      lang: tag,
      chunks: [text],
      onProgress,
      onEnd: () => finish(),
      onError: () => finish(),
    }).then((r) => {
      if (!r) return system();
      piper = r;
      if (stopped) r.stop();
    });
  } else system();
  return {
    stop() {
      stopped = true;
      piper?.stop();
      try {
        globalThis.speechSynthesis?.cancel();
      } catch {
        /* nothing to cancel */
      }
      finish();
    },
    done,
  };
}
