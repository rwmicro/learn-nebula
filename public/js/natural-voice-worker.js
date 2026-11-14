// The natural reading voices (Piper, a VITS model per language, ~63 MB; and
// Kokoro and MMS, lib/natural-voices.ts), run
// in a Web Worker so the page stays responsive while it speaks. Bundled as an
// ES module by scripts/bundle-js.mjs into natural-voice.worker.js (git-ignored) and
// driven by lib/piper-voice.ts.
//
// Text → phoneme ids with piper_phonemize (eSpeak NG in WebAssembly, from
// /piper/, scripts/copy-piper.mjs), then ids → PCM samples with the
// voice's ONNX model on onnxruntime-web's CPU runtime (/ort/). The model
// comes from Hugging Face once and stays in Cache Storage ("piper-voices").
//
// Messages in:  {type: "load", path}           download / compile only
//               {type: "speak", id, text}      one chunk of the note
// Messages out: {type: "progress", loaded, total} while the voice downloads
//               {type: "ready", path, sampleRate} | {type: "load-error", path, message}
//               {type: "audio", id, pcm}       Float32Array, transferred
//               {type: "error", id, message}
import * as ort from "onnxruntime-web/wasm";
import createPiperPhonemize from "@diffusionstudio/piper-wasm/build/piper_phonemize.js";
import {
  kokoroIds,
  kokoroPhonemes,
  mmsIds,
  parseMmsTokens,
} from "../../lib/natural-voices.ts";

const VOICES_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/";
// Kokoro (one model, a style file per voice) and MMS (a model per language),
// pinned to a commit. lib/natural-voices.ts names their voices:
// "kokoro:<voice>:<espeak voice>" and "mms:<folder>"; a bare path is Piper's.
const KOKORO_BASE =
  "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231/";
const MMS_BASE =
  "https://huggingface.co/willwade/mms-tts-multilingual-models-onnx/resolve/4f49fc254f11ddb0e35fbf25b6e48b04463a6779/";
const CACHE_NAME = "piper-voices";

// The ONNX runtime from our own origin (scripts/copy-ort.mjs), one thread:
// more need a cross-origin-isolated page, and a proxy worker a blob: script
// the CSP doesn't allow.
ort.env.wasm.wasmPaths = {
  mjs: "/ort/ort-wasm-simd-threaded.mjs",
  wasm: "/ort/ort-wasm-simd-threaded.wasm",
};
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

/** Fetch `url`, from Cache Storage when it is there; `onProgress` follows a
 *  download. */
async function cachedBytes(url, onProgress) {
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = null;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const total = Number(res.headers.get("Content-Length")) || 0;
  const reader = res.body.getReader();
  const parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  try {
    await cache?.put(url, new Response(bytes));
  } catch {
    /* quota: it is downloaded again next time */
  }
  return bytes;
}

// The phonemizer's files, loaded once: its compiled module, and its data
// package rebuilt to full size from the ranges copy-piper.mjs kept (the
// dictionaries it dropped are zeros nobody reads).
let phonemizer = null;
function loadPhonemizer() {
  phonemizer ??= (async () => {
    const [wasm, data, table] = await Promise.all([
      fetch("/piper/piper_phonemize.wasm").then((r) => r.arrayBuffer()),
      fetch("/piper/piper_phonemize.data").then((r) => r.arrayBuffer()),
      fetch("/piper/piper_phonemize.json").then((r) => r.json()),
    ]);
    const full = new Uint8Array(table.size);
    const kept = new Uint8Array(data);
    let at = 0;
    for (const [a, b] of table.ranges) {
      full.set(kept.subarray(at, at + b - a), a);
      at += b - a;
    }
    return { module: await WebAssembly.compile(wasm), data: full.buffer };
  })().catch((e) => {
    phonemizer = null;
    throw e;
  });
  return phonemizer;
}

/** Phonemes of `text` in eSpeak voice `lang` (Piper's ids for them, and the
 *  IPA symbols themselves for Kokoro). piper_phonemize is a
 *  command-line program: one fresh instance per call (its eSpeak state isn't
 *  meant to run main() twice), cheap since the module is compiled once. */
