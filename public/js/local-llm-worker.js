// The garden assistant's downloaded model (LFM3-1.7B, ~1.1 GB, WebGPU), run
// in a Web Worker so the page stays responsive while it loads and writes.
// Bundled as an ES module by scripts/bundle-js.mjs into local-llm.worker.js
// (git-ignored) and driven by lib/local-llm.ts. The server still retrieves
// the passages (/api/ask/context); only the writing happens here.
//
// Messages in:  {type: "load", dtype}           download / compile only
//               {type: "generate", id, system, messages, dtype, maxTokens}
//               {type: "interrupt", id}
// Messages out: {type: "progress", loaded, total} while the model downloads
//               {type: "ready"} | {type: "load-error", message}
//               {type: "text", id, text}         the answer so far
//               {type: "done", id, text} | {type: "error", id, message}
import {
  env,
  pipeline,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "@huggingface/transformers";

const MODEL = "onnx-community/LFM3-1.7B-ONNX";

// The ONNX runtime from our own origin (scripts/copy-ort.mjs), not a CDN.
env.backends.onnx.wasm.wasmPaths = {
  mjs: "/ort/ort-wasm-simd-threaded.asyncify.mjs",
  wasm: "/ort/ort-wasm-simd-threaded.asyncify.wasm",
};
// No blob: copy of that glue (the CSP's script-src has no blob:); our own
// /ort/ files are cached by the browser like any static file.
env.useWasmCache = false;
env.allowLocalModels = false;

let generator = null;

// LFM3 reasons before answering by default; the chat template's
// enable_thinking=false turns that off. If a trace slips through anyway, only
// what follows </think> is the answer.
function visible(raw) {
  const end = raw.lastIndexOf("</think>");
  if (end >= 0) return raw.slice(end + 8).trimStart();
  return raw.trimStart().startsWith("<think>") ? "" : raw;
}

// One answer at a time: a new question waits for the interrupted one to stop.
let queue = Promise.resolve();
let running = 0;
const cancelled = new Set();
const stopping = new InterruptableStoppingCriteria();

function load(dtype) {
  generator ??= pipeline("text-generation", MODEL, {
    dtype,
    device: "webgpu",
    progress_callback(p) {
      if (p.status === "progress_total" && p.total > 0) {
        self.postMessage({ type: "progress", loaded: p.loaded, total: p.total });
      }
    },
  }).catch((e) => {
    generator = null;
    throw e;
  });
  return generator;
}

self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type === "interrupt") {
    if (msg.id === running) stopping.interrupt();
    else cancelled.add(msg.id);
    return;
  }
  if (msg.type === "load") {
    load(msg.dtype === "q4" ? "q4" : "q4f16").then(
      () => self.postMessage({ type: "ready" }),
      (err) => self.postMessage({ type: "load-error", message: String(err?.message || err) }),
    );
    return;
  }
  if (msg.type !== "generate") return;
  queue = queue.then(() => generate(msg));
});

async function generate(msg) {
  const { id } = msg;
  try {
    const pipe = await load(msg.dtype === "q4" ? "q4" : "q4f16");
    if (cancelled.delete(id)) return;
    let raw = "";
    const streamer = new TextStreamer(pipe.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function(chunk) {
        raw += chunk;
        const text = visible(raw);
        if (text) self.postMessage({ type: "text", id, text });
      },
    });
    stopping.reset();
    running = id;
    // Earlier turns of the conversation, then the new user turn.
    const turns = (msg.messages || []).filter(
      (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
    );
    await pipe(
      [{ role: "system", content: msg.system }, ...turns],
      {
        max_new_tokens: Math.min(Number(msg.maxTokens) || 768, 2048),
        do_sample: false,
        repetition_penalty: 1.05,
        tokenizer_encode_kwargs: { enable_thinking: false },
        streamer,
        stopping_criteria: stopping,
      },
    );
    self.postMessage({ type: "done", id, text: visible(raw) });
  } catch (err) {
    self.postMessage({ type: "error", id, message: String(err?.message || err) });
  } finally {
    running = 0;
  }
}
