// The assistant's downloaded model: Qwen3.5-2B (Alibaba, ~1.4 GB in q4f16)
// run with Transformers.js on WebGPU, in a worker (public/js/local-llm-worker.js).
// It replaced LFM3-1.7B after the tests of 2026-11-04 (/parler/'s partner:
// it kept the answer format and wrote correct Spanish and Turkish where LFM3
// mixed in French and English).
// On iPhone and iPad, LFM2-700M (~0.5 GB): iOS ends a tab well before the
// big one has loaded and answered, so it never got to write a word there.
// It is the second on-device option after Chrome's Gemini Nano
// (lib/browser-ai.ts), for browsers that have WebGPU but no Prompt API —
// Safari on iPhone, Chrome on Android, Firefox. The download never starts by
// itself: the reader agrees to it (components/chat/GardenChat.tsx), which is
// remembered in localStorage, and the browser keeps the files in its Cache
// Storage ("transformers-cache") until the reader deletes them.
//
// Every function feature-detects and never throws, except promptLocal() on
// an abort (AbortError, like fetch).

import { onIos, smallDevice } from "./garden-ai-flags";

const OPT_IN_KEY = "gk-local-llm";
/** Day the download finished, "YYYY-MM-DD" (shown in the settings). */
const DONE_KEY = "gk-local-llm-done";
/** Transformers.js's Cache Storage bucket (env.cacheKey). */
const CACHE_NAME = "transformers-cache";
/** The model this device downloads. Sizes are q4f16's (q4, without
 *  shader-f16, is ~15 % more), shown on the download buttons. */
export interface LocalModel {
  id: string;
  name: string;
  gb: number;
  bytes: number;
}
const BIG: LocalModel = { id: "onnx-community/Qwen3.5-2B-ONNX", name: "Qwen3.5", gb: 1.4, bytes: 1_380_000_000 };
const SMALL: LocalModel = { id: "onnx-community/LFM2-700M-ONNX", name: "LFM2", gb: 0.5, bytes: 500_000_000 };

export function localModel(): LocalModel {
  return smallDevice() ? SMALL : BIG;
}

/** /parler/'s optional corrector: Qwen3.5-4B (~2.8 GB), the only model of
 *  the tests that found the learner's mistakes. Desktop only. */
export const CORRECTOR: LocalModel = { id: "onnx-community/Qwen3.5-4B-ONNX", name: "Qwen3.5-4B", gb: 2.8, bytes: 2_800_000_000 };
const CORRECTOR_KEY = "gk-corrector";

type GpuAdapter = { features: { has(f: string): boolean } };
type Gpu = { requestAdapter(): Promise<GpuAdapter | null> };

let support: Promise<"q4f16" | "q4" | null> | null = null;

/** Why the model last failed (the worker's own message, or that the worker
 *  stopped, as when the system ends it for memory); "" after a success. */
let lastError = "";
export function localModelError(): string {
  return lastError;
}

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
      // A passing failure (the GPU process restarting): asked again next time.
      support = null;
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
  // Ask to keep the site's storage: without it Safari may evict a 1 GB cache
  // entry, and every load becomes a new download.
  if (on) void navigator.storage?.persist?.().catch(() => false);
  try {
    if (on) localStorage.setItem(OPT_IN_KEY, "1");
    else localStorage.removeItem(OPT_IN_KEY);
  } catch {
    /* localStorage unavailable */
  }
  if (!on) stopWorker();
}

/** End the worker and settle what was waiting on it: a terminated worker
 *  sends nothing more, so a load or an answer in progress would never end. */
function stopWorker(): void {
  worker?.terminate();
  worker = null;
  loading.clear();
  loaded.clear();
  lastProgress.clear();
  for (const settle of [...waiting]) settle();
  waiting.clear();
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

async function deleteFiles(ids: string[]): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const r of await cache.keys())
      if (ids.some((id) => r.url.includes(`/${id}/`))) await cache.delete(r);
  } catch {
    /* no Cache Storage */
  }
}

/** Delete the assistant's downloaded files and forget the opt-in. The
 *  corrector of /parler/ shares the cache and keeps its own files: it has
 *  its own switch there (deleteCorrector). */
export async function deleteLocalModel(): Promise<void> {
  setLocalModelEnabled(false);
  try {
    localStorage.removeItem(DONE_KEY);
  } catch {
    /* localStorage unavailable */
  }
  await deleteFiles([BIG.id, SMALL.id]);
}

/** Whether the model's weights are already in Cache Storage, so a load reads
 *  them from the device instead of downloading them. */
export async function localModelCached(model: LocalModel = localModel()): Promise<boolean> {
  const dtype = await variant();
  if (!dtype) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const { id } = model;
    // "model_q4f16.onnx_data" (LFM) or "decoder_model_merged_q4f16.onnx_data" (Qwen).
    const weights = new RegExp(`/onnx/(?:decoder_model_merged|model)_${dtype}\\.onnx_data$`);
    return keys.some((r) => r.url.includes(`/${id}/`) && weights.test(r.url));
  } catch {
    return false;
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
  | { type: "progress"; model: string; loaded: number; total: number }
  | { type: "ready"; model: string }
  | { type: "load-error"; model: string; message: string }
  | { type: "text" | "done"; id: number; text: string }
  | { type: "error"; id: number; message: string };

let worker: Worker | null = null;
let nextId = 1;
/** Loads in progress and models loaded in this page, by model id. */
const loading = new Map<string, Promise<boolean>>();
const loaded = new Set<string>();
/** Download progress by model id, while it loads only. */
const lastProgress = new Map<string, LoadProgress>();
const progressListeners = new Set<{ model: string; cb: (p: LoadProgress) => void }>();
/** Settles every promise waiting on the worker, for when it is stopped. */
const waiting = new Set<() => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker("/js/local-llm.worker.js", { type: "module" });
  } catch {
    return null;
  }
  worker.addEventListener("message", (e: MessageEvent<Out>) => {
    if (e.data?.type === "progress") {
      const p = { loaded: e.data.loaded, total: e.data.total };
      lastProgress.set(e.data.model, p);
      for (const l of progressListeners) if (l.model === e.data.model) l.cb(p);
    }
  });
  return worker;
}