async function phonemize(text, lang) {
  const { module, data } = await loadPhonemizer();
  let ids = null;
  let phonemes = null;
  const instance = await createPiperPhonemize({
    print(line) {
      try {
        const out = JSON.parse(line);
        ids = out.phoneme_ids ?? ids;
        phonemes = out.phonemes ?? phonemes;
      } catch {
        /* not the JSON line */
      }
    },
    printErr() {},
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(module, imports).then((inst) => done(inst));
      return {};
    },
    getPreloadedPackage: () => data,
  });
  instance.callMain([
    "-l",
    lang,
    "--input",
    JSON.stringify([{ text }]),
    "--espeak_data",
    "/espeak-ng-data",
  ]);
  if (!ids?.length) throw new Error("no phonemes");
  return { ids, phonemes: (phonemes ?? []).join("") };
}

// The voices in memory, by path, the most recently used last. A note can
// alternate between two languages (French prose, Chinese examples): keeping
// both spares reloading 70 MB of model at every change of voice. A third
// one releases the oldest.
const MAX_VOICES = 2;
const voices = new Map(); // path → {path, kind, session, rate, …}
let voice = null; // the last one asked for
const loads = new Map(); // path → promise

const decode = (bytes) => new TextDecoder().decode(bytes);
const progress = (loaded, total) =>
  self.postMessage({ type: "progress", loaded, total });
const session = (model) =>
  ort.InferenceSession.create(model, { executionProviders: ["wasm"] });

// Kokoro's model, shared by its voices.
let kokoro = null;
function kokoroModel() {
  kokoro ??= Promise.all([
    cachedBytes(`${KOKORO_BASE}onnx/model_quantized.onnx`, progress).then(
      session,
    ),
    cachedBytes(`${KOKORO_BASE}tokenizer.json`).then(
      (b) => JSON.parse(decode(b)).model.vocab,
    ),
  ]).catch((e) => {
    kokoro = null;
    throw e;
  });
  return kokoro;
}

async function build(path) {
  const k = /^kokoro:([a-z]{2}_[a-z]+):([a-z-]+)$/.exec(path);
  if (k) {
    const [[model, vocab], style] = await Promise.all([
      kokoroModel(),
      cachedBytes(`${KOKORO_BASE}voices/${k[1]}.bin`),
      loadPhonemizer(),
    ]);
    return {
      path,
      kind: "kokoro",
      session: model,
      vocab,
      // 510 styles of 256 numbers: one per length of the phrase.
      style: new Float32Array(
        style.buffer,
        style.byteOffset,
        style.byteLength >> 2,
      ),
      espeak: k[2],
      rate: 24000,
    };
  }
  const m = /^mms:([a-z_-]+)$/.exec(path);
  if (m) {
    const [tokens, model] = await Promise.all([
      cachedBytes(`${MMS_BASE}${m[1]}/tokens.txt`).then((b) =>
        parseMmsTokens(decode(b)),
      ),
      cachedBytes(`${MMS_BASE}${m[1]}/model.onnx`, progress),
    ]);
    return {
      path,
      kind: "mms",
      session: await session(model),
      tokens,
      rate: 16000,
    };
  }
  const [config, model] = await Promise.all([
    cachedBytes(`${VOICES_BASE}${path}.onnx.json`).then((b) =>
      JSON.parse(decode(b)),
    ),
    cachedBytes(`${VOICES_BASE}${path}.onnx`, progress),
    loadPhonemizer(),
  ]);
  return {
    path,
    kind: "piper",
    session: await session(model),
    config,
    rate: config.audio.sample_rate,
  };
}

