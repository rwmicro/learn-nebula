// The natural reading voice (Piper, a VITS model per language, ~63 MB), run
// in a Web Worker so the page stays responsive while it speaks. Bundled as an
// ES module by scripts/bundle-js.mjs into piper.worker.js (git-ignored) and
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
//               {type: "ready", sampleRate} | {type: "load-error", message}
//               {type: "audio", id, pcm}       Float32Array, transferred
//               {type: "error", id, message}
import * as ort from "onnxruntime-web/wasm";
import createPiperPhonemize from "@diffusionstudio/piper-wasm/build/piper_phonemize.js";

const VOICES_BASE =
  "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/";
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

/** Phoneme ids for `text` in eSpeak voice `lang`. piper_phonemize is a
 *  command-line program: one fresh instance per call (its eSpeak state isn't
 *  meant to run main() twice), cheap since the module is compiled once. */
async function phonemeIds(text, lang) {
  const { module, data } = await loadPhonemizer();
  let ids = null;
  const instance = await createPiperPhonemize({
    print(line) {
      try {
        ids = JSON.parse(line).phoneme_ids ?? ids;
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
  return ids;
}

let voice = null; // {path, session, config}
let loading = null;

function load(path) {
  if (voice?.path === path) return Promise.resolve(voice);
  if (loading?.path === path) return loading.promise;
  const promise = (async () => {
    const [config, model] = await Promise.all([
      cachedBytes(`${VOICES_BASE}${path}.onnx.json`).then((b) =>
        JSON.parse(new TextDecoder().decode(b)),
      ),
      cachedBytes(`${VOICES_BASE}${path}.onnx`, (loaded, total) =>
        self.postMessage({ type: "progress", loaded, total }),
      ),
      loadPhonemizer(),
    ]);
    const session = await ort.InferenceSession.create(model, {
      executionProviders: ["wasm"],
    });
    voice = { path, session, config };
    return voice;
  })();
  loading = { path, promise };
  promise.finally(() => {
    if (loading?.promise === promise) loading = null;
  });
  return promise;
}

async function speak(text) {
  const v = voice ?? (await loading?.promise);
  if (!v) throw new Error("no voice loaded");
  const ids = await phonemeIds(text, v.config.espeak.voice);
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
      Float32Array.of(inf.noise_scale, inf.length_scale, inf.noise_w),
      [3],
    ),
  };
  if (v.config.num_speakers > 1)
    feeds.sid = new ort.Tensor("int64", BigInt64Array.of(0n), [1]);
  const out = await v.session.run(feeds);
  return Float32Array.from(out.output.data);
}

// One chunk at a time, in order.
let queue = Promise.resolve();

self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type === "load") {
    load(String(msg.path)).then(
      (v) =>
        self.postMessage({
          type: "ready",
          sampleRate: v.config.audio.sample_rate,
        }),
      (err) =>
        self.postMessage({
          type: "load-error",
          message: String(err?.message || err),
        }),
    );
  } else if (msg.type === "speak") {
    queue = queue.then(() =>
      speak(String(msg.text)).then(
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
