// Writes the UI message bundles to public/i18n/<locale>.<hash>.js (see
// lib/i18n-assets.ts). Stale bundles from earlier builds are removed, so the
// export ships exactly the five the pages reference.

import fs from "node:fs";
import path from "node:path";
import { LOCALES } from "../lib/i18n";
import { bundleScript, i18nAssetName } from "../lib/i18n-assets";

const DIR = path.join(process.cwd(), "public", "i18n");
fs.mkdirSync(DIR, { recursive: true });
const keep = new Set<string>();
for (const locale of LOCALES) {
  const name = i18nAssetName(locale);
  keep.add(name);
  fs.writeFileSync(path.join(DIR, name), bundleScript(locale));
}
for (const f of fs.readdirSync(DIR)) if (!keep.has(f)) fs.rmSync(path.join(DIR, f));
console.log(`i18n: ${keep.size} bundles in public/i18n/`);
