// The phonemizer of the natural reading voice (public/js/piper-worker.js):
// piper_phonemize, eSpeak NG compiled to WebAssembly, served from our own
// origin into public/piper/. Its data package holds every eSpeak dictionary
// (18 MB, 8.5 of them Russian); the voices only need the site's languages,
// so this keeps the shared files and those dictionaries (≈ 3 MB) and writes
// the byte ranges it kept: the worker puts them back at their offsets, so
// the package's own file table (in the glue the worker bundles) still holds.
// Git-ignored; regenerated on predev/build.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// eSpeak's dictionaries for the languages lib/piper-voice.ts has a voice for.
const DICTS = new Set(["fr", "en", "es", "ar", "cmn"]);
const DEST = path.join(process.cwd(), "public", "piper");

let dir;
try {
  const req = createRequire(import.meta.url);
  dir = path.join(
    path.dirname(req.resolve("@diffusionstudio/piper-wasm/package.json")),
    "build",
  );
} catch {
  console.warn("copy-piper: @diffusionstudio/piper-wasm not found — skipping.");
  process.exit(0);
}

const glue = fs.readFileSync(path.join(dir, "piper_phonemize.js"), "utf8");
const meta = glue.match(
  /loadPackage\((\{"files":.*?"remote_package_size":\d+\})\)/,
);
if (!meta) {
  console.warn(
    "copy-piper: no data package table in piper_phonemize.js — skipping.",
  );
  process.exit(0);
}
const { files, remote_package_size: size } = JSON.parse(meta[1]);
const data = fs.readFileSync(path.join(dir, "piper_phonemize.data"));
if (data.length !== size)
  throw new Error(
    `copy-piper: data is ${data.length} bytes, table says ${size}`,
  );

const ranges = [];
for (const f of files) {
  const dict = f.filename.match(/\/espeak-ng-data\/([a-z]+)_dict$/);
  if (dict && !DICTS.has(dict[1])) continue;
  const last = ranges.at(-1);
  if (last && last[1] === f.start) last[1] = f.end;
  else ranges.push([f.start, f.end]);
}
const kept = Buffer.concat(ranges.map(([a, b]) => data.subarray(a, b)));

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
fs.copyFileSync(
  path.join(dir, "piper_phonemize.wasm"),
  path.join(DEST, "piper_phonemize.wasm"),
);
fs.writeFileSync(path.join(DEST, "piper_phonemize.data"), kept);
fs.writeFileSync(
  path.join(DEST, "piper_phonemize.json"),
  JSON.stringify({ size, ranges }),
);
console.log(
  `copy-piper: phonemizer -> public/piper/ (${(kept.length / 1e6).toFixed(1)} of ${(size / 1e6).toFixed(1)} MB of data kept)`,
);
