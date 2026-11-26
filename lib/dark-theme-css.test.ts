// The dark theme is written twice in CSS: once for the reader who picked it
// (`:root[data-theme="dark"]`, set by public/js/theme.js) and once for the OS
// setting when they picked nothing (`@media (prefers-color-scheme: dark)` +
// `:root:not([data-theme="light"])`). CSS can't share one block between a
// selector and a media query, so this test is the single source: every
// dark rule must have its twin, with the same declarations.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const CSS_DIR = join(__dirname, "..", "assets", "css");

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? cssFiles(join(dir, e.name))
      : e.name.endsWith(".css")
        ? [join(dir, e.name)]
        : [],
  );
}

const PICKED = /:root\[data-theme="dark"\]/g;
const OS = /:root:not\(\[data-theme(?:="light")?\]\)/g;
const DARK_MQ = /\(prefers-color-scheme:\s*dark\)/;

/** Splits `(min-width: 640px) and (prefers-color-scheme: dark)` into "is it
 *  the dark query" and what is left of it, the context both twins share. */
function mediaParts(a: AtRule): { dark: boolean; rest: string } {
  const params = a.params.replace(/\s+/g, " ").trim();
  if (a.name !== "media" || !DARK_MQ.test(params))
    return { dark: false, rest: params };
  const rest = params
    .split(/\s+and\s+/)
    .filter((p) => !DARK_MQ.test(p))
    .join(" and ");
  return { dark: true, rest };
}

/** selector (theme part replaced by `:root`, inside its other at-rules) →
 *  its declarations, merged over every rule that sets them. */
type Side = Map<string, { decls: Map<string, string>; where: string }>;

function collect(file: string) {
  const picked: Side = new Map();
  const os: Side = new Map();
  const root = postcss.parse(readFileSync(file, "utf8"), { from: file });
  root.walkRules((rule: Rule) => {
    const ctx: string[] = [];
    let inDark = false;
    for (let p = rule.parent; p && p.type !== "root"; p = p.parent) {
      if (p.type !== "atrule") continue;
      const { dark, rest } = mediaParts(p as AtRule);
      if (dark) inDark = true;
      if (rest) ctx.unshift(`@${(p as AtRule).name} ${rest}`);
    }
    const where = `${file.slice(CSS_DIR.length + 1)}:${rule.source?.start?.line}`;
    for (const raw of rule.selectors) {
      const sel = raw.replace(/\s+/g, " ").trim();
      const pattern = inDark ? OS : PICKED;
      if (!sel.match(pattern)) continue;
      const side = inDark ? os : picked;
      const key = [...ctx, sel.replace(pattern, ":root")].join(" › ");
      const entry = side.get(key) ?? { decls: new Map(), where };
      for (const n of rule.nodes) {
        if (n.type !== "decl") continue;
        entry.decls.set(
          n.prop,
          n.value.replace(/\s+/g, " ").trim() +
            (n.important ? " !important" : ""),
        );
      }
      side.set(key, entry);
    }
  });
  return { picked, os };
}

/** Rules about the reader's choice itself, with no OS twin by design. */
const PICKED_ONLY = new Set([
  // The theme menu's icon shows what was picked; "auto" has its own icon.
  ":root .theme-icon-dark",
]);

function differences(a: Side, b: Side, missing: string): string[] {
  const out: string[] = [];
  for (const [key, { decls, where }] of a) {
    const twin = b.get(key);
    if (!twin && PICKED_ONLY.has(key)) continue;
    if (!twin) {
      out.push(`${where} ${key}: ${missing}`);
      continue;
    }
    for (const [prop, value] of decls) {
      if (twin.decls.get(prop) !== value)
        out.push(
          `${where} ${key}: ${prop} is "${value}" here, "${twin.decls.get(prop) ?? "unset"}" in its twin (${twin.where})`,
        );
    }
  }
  return out;
}

describe("dark theme CSS", () => {
  for (const file of cssFiles(CSS_DIR)) {
    const { picked, os } = collect(file);
    if (!picked.size && !os.size) continue;
    it(`${file.slice(CSS_DIR.length + 1)}: the picked and the OS dark rules match`, () => {
      expect([
        ...differences(picked, os, "no prefers-color-scheme twin"),
        ...differences(os, picked, 'no [data-theme="dark"] twin'),
      ]).toEqual([]);
    });
  }
});
