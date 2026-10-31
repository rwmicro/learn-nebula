// The natural reading voice of "Écouter": a Piper voice (VITS, ~63 MB per
// language) run in public/js/piper-worker.js. Off until the reader turns it
// on (the "Voix naturelle" switch, public/js/audio.js), which is remembered
// in localStorage; the voice of a language downloads the first time a note in
// it is read, from Hugging Face, and stays in Cache Storage until the switch
// is turned off. Loaded on demand as piper-voice.bundle.js, so a reader who
// never turns it on never fetches it. Anything that fails falls back to the
// system voice (audio.js).

/** One voice per language of the site, pinned to the voices' v1.0.0 tag.
 *  Datasets: SIWIS (CC BY 4.0), LJSpeech (public domain), davefx (CC0),
 *  kareem and huayan (see their MODEL_CARD). */
export const PIPER_VOICES: Record<string, string> = {
  fr: "fr/fr_FR/siwis/medium/fr_FR-siwis-medium",
  en: "en/en_US/ljspeech/medium/en_US-ljspeech-medium",
  es: "es/es_ES/davefx/medium/es_ES-davefx-medium",
  ar: "ar/ar_JO/kareem/medium/ar_JO-kareem-medium",
  zh: "zh/zh_CN/huayan/medium/zh_CN-huayan-medium",
};

/** The voice for a BCP 47 tag ("fr", "fr-CA", "zh-Hans"…), or null. */
export function piperVoiceFor(lang: string): string | null {
  return PIPER_VOICES[lang.toLowerCase().split("-")[0]] ?? null;
}

/** What the voice needs from the browser. */
export function piperSupported(): boolean {
  return (
    typeof WebAssembly === "object" &&
    typeof Worker === "function" &&
    typeof AudioContext === "function" &&
    typeof caches === "object"
  );
}

type Out =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; sampleRate: number }
  | { type: "load-error"; message: string }
  | { type: "audio"; id: number; pcm: Float32Array }
  | { type: "error"; id: number; message: string };

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  worker ??= new Worker("/js/piper.worker.js", { type: "module" });
  return worker;
}

/** Download (the first time) and load the voice for `lang`; resolves with
 *  its sample rate, or null when there is none or it fails. `onProgress`
 *  gets 0–100 while it downloads. */
export function loadPiperVoice(
  lang: string,
  onProgress?: (pct: number) => void,
): Promise<number | null> {
  const path = piperVoiceFor(lang);
  if (!path || !piperSupported()) return Promise.resolve(null);
  // Ask to keep the site's storage, or Safari may evict the voice.
  void navigator.storage?.persist?.().catch(() => false);
  let w: Worker;
  try {
    w = getWorker();
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const done = (rate: number | null) => {
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      resolve(rate);
    };
    const onMsg = (e: MessageEvent<Out>) => {
      const m = e.data;
      if (m.type === "progress" && m.total > 0)
        onProgress?.(Math.floor((m.loaded / m.total) * 100));
      else if (m.type === "ready") done(m.sampleRate);
      else if (m.type === "load-error") done(null);
    };
    const onErr = () => {
      // A worker that crashed is useless from here on.
      if (worker === w) worker = null;
      w.terminate();
      done(null);
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    w.postMessage({ type: "load", path });
  });
}

/** Forget the downloaded voices and stop the worker. */
export async function deletePiperVoices(): Promise<void> {
  worker?.terminate();
  worker = null;
  try {
    await caches.delete("piper-voices");
  } catch {
    /* no Cache Storage */
  }
}

export interface PiperReading {
  pause(): void;
  resume(): void;
  stop(): void;
}

/** How far ahead of what is playing the voice keeps synthesizing. */
const AHEAD_S = 12;

/**
 * Read `chunks` aloud through `ctx` (an AudioContext the caller made in the
 * click, which iOS requires). Each chunk is synthesized while the previous
 * one plays and scheduled right after it, so the speech runs on without
 * gaps whenever the device keeps up. Resolves null when the voice can't
 * load; `onEnd` fires after the last chunk, `onError` when one fails.
 */
export async function readWithPiper(opts: {
  ctx: AudioContext;
  lang: string;
  chunks: string[];
  onProgress?: (pct: number) => void;
  onPlaying?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}): Promise<PiperReading | null> {
  const { ctx, chunks } = opts;
  const rate = await loadPiperVoice(opts.lang, opts.onProgress);
  if (!rate || !worker || ctx.state === "closed") return null;
  const w = worker;
  let stopped = false;
  let asked = 0; // chunks sent to the worker
  let pending = 0; // sent, not back yet
  let playAt = 0;
  let last: AudioBufferSourceNode | null = null;
  const ids = new Map<number, number>(); // message id → chunk index

  const finish = () => {
    w.removeEventListener("message", onMsg);
    clearInterval(timer);
  };
  const askMore = () => {
    if (stopped) return;
    while (
      pending === 0 &&
      asked < chunks.length &&
      playAt - ctx.currentTime < AHEAD_S
    ) {
      const id = nextId++;
      ids.set(id, asked++);
      pending++;
      w.postMessage({ type: "speak", id, text: chunks[ids.get(id)!] });
    }
  };
  const onMsg = (e: MessageEvent<Out>) => {
    const m = e.data;
    if ((m.type !== "audio" && m.type !== "error") || !ids.has(m.id)) return;
    const index = ids.get(m.id)!;
    ids.delete(m.id);
    pending--;
    if (stopped) return;
    if (m.type === "error") {
      stopped = true;
      finish();
      opts.onError?.();
      return;
    }
    const buf = ctx.createBuffer(1, m.pcm.length, rate);
    buf.copyToChannel(m.pcm as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    if (index === 0) opts.onPlaying?.();
    // A short breath between chunks; none to make up when synthesis is late.
    playAt = Math.max(playAt + 0.15, ctx.currentTime + 0.05);
    src.start(playAt);
    playAt += buf.duration;
    last = src;
    if (index === chunks.length - 1) {
      src.onended = () => {
        if (stopped || last !== src) return;
        stopped = true;
        finish();
        opts.onEnd?.();
      };
    }
    askMore();
  };
  w.addEventListener("message", onMsg);
  // Synthesis waits while enough is queued; this picks it up again.
  const timer = setInterval(askMore, 500);
  askMore();

  return {
    pause: () => void ctx.suspend().catch(() => {}),
    resume: () => void ctx.resume().catch(() => {}),
    stop: () => {
      stopped = true;
      finish();
      void ctx.close().catch(() => {});
    },
  };
}
