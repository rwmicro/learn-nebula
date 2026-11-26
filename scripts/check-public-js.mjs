#!/usr/bin/env node
// Type-checks the vanilla note scripts (public/js) with tsconfig.public-js.json
// and holds the line: no file may have more type errors than the baseline
// records (scripts/public-js-type-baseline.json), and a file not in the
// baseline must have none. Fixing errors is welcome: run with --update to
// lower the baseline once a file improves.
//   node scripts/check-public-js.mjs            check (CI)
//   node scripts/check-public-js.mjs --update   rewrite the baseline
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "scripts/public-js-type-baseline.json");
const tsc = path.join(root, "node_modules/.bin/tsc");

const run = spawnSync(tsc, ["-p", "tsconfig.public-js.json", "--pretty", "false"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (run.error) throw run.error;
const lines = (run.stdout + run.stderr).split("\n");

const counts = {};
const byFile = {};
for (const line of lines) {
  const m = /^(.+?)\(\d+,\d+\): error TS\d+/.exec(line);
  if (!m) continue;
  const file = m[1].replaceAll("\\", "/");
  counts[file] = (counts[file] ?? 0) + 1;
  (byFile[file] ??= []).push(line);
}
// A config error (no file position) must not pass silently.
const configErrors = lines.filter((l) => /^error TS\d+/.test(l));
if (configErrors.length) {
  console.error(configErrors.join("\n"));
  process.exit(1);
}

const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const total = Object.values(counts).reduce((s, n) => s + n, 0);

if (process.argv.includes("--update")) {
  writeFileSync(baselinePath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Baseline written: ${total} errors in ${Object.keys(sorted).length} files.`);
  process.exit(0);
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
let failed = false;
for (const [file, n] of Object.entries(sorted)) {
  const allowed = baseline[file] ?? 0;
  if (n > allowed) {
    failed = true;
    console.error(`\n${file}: ${n} type errors, baseline allows ${allowed}.`);
    console.error(byFile[file].join("\n"));
  }
}
const improved = Object.entries(baseline).filter(([file, n]) => (counts[file] ?? 0) < n);
if (failed) {
  console.error("\nNew type errors in public/js. Fix them (JSDoc casts are fine), or, if the count only moved, see --update.");
  process.exit(1);
}
const base = Object.values(baseline).reduce((s, n) => s + n, 0);
console.log(`public/js type check: ${total} known errors (baseline ${base}), none new.`);
if (improved.length) {
  console.log(`${improved.length} file(s) improved: run \`node scripts/check-public-js.mjs --update\` to lower the baseline.`);
}
