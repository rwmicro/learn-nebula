// The assistant's downloaded model: LFM3-1.7B (Liquid AI, ~1.1 GB in q4f16)
// run with Transformers.js on WebGPU, in a worker (public/js/local-llm-worker.js).
// It is the second on-device option after Chrome's Gemini Nano
// (lib/browser-ai.ts), for browsers that have WebGPU but no Prompt API —
// Safari, Firefox, Chrome on other platforms. The download never starts by
// itself: the reader opts in ("Répondre sur cet appareil"), which is
// remembered in localStorage, and the browser keeps the files in its cache.
//
// Every function feature-detects and never throws, except promptLocal() on
// an abort (AbortError, like fetch).

const OPT_IN_KEY = "gk-local-llm";
/** Shown on the opt-in button. q4 (no shader-f16) is ~1.3 GB. */
export const LOCAL_MODEL_SIZE_GB = 1.1;

type GpuAdapter = { features: { has(f: string): boolean } };
type Gpu = { requestAdapter(): Promise<GpuAdapter | null> };

let support: Promise<"q4f16" | "q4" | null> | null = null;

/** The model variant this device can run: q4f16 with half-precision shaders,
 *  q4 without, null with no WebGPU at all. */
function variant(): Promise<"q4f16" | "q4" | null> {
  support ??= (async () => {
    const gpu = (globalThis.navigator as unknown as { gpu?: Gpu } | undefined)?.gpu;
    if (!gpu || typeof Worker === "undefined") return null;
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) return null;
      return adapter.features.has("shader-f16") ? "q4f16" : "q4";
    } catch {
      return null;
    }
  })();
  return support;
}

/** Whether this browser could run the model (WebGPU present). */
export async function localModelSupported(): Promise<boolean> {
  return (await variant()) !== null;
}

/** Whether the reader opted in to the download. */
export function localModelEnabled(): boolean {
  try {
    return localStorage.getItem(OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setLocalModelEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(OPT_IN_KEY, "1");
    else localStorage.removeItem(OPT_IN_KEY);
  } catch {
    /* localStorage unavailable */
  }
  if (!on) {
    worker?.terminate();
    worker = null;
  }
}

/** Opted in and able to run it. */
export async function localModelReady(): Promise<boolean> {
  return localModelEnabled() && (await localModelSupported());
}

type Out =
  | { type: "progress"; fraction: number }
  | { type: "text" | "done"; id: number; text: string }
  | { type: "error"; id: number; message: string };

let worker: Worker | null = null;
let nextId = 1;

/** Run one prompt on the downloaded model, streaming the text so far into
 *  `onText` and the first download into `onProgress` (0–1). Resolves with
 *  the answer, or null when the model can't run or fails before saying
 *  anything (the caller then asks the server). */
export async function promptLocal(opts: {
  system: string;
  prompt: string;
  signal?: AbortSignal;
  onText?: (text: string) => void;
  onProgress?: (fraction: number) => void;
}): Promise<string | null> {
  const dtype = await variant();
  if (!dtype) return null;
  if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  try {
    worker ??= new Worker("/js/local-llm.worker.js", { type: "module" });
  } catch {
    return null;
  }
  const w = worker;
  const id = nextId++;
  let out = "";
  return new Promise<string | null>((resolve, reject) => {
    const finish = () => {
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      opts.signal?.removeEventListener("abort", onAbort);
    };
    const onMsg = (e: MessageEvent<Out>) => {
      const m = e.data;
      if (m.type === "progress") {
        opts.onProgress?.(m.fraction);
        return;
      }
      if (m.id !== id) return;
      if (m.type === "text") {
        out = m.text;
        opts.onText?.(out);
      } else {
        finish();
        const text = m.type === "done" ? m.text : out;
        resolve(text.trim() ? text : null);
      }
    };
    const onErr = () => {
      finish();
      // A worker that failed to start (or crashed, e.g. out of memory) is
      // useless from here on: drop it so the next try starts a fresh one.
      if (worker === w) worker = null;
      w.terminate();
      resolve(out.trim() ? out : null);
    };
    const onAbort = () => {
      finish();
      w.postMessage({ type: "interrupt", id });
      reject(new DOMException("Aborted", "AbortError"));
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    w.postMessage({ type: "generate", id, system: opts.system, prompt: opts.prompt, dtype });
  });
}
