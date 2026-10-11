// One word, several scripts — for the `ecritures` widget
// (public/js/lang/ecritures.js). Pure, tested in lang-scripts.test.ts.
//
// Uyghur: the Latin script (ULY) is the pivot. Every input is first read as a
// stream of ULY letters, then written out in the Arabic script (UEY) or the
// Cyrillic one (USY). Letter table: Ouighour/01-Phonologie/01-Alphabet.md;
// the Cyrillic column is the standard Soviet/Kazakh alphabet (not in the vault).
// Kabyle: Latin (the vault's Kabyle/01-Phonologie table) ↔ Neo-Tifinagh.

// ------------------------------------------------------------------ Uyghur

export type UyScript = "uly" | "uey" | "usy";

/** ULY letter → [UEY, USY], in the vault's table order. */
export const UY_LETTERS: [string, string, string][] = [
  ["a", "ا", "а"],
  ["e", "ە", "ә"],
  ["ë", "ې", "е"],
  ["i", "ى", "и"],
  ["o", "و", "о"],
  ["u", "ۇ", "у"],
  ["ö", "ۆ", "ө"],
  ["ü", "ۈ", "ү"],
  ["b", "ب", "б"],
  ["p", "پ", "п"],
  ["t", "ت", "т"],
  ["d", "د", "д"],
  ["j", "ج", "җ"],
  ["ch", "چ", "ч"],
  ["x", "خ", "х"],
  ["gh", "غ", "ғ"],
  ["q", "ق", "қ"],
  ["k", "ك", "к"],
  ["g", "گ", "г"],
  ["ng", "ڭ", "ң"],
  ["l", "ل", "л"],
  ["m", "م", "м"],
  ["n", "ن", "н"],
  ["r", "ر", "р"],
  ["z", "ز", "з"],
  ["zh", "ژ", "ж"],
  ["s", "س", "с"],
  ["sh", "ش", "ш"],
  ["f", "ف", "ф"],
  ["h", "ھ", "һ"],
  ["w", "ۋ", "в"],
  ["y", "ي", "й"],
];

export const UY_VOWELS = new Set(["a", "e", "ë", "i", "o", "u", "ö", "ü"]);
/** The hamza-on-yeh that carries a vowel at the start of a syllable in UEY. */
export const UEY_HAMZA = "ئ";

const ULY_SET = new Set(UY_LETTERS.map((l) => l[0]));
const FROM_UEY = new Map(UY_LETTERS.map((l) => [l[1], l[0]]));
const FROM_USY = new Map(UY_LETTERS.map((l) => [l[2], l[0]]));
const TO_UEY = new Map(UY_LETTERS.map((l) => [l[0], l[1]]));
const TO_USY = new Map(UY_LETTERS.map((l) => [l[0], l[2]]));

/** A letter (ULY spelling), a syllable break (ULY ', UEY mid-word ئ), or any other character. */
export type UyToken = { k: "l"; v: string } | { k: "sep" } | { k: "x"; v: string };

/**
 * Reads ULY. The vault's notes also write ə as ä (öylär, räxmät) and ë as é
 * (sériq, yéshil), the older Turkological habit: both are accepted.
 */
