// Copy onnxruntime-web's WebGPU runtime (the "asyncify" .mjs glue + its .wasm,
// what ort.webgpu loads) into public/ort/ so the on-device assistant model
// (public/js/local-llm-worker.js) loads it from our own origin: Transformers.js
// would otherwise fetch it from a CDN, which the CSP doesn't allow for
// scripts. Git-ignored; regenerated on predev/build.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const FILES = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];
const DEST = path.join(process.cwd(), "public", "ort");

let dist;
try {
  // onnxruntime-web is Transformers.js's own dependency, resolved from there.
  const req = createRequire(createRequire(import.meta.url).resolve("@huggingface/transformers"));
  // (its main entry lives in dist/, next to the runtime files)
  dist = path.dirname(req.resolve("onnxruntime-web"));
} catch {
  console.warn("copy-ort: onnxruntime-web not found — skipping.");
  process.exit(0);
}
fs.mkdirSync(DEST, { recursive: true });
let bytes = 0;
for (const f of FILES) {
  fs.copyFileSync(path.join(dist, f), path.join(DEST, f));
  bytes += fs.statSync(path.join(DEST, f)).size;
}
console.log(`copy-ort: ${FILES.length} files -> public/ort/ (${(bytes / 1e6).toFixed(1)} MB)`);