function load(path) {
  const have = voices.get(path);
  if (have) {
    voices.delete(path);
    voices.set(path, have);
    voice = have;
    return Promise.resolve(have);
  }
  if (loads.has(path)) return loads.get(path);
  const promise = (async () => {
    const v = await build(path);
    voices.set(path, v);
    voice = v;
    for (const [old, gone] of voices) {
      if (voices.size <= MAX_VOICES) break;
      if (old === path) continue;
      voices.delete(old);
      // Kokoro's voices share one model: it goes with the last of them.
      if (gone.kind === "kokoro") {
        if ([...voices.values()].some((x) => x.kind === "kokoro")) continue;
        kokoro = null;
      }
      // After what is already queued for it has been said.
      queue = queue.then(() => gone.session.release?.()).catch(() => {});
    }
    return v;
  })();
  loads.set(path, promise);
  promise.then(
    () => loads.delete(path),
    () => loads.delete(path),
  );
  return promise;
}

async function speak(text, rate = 1, path = null) {
  // `path` names the voice (a reading in several languages); without it,
  // the last one loaded.
  const v = path
    ? await load(path)
    : (voice ?? (await [...loads.values()].pop()));
  if (!v) throw new Error("no voice loaded");
  if (v.kind === "mms") return speakMms(v, text, rate);
  if (v.kind === "kokoro") return speakKokoro(v, text, rate);
  const { ids } = await phonemize(text, v.config.espeak.voice);
  const inf = v.config.inference;
  const feeds = {
    input: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [
      1,
      ids.length,
    ]),
    input_lengths: new ort.Tensor(
      "int64",
      BigInt64Array.of(BigInt(ids.length)),
      [1],
    ),
    scales: new ort.Tensor(
      "float32",
      // A slower line (/parler/'s beginner partners) stretches the phonemes.
      Float32Array.of(inf.noise_scale, inf.length_scale / rate, inf.noise_w),
      [3],
    ),
  };
  if (v.config.num_speakers > 1)
    feeds.sid = new ort.Tensor("int64", BigInt64Array.of(0n), [1]);
  const out = await v.session.run(feeds);
  return Float32Array.from(out.output.data);
}

const f32 = (...n) =>
  new ort.Tensor("float32", Float32Array.of(...n), [n.length]);
const i64 = (ids) =>
  new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]);

async function speakMms(v, text, rate) {
  const ids = mmsIds(text, v.tokens);
  if (!ids) throw new Error("text not in the voice's alphabet");
  const out = await v.session.run({
    x: i64(ids),
    x_length: new ort.Tensor(
      "int64",
      BigInt64Array.of(BigInt(ids.length)),
      [1],
    ),
    noise_scale: f32(0.667),
    length_scale: f32(1 / rate),
    noise_scale_w: f32(0.8),
  });
  return Float32Array.from(out.y.data);
}

async function speakKokoro(v, text, rate) {
  const { phonemes } = await phonemize(text, v.espeak);
  const runs = kokoroIds(kokoroPhonemes(phonemes, v.espeak), v.vocab);
  if (!runs.length) throw new Error("no phonemes");
  const parts = [];
  let length = 0;
  for (const run of runs) {
    const at = Math.min(run.length, 509) * 256;
    const out = await v.session.run({
      input_ids: i64([0, ...run, 0]),
      style: new ort.Tensor("float32", v.style.slice(at, at + 256), [1, 256]),
      speed: f32(rate),
    });
    const pcm = out.waveform.data;
    parts.push(pcm);
    length += pcm.length;
  }
  const all = new Float32Array(length);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}

// One chunk at a time, in order.
let queue = Promise.resolve();

self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type === "load") {
    const path = String(msg.path);
    load(path).then(
      (v) => self.postMessage({ type: "ready", path, sampleRate: v.rate }),
      (err) =>
        self.postMessage({
          type: "load-error",
          path,
          message: String(err?.message || err),
        }),
    );
  } else if (msg.type === "speak") {
    queue = queue.then(() =>
      speak(
        String(msg.text),
        Math.min(2, Math.max(0.5, Number(msg.rate) || 1)),
        msg.path ? String(msg.path) : null,
      ).then(
        (pcm) =>
          self.postMessage({ type: "audio", id: msg.id, pcm }, [pcm.buffer]),
        (err) =>
          self.postMessage({
            type: "error",
            id: msg.id,
            message: String(err?.message || err),
          }),
      ),
    );
  }
});
