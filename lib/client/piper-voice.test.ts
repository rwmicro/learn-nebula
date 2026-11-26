import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PIPER_VOICES } from "./piper-voice";

// scripts/copy-piper.mjs keeps only the eSpeak dictionaries of the languages
// that have a voice: a voice added here without its dictionary reads every
// line as a fraction of a second of noise (German, Hindi and Turkish did).
describe("natural voice dictionaries", () => {
  const src = readFileSync("scripts/copy-piper.mjs", "utf8");
  const kept = new Set(
    [
      ...(
        /const DICTS = new Set\(\[([^\]]*)\]\)/.exec(src)?.[1] ?? ""
      ).matchAll(/"([a-z]+)"/g),
    ].map((m) => m[1]),
  );
  // eSpeak's dictionary name for a voice's language, when it differs.
  const DICT: Record<string, string> = { zh: "cmn" };

  it.each(Object.keys(PIPER_VOICES))("keeps the dictionary of %s", (lang) => {
    expect(kept.has(DICT[lang] ?? lang)).toBe(true);
  });
});
