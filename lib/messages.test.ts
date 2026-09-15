import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Guards the documented footgun in CLAUDE.md: messages/{fr,en,es,zh,ar}.json
// must stay in key-sync. t() resolves at build against the default locale (fr),
// so a key present in fr but missing in another locale silently falls back and
// never gets translated. This test fails loudly if the bundles ever drift.
// `ar` had been left out of this list while shipping as a real locale (it is in
// LOCALES in lib/i18n.ts and in the language switcher), so it was the one
// bundle that could drift silently.

const LOCALES = ["fr", "en", "es", "zh", "ar"] as const;
const DEFAULT_LOCALE = "fr";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v)
      ? flattenKeys(v, key)
      : [key];
  });
}

function keysFor(locale: string): Set<string> {
  const raw = fs.readFileSync(
    path.join(process.cwd(), "messages", `${locale}.json`),
    "utf8",
  );
  return new Set(flattenKeys(JSON.parse(raw)));
}

describe("i18n message bundles stay in key-sync", () => {
  const reference = keysFor(DEFAULT_LOCALE);

  it(`${DEFAULT_LOCALE} (reference) has keys`, () => {
    expect(reference.size).toBeGreaterThan(0);
  });

  for (const locale of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
    it(`${locale} matches ${DEFAULT_LOCALE} exactly`, () => {
      const keys = keysFor(locale);
      const missing = [...reference].filter((k) => !keys.has(k)).sort();
      const extra = [...keys].filter((k) => !reference.has(k)).sort();
      // Empty arrays on pass; on failure the diff names the offending keys.
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });
  }
});