/** Whether the model is loaded in this page (no wait before the first word). */
export function localModelLoaded(model: LocalModel = localModel()): boolean {
  return loaded.has(model.id);
}

/** Whether the model is being downloaded or loaded right now. */
export function localModelLoading(model: LocalModel = localModel()): boolean {
  return loading.has(model.id) && !loaded.has(model.id);
}

/** Follow one model's download (or its loading from cache). Returns an
 *  unsubscribe. */
export function onLoadProgress(cb: (p: LoadProgress) => void, model: LocalModel = localModel()): () => void {
  const l = { model: model.id, cb };
  progressListeners.add(l);
  const last = lastProgress.get(model.id);
  if (last) cb(last);
  return () => progressListeners.delete(l);
}

/** Download (the first time) and load the model; resolves true once it can
 *  answer. Several callers share one load. */
export function loadLocalModel(model: LocalModel = localModel()): Promise<boolean> {
  if (loaded.has(model.id)) return Promise.resolve(true);
  const pending = loading.get(model.id);
  if (pending) return pending;
  const p = (async () => {
    const dtype = await variant();
    // Already on the device: this load downloads nothing, and is no date to
    // remember as "downloaded on".
    const had = dtype ? await localModelCached(model) : false;
    const w = dtype ? getWorker() : null;
    if (!w) return false;
    return new Promise<boolean>((resolve) => {
      const end = (ok: boolean) => {
        w.removeEventListener("message", onMsg);
        w.removeEventListener("error", onErr);
        waiting.delete(stopped);
        lastProgress.delete(model.id);
        resolve(ok);
      };
      // The worker was stopped under this load (the reader turned the model
      // off): nothing loaded.
      const stopped = () => end(false);
      const onMsg = (e: MessageEvent<Out>) => {
        const m = e.data;
        // The corrector can load beside the assistant: each load waits for
        // its own model's word.
        if ((m?.type !== "ready" && m?.type !== "load-error") || m.model !== model.id) return;
        if (m.type === "ready") {
          loaded.add(model.id);
          lastError = "";
          try {
            if (!had && model.id === localModel().id)
              localStorage.setItem(DONE_KEY, new Date().toISOString().slice(0, 10));
          } catch {
            /* localStorage unavailable */
          }
        } else {
          loading.delete(model.id);
          lastError = m.message;
        }
        end(m.type === "ready");
      };
      const onErr = (ev: ErrorEvent) => {
        lastError = ev.message || "worker stopped while loading";
        if (worker === w) worker = null;
        w.terminate();
        loading.clear();
        loaded.clear();
        end(false);
      };
      waiting.add(stopped);
      w.addEventListener("message", onMsg);
      w.addEventListener("error", onErr);
      w.postMessage({ type: "load", dtype, model: model.id });
    });
  })();
  loading.set(model.id, p);
  return p;
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
  /** Another model than the assistant's (the corrector). */
  model?: LocalModel;
}): Promise<string | null> {
  const model = opts.model ?? localModel();
  const dtype = await variant();
  if (!dtype) return null;
  if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!(await loadLocalModel(model))) return null;
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
      waiting.delete(stopped);
    };
    // The worker was stopped under this answer: what it wrote so far.
    const stopped = () => {
      finish();
      resolve(out.trim() ? out : null);
    };
    waiting.add(stopped);
    const onMsg = (e: MessageEvent<Out>) => {
      const m = e.data;
      if (!("id" in m) || m.id !== id) return;
      if (m.type === "text") {
        out = m.text;
        opts.onText?.(out);
      } else {
        finish();
        if (m.type === "error") lastError = m.message;
        const text = m.type === "done" ? m.text : out;
        resolve(text.trim() ? text : null);
      }
    };
    const onErr = (ev: ErrorEvent) => {
      finish();
      lastError = ev.message || "worker stopped while answering";
      // A worker that crashed (e.g. out of memory) is useless from here on:
      // drop it so the next try starts a fresh one.
      if (worker === w) worker = null;
      w.terminate();
      loading.clear();
      loaded.clear();
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
      model: model.id,
    });
  });
}

// --- the corrector of /parler/ ---------------------------------------------

/** A computer that may run the 2.8 GB corrector: not a phone or tablet, and
 *  (when the browser says) at least 8 GB of memory. */
export async function correctorSupported(): Promise<boolean> {
  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  if (!nav || onIos() || /Android|Mobile/i.test(nav.userAgent)) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 8) return false;
  return (await variant()) !== null;
}

export function correctorEnabled(): boolean {
  try {
    return localStorage.getItem(CORRECTOR_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCorrectorEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(CORRECTOR_KEY, "1");
    else localStorage.removeItem(CORRECTOR_KEY);
  } catch {
    /* localStorage unavailable */
  }
}

/** Delete the corrector's files (the assistant's stay). */
export async function deleteCorrector(): Promise<void> {
  setCorrectorEnabled(false);
  await deleteFiles([CORRECTOR.id]);
}
