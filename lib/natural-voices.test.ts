import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KOKORO_VOICES,
  MMS_VOICES,
  kokoroIds,
  kokoroKey,
  kokoroPhonemes,
  mmsIds,
  mmsKey,
  parseMmsTokens,
} from "./natural-voices";
import { PIPER_VOICES } from "./piper-voice";

describe("voice keys", () => {
  it("names a Kokoro voice with its eSpeak voice", () => {
    expect(kokoroKey("fr")).toBe("kokoro:ff_siwis:fr");
    expect(kokoroKey("pt")).toBe("kokoro:pf_dora:pt-br");
    expect(kokoroKey("jv")).toBeNull();
  });
  it("names an MMS model by its folder", () => {
    expect(mmsKey("jv")).toBe("mms:jav");
    expect(mmsKey("ug")).toBe("mms:uig-script_arabic");
    expect(mmsKey("fr")).toBeNull();
  });
  it("keeps MMS for the languages Piper does not read", () => {
    for (const l of Object.keys(MMS_VOICES))
      expect(PIPER_VOICES[l]).toBeUndefined();
  });
  it("only uses keys the worker accepts", () => {
    for (const l of Object.keys(KOKORO_VOICES))
      expect(kokoroKey(l)).toMatch(/^kokoro:[a-z]{2}_[a-z]+:[a-z-]+$/);
    for (const l of Object.keys(MMS_VOICES))
      expect(mmsKey(l)).toMatch(/^mms:[a-z_-]+$/);
  });
});

// scripts/copy-piper.mjs keeps only some eSpeak dictionaries: Kokoro's
// languages need theirs too.
describe("Kokoro dictionaries", () => {
  const src = readFileSync("scripts/copy-piper.mjs", "utf8");
  const kept = new Set(
    [
      ...(
        /const DICTS = new Set\(\[([^\]]*)\]\)/.exec(src)?.[1] ?? ""
      ).matchAll(/"([a-z]+)"/g),
    ].map((m) => m[1]),
  );
  it.each(Object.values(KOKORO_VOICES).map((v) => v.espeak))(
    "keeps the dictionary of %s",
    (espeak) => {
      expect(kept.has(espeak.split("-")[0])).toBe(true);
    },
  );
});

describe("kokoroPhonemes", () => {
  it("writes English the way the model learnt it", () => {
    expect(kokoroPhonemes("həlˈoʊ ðˈɛɹ, tədˈeɪ", "en-us")).toBe(
      "həlˈO ðˈɛɹ, tədˈA",
    );
    expect(kokoroPhonemes("dʒˈʌdʒ tʃˈɜːtʃ", "en-us")).toBe("ʤˈʌʤ ʧˈɜɹʧ");
    expect(kokoroPhonemes("ɑːɹ juː", "en-us")).toBe("ɑɹ ju");
  });
  it("keeps length and r elsewhere, joins affricates", () => {
    expect(kokoroPhonemes("ˈɔdʒːɪ", "it")).toBe("ˈɔʤːɪ");
    expect(kokoroPhonemes("pˈittsa r", "it")).toBe("pˈitʦa r");
    expect(kokoroPhonemes("bɔ̃ʒˈuʁ", "fr")).toBe("bɔ̃ʒˈuʁ");
  });
});

describe("kokoroIds", () => {
  const vocab = { a: 1, b: 2, " ": 3 };
  it("drops unknown symbols", () => {
    expect(kokoroIds("a?b", vocab)).toEqual([[1, 2]]);
  });
  it("cuts long runs at a space", () => {
    const runs = kokoroIds("aaaa bbbb aaaa", vocab, 8);
    expect(runs.every((r) => r.length <= 8)).toBe(true);
    expect(runs.flat()).toHaveLength(14);
    expect(runs[0]).toEqual([1, 1, 1, 1, 3]);
  });
  it("cuts anywhere without a space", () => {
    expect(kokoroIds("aaaaaaaaaa", vocab, 4).map((r) => r.length)).toEqual([
      4, 4, 2,
    ]);
  });
  it("gives nothing for nothing", () => {
    expect(kokoroIds("???", vocab)).toEqual([]);
  });
});

describe("MMS", () => {
  const tokens = parseMmsTokens("a 0\nA 0\n| 1\nn 2\ng 3\n- 4\n  5\n̍ 6\n");
  it("reads the token table, the space included", () => {
    expect(tokens.get("a")).toBe(0);
    expect(tokens.get(" ")).toBe(5);
    expect(tokens.get("̍")).toBe(6);
  });
  it("puts a blank around every symbol", () => {
    expect(mmsIds("Nga", tokens)).toEqual([0, 2, 0, 3, 0, 0, 0]);
  });
  it("turns punctuation into one pause and drops digits", () => {
    expect(mmsIds("an, 12 ga", tokens)).toEqual([
      0, 0, 0, 2, 0, 5, 0, 3, 0, 0, 0,
    ]);
  });
  it("spells an accented letter with its combining mark", () => {
    expect(mmsIds("a̍n", tokens)).toEqual([0, 0, 0, 6, 0, 2, 0]);
  });
  it("refuses a text in another script", () => {
    expect(mmsIds("客家話 a", tokens)).toBeNull();
    expect(mmsIds("123", tokens)).toBeNull();
  });
});
