// The assistant's downloaded model: LFM3-1.7B (Liquid AI, ~1.1 GB in q4f16)
// run with Transformers.js on WebGPU, in a worker (public/js/local-llm-worker.js).
// It is the second on-device option after Chrome's Gemini Nano
// (lib/browser-ai.ts), for browsers that have WebGPU but no Prompt API —
// Safari on iPhone, Chrome on Android, Firefox. The download never starts by
// itself: the reader agrees to it (components/GardenChat.tsx), which is
// remembered in localStorage, and the browser keeps the files in its Cache
// Storage ("transformers-cache") until the reader deletes them.
//
// Every function feature-detects and never throws, except promptLocal() on
// an abort (AbortError, like fetch).

const OPT_IN_KEY = "gk-local-llm";
/** Day the download finished, "YYYY-MM-DD" (shown in the settings). */
const DONE_KEY = "gk-local-llm-done";
/** Transformers.js's Cache Storage bucket (env.cacheKey). */
const CACHE_NAME = "transformers-cache";
/** Shown on the download buttons. q4 (no shader-f16) is ~1.3 GB. */
export const LOCAL_MODEL_SIZE_GB = 1.1;
export const LOCAL_MODEL_BYTES = 1_100_000_000;

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

/** Whether the reader agreed to the download. */
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
    loading = null;
    loaded = false;
  }
}

/** Opted in and able to run it. */
export async function localModelReady(): Promise<boolean> {
  return localModelEnabled() && (await localModelSupported());
}

/** Day the download finished, or "" when it never did. */
export function localModelDownloadedOn(): string {
  try {
    return localStorage.getItem(DONE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Delete the downloaded files and forget the opt-in. */
export async function deleteLocalModel(): Promise<void> {
  setLocalModelEnabled(false);
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {
    /* localStorage unavailable */
  }
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    /* no Cache Storage */
  }
}

/** Free space the browser grants this site, in bytes (null when unknown). */
export async function storageFree(): Promise<{ free: number; used: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || !e.quota) return null;
    return { free: Math.max(0, e.quota - (e.usage ?? 0)), used: e.usage ?? 0 };
  } catch {
    return null;
  }
}

/** Download progress, shared by every caller (one download per page). */
export interface LoadProgress {
  loaded: number;
  total: number;
}

type Out =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "load-error"; message: string }
  | { type: "text" | "done"; id: number; text: string }
  | { type: "error"; id: number; message: string };

let worker: Worker | null = null;
let nextId = 1;
let loading: Promise<boolean> | null = null;
let loaded = false;
let lastProgress: LoadProgress | null = null;
const progressListeners = new Set<(p: LoadProgress) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker("/js/local-llm.worker.js", { type: "module" });
  } catch {
    return null;
  }
  worker.addEventListener("message", (e: MessageEvent<Out>) => {
    if (e.data?.type === "progress") {
      lastProgress = { loaded: e.data.loaded, total: e.data.total };
      for (const cb of progressListeners) cb(lastProgress);
    }
  });
  return worker;
}

/** Whether the model is loaded in this page (no wait before the first word). */
export function localModelLoaded(): boolean {
  return loaded;
}

/** Follow the download (or the loading from cache). Returns an unsubscribe. */
export function onLoadProgress(cb: (p: LoadProgress) => void): () => void {
  progressListeners.add(cb);
  if (lastProgress) cb(lastProgress);
  return () => progressListeners.delete(cb);
}

/** Download (the first time) and load the model; resolves true once it can
 *  answer. Several callers share one load. */
export function loadLocalModel(): Promise<boolean> {
  if (loaded) return Promise.resolve(true);
  loading ??= (async () => {
    const dtype = await variant();
    const w = dtype ? getWorker() : null;
    if (!w) return false;
    return new Promise<boolean>((resolve) => {
      const onMsg = (e: MessageEvent<Out>) => {
        if (e.data?.type === "ready" || e.data?.type === "load-error") {
          w.removeEventListener("message", onMsg);
          w.removeEventListener("error", onErr);
          const ok = e.data.type === "ready";
          if (ok) {
            loaded = true;
            try {
              if (!localStorage.getItem(DONE_KEY))
                localStorage.setItem(DONE_KEY, new Date().toISOString().slice(0, 10));
            } catch {
              /* localStorage unavailable */
            }
          } else loading = null;
          resolve(ok);
        }
      };
      const onErr = () => {
        w.removeEventListener("message", onMsg);
        w.removeEventListener("error", onErr);
        if (worker === w) worker = null;
        w.terminate();
        loading = null;
        resolve(false);
      };
      w.addEventListener("message", onMsg);
      w.addEventListener("error", onErr);
      w.postMessage({ type: "load", dtype });
    });
  })();
  return loading;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Run one prompt on the downloaded model, streaming the text so far into
 *  `onText`. `history` holds the earlier turns of the conversation and
 *  `prompt` the new user turn. Resolves with the answer, or null when the
 *  model can't run or fails before saying anything. */
export async function promptLocal(opts: {
  system: string;
  prompt: string;
  history?: ChatTurn[];
  maxTokens?: number;
  signal?: AbortSignal;
  onText?: (text: string) => void;
}): Promise<string | null> {
  const dtype = await variant();
  if (!dtype) return null;
  if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!(await loadLocalModel())) return null;
  if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const w = getWorker();
  if (!w) return null;
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
      if (!("id" in m) || m.id !== id) return;
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
      // A worker that crashed (e.g. out of memory) is useless from here on:
      // drop it so the next try starts a fresh one.
      if (worker === w) worker = null;
      w.terminate();
      loading = null;
      loaded = false;
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
    w.postMessage({
      type: "generate",
      id,
      system: opts.system,
      messages: [...(opts.history ?? []), { role: "user", content: opts.prompt }],
      maxTokens: opts.maxTokens,
      dtype,
    });
  });
}
