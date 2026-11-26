import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_EVENTS } from "./events";

const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "lib", "public/js"];
const SKIP = /(\.bundle\.js|\.worker\.js|\.min\.js|\.test\.ts|lib[/\\]events\.ts)$|[/\\]h[/\\]/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : files(p);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !SKIP.test(p) ? [p] : [];
  });
}

function namesInCode(): Map<string, string> {
  const seen = new Map<string, string>();
  for (const f of DIRS.flatMap((d) => files(join(ROOT, d)))) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/["'`]((?:gk|theme|i18n):[a-z][a-z0-9-]*)["'`]/g))
      if (!seen.has(m[1])) seen.set(m[1], f.slice(ROOT.length + 1));
  }
  return seen;
}

describe("site events registry (lib/events.ts)", () => {
  const used = namesInCode();
  it("lists every event the code uses", () => {
    const missing = [...used].filter(([n]) => !(n in SITE_EVENTS)).map(([n, f]) => `${n} (${f})`);
    expect(missing).toEqual([]);
  });
  it("lists no event the code has stopped using", () => {
    expect(Object.keys(SITE_EVENTS).filter((n) => !used.has(n))).toEqual([]);
  });
});