function readUly(text: string): UyToken[] {
  const s = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "e")
    .replace(/é/g, "ë")
    .replace(/[’ʼ`]/g, "'");
  const out: UyToken[] = [];
  for (let i = 0; i < s.length; ) {
    const two = s.slice(i, i + 2);
    if (["ch", "gh", "ng", "sh", "zh"].includes(two)) {
      out.push({ k: "l", v: two });
      i += 2;
    } else if (ULY_SET.has(s[i])) {
      out.push({ k: "l", v: s[i] });
      i += 1;
    } else if (s[i] === "'") {
      out.push({ k: "sep" });
      i += 1;
    } else {
      out.push({ k: "x", v: s[i] });
      i += 1;
    }
  }
  return out;
}

function readUey(text: string): UyToken[] {
  const s = text.normalize("NFC").replace(/ـ/g, ""); // tatweel
  const out: UyToken[] = [];
  const PUNCT: Record<string, string> = { "؟": "?", "،": ",", "؛": ";" };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === UEY_HAMZA) {
      const prev = out[out.length - 1];
      // Word-initial: only carries the vowel. Mid-word: a syllable break.
      if (prev && prev.k === "l") out.push({ k: "sep" });
    } else if (FROM_UEY.has(c)) out.push({ k: "l", v: FROM_UEY.get(c)! });
    else out.push({ k: "x", v: PUNCT[c] ?? c });
  }
  return out;
}

function readUsy(text: string): UyToken[] {
  const s = text.normalize("NFC").toLowerCase();
  const out: UyToken[] = [];
  for (const c of s) {
    if (c === "я") out.push({ k: "l", v: "y" }, { k: "l", v: "a" });
    else if (c === "ю") out.push({ k: "l", v: "y" }, { k: "l", v: "u" });
    else if (FROM_USY.has(c)) out.push({ k: "l", v: FROM_USY.get(c)! });
    else out.push({ k: "x", v: c });
  }
  return out;
}

export function uyRead(text: string, from: UyScript): UyToken[] {
  return from === "uly" ? readUly(text) : from === "uey" ? readUey(text) : readUsy(text);
}

/** Pairs ULY writes with an apostrophe so they are not read as a digraph. */
const AMBIGUOUS = new Set(["n|g", "s|h", "z|h", "g|h", "c|h"]);

export function uyWrite(tokens: UyToken[], to: UyScript): string {
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    if (t.k === "x") {
      out += to === "uey" ? ({ "?": "؟", ",": "،", ";": "؛" } as Record<string, string>)[t.v] ?? t.v : t.v;
      continue;
    }
    if (t.k === "sep") {
      if (to === "uly") out += "'";
      continue;
    }
    const v = t.v;
    if (to === "uly") {
      if (prev && prev.k === "l" && AMBIGUOUS.has(prev.v + "|" + v)) out += "'";
      out += v;
    } else if (to === "uey") {
      const syllableStart = !prev || prev.k !== "l" || UY_VOWELS.has(prev.v);
      if (UY_VOWELS.has(v) && syllableStart) out += UEY_HAMZA;
      out += TO_UEY.get(v);
    } else {
      const next = tokens[i + 1];
      if (v === "y" && next?.k === "l" && (next.v === "a" || next.v === "u")) {
        out += next.v === "a" ? "я" : "ю";
        i++;
      } else out += TO_USY.get(v);
    }
  }
  return out;
}

export function uyConvert(text: string, from: UyScript, to: UyScript): string {
  return uyWrite(uyRead(text, from), to);
}

/** The ULY letters a text uses, in alphabet order, with their three forms. */
export function uyLettersUsed(text: string, from: UyScript): { uly: string; uey: string; usy: string; hamza: boolean }[] {
  const toks = uyRead(text, from);
  const used = new Set(toks.filter((t): t is { k: "l"; v: string } => t.k === "l").map((t) => t.v));
  let hamza = false;
  toks.forEach((t, i) => {
    const p = toks[i - 1];
    if (t.k === "l" && UY_VOWELS.has(t.v) && (!p || p.k !== "l" || UY_VOWELS.has(p.v))) hamza = true;
  });
  return UY_LETTERS.filter((l) => used.has(l[0])).map((l) => ({ uly: l[0], uey: l[1], usy: l[2], hamza }));
}

// ------------------------------------------------------------------ Kabyle

/** Latin → Neo-Tifinagh (IRCAM / Kabyle usage). γ and ɣ are the same letter. */
export const KAB_LETTERS: [string, string][] = [
  ["a", "ⴰ"],
  ["b", "ⴱ"],
  ["c", "ⵛ"],
  ["č", "ⵞ"],
  ["d", "ⴷ"],
  ["ḍ", "ⴹ"],
  ["e", "ⴻ"],
  ["ɛ", "ⵄ"],
  ["f", "ⴼ"],
  ["g", "ⴳ"],
  ["ǧ", "ⴵ"],
  ["γ", "ⵖ"],
  ["h", "ⵀ"],
  ["ḥ", "ⵃ"],
  ["i", "ⵉ"],
  ["j", "ⵊ"],
  ["k", "ⴽ"],
  ["l", "ⵍ"],
  ["m", "ⵎ"],
  ["n", "ⵏ"],
  ["q", "ⵇ"],
  ["r", "ⵔ"],
  ["ṛ", "ⵕ"],
  ["s", "ⵙ"],
  ["ṣ", "ⵚ"],
  ["t", "ⵜ"],
  ["ṭ", "ⵟ"],
  ["u", "ⵓ"],
  ["w", "ⵡ"],
  ["x", "ⵅ"],
  ["y", "ⵢ"],
  ["z", "ⵣ"],
  ["ẓ", "ⵥ"],
];

const KAB_TO_TIF = new Map(KAB_LETTERS);
const TIF_TO_KAB = new Map(KAB_LETTERS.map(([l, t]) => [t, l]));

function kabNorm(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/ɣ/g, "γ");
}

export function kabToTifinagh(text: string): string {
  return [...kabNorm(text)].map((c) => KAB_TO_TIF.get(c) ?? c).join("");
}

export function kabToLatin(text: string): string {
  return [...text.normalize("NFC")].map((c) => TIF_TO_KAB.get(c) ?? c).join("");
}

/** True when the text is mostly Tifinagh (U+2D30–U+2D7F). */
export function isTifinagh(text: string): boolean {
  return /[ⴰ-⵿]/.test(text);
}

export function kabLettersUsed(text: string): { latin: string; tif: string }[] {
  const latin = isTifinagh(text) ? kabToLatin(text) : kabNorm(text);
  const used = new Set([...latin]);
  return KAB_LETTERS.filter(([l]) => used.has(l)).map(([l, t]) => ({ latin: l, tif: t }));
}
