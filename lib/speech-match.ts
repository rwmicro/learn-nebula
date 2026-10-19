// "Le navigateur t'a compris": does what on-device speech recognition heard
// match the word of a pronunciation clip? Used by the coach in
// public/js/pronounce.js. Pure, tested in speech-match.test.ts.
//
// Not a pronunciation grade: recognisers are lenient and biased to frequent
// words, so a match only says the attempt was understandable as that word.

/** Lower-case, accents/diacritics (incl. Arabic harakat) and punctuation out,
 *  spaces collapsed. Letters and digits of every script are kept. */
export function normaliseSpoken(s: string): string {
  return String(s || "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[ـ]/g, "") // Arabic tatweel
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Levenshtein distance between two strings, by code point. */
export function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

/** Edits forgiven for an expected form of `len` letters (spaces aside):
 *  none for very short words (one letter is the whole word), then about one
 *  per five letters, at most three. */
export function tolerance(len: number): number {
  if (len <= 3) return 0;
  return Math.min(3, Math.max(1, Math.floor(len / 5)));
}

/** The forms a clip's label accepts: "bonjour / salut", "hola, buenas" or a
 *  parenthesised gloss ("Guten Tag (bonjour)") give several. */
export function expectedForms(label: string): string[] {
  const noGloss = String(label || "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  const out = new Set<string>();
  for (const part of noGloss.split(/[/|,;·]| ou | or /)) {
    const n = normaliseSpoken(part);
    if (n) out.add(n);
  }
  return [...out];
}

export interface SpeechMatch {
  ok: boolean;
  /** The recogniser's alternative closest to the expected word, as heard. */
  heard: string;
}

/** Compare the recogniser's alternatives with the expected label. A match is
 *  an alternative within tolerance of an expected form, spaces ignored (so
 *  "guten tag" = "gutentag"), or one that contains it as whole words
 *  ("ja guten tag"). Empty alternatives → not recognised, heard "". */
export function matchSpoken(alternatives: string[], label: string): SpeechMatch {
  const forms = expectedForms(label);
  const alts = alternatives.map((a) => String(a || "").trim()).filter(Boolean);
  if (!forms.length || !alts.length) return { ok: false, heard: alts[0] ?? "" };
  let best = { d: Infinity, heard: alts[0] };
  for (const alt of alts) {
    const n = normaliseSpoken(alt);
    for (const f of forms) {
      const flat = f.replace(/ /g, "");
      const d = editDistance(n.replace(/ /g, ""), flat);
      if (d <= tolerance([...flat].length)) return { ok: true, heard: alt };
      if (` ${n} `.includes(` ${f} `)) return { ok: true, heard: alt };
      if (d < best.d) best = { d, heard: alt };
    }
  }
  return { ok: false, heard: best.heard };
}

/**
 * Language folder of the vault → the BCP-47 tag the recogniser is asked for.
 * Keyed by the folder's slug (accents folded), which is how it appears both in
 * a note URL (/posts/…/languages-dialects/indonesien/…) and, lower-cased, in a
 * clip's /vault/ path. Darija, Kabyle, Hakka, Sambas, Tok Pisin, Uyghur have
 * no recogniser at all: absent, so the coach hides the check for them.
 */
const SPEECH_LANGS: Readonly<Record<string, string>> = {
  allemand: "de-DE",
  anglais: "en-US",
  arabe: "ar-SA",
  azeri: "az-AZ",
  espagnol: "es-ES",
  francais: "fr-FR",
  hindi: "hi-IN",
  indonesien: "id-ID",
  italien: "it-IT",
  japonais: "ja-JP",
  malais: "ms-MY",
  mandarin: "zh-CN",
  portugais: "pt-PT",
  roumain: "ro-RO",
  russe: "ru-RU",
  tamoul: "ta-IN",
  turc: "tr-TR",
};

const slugPart = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/** Recognition language for a clip, from the first path (clip URL, then page
 *  URL) that has a known language folder; null when none does. Only folders
 *  under "Languages - Dialects" count, so an "Anglais" elsewhere doesn't. */
export function speechLangFor(...paths: string[]): string | null {
  for (const p of paths) {
    let decoded = String(p || "");
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* keep as is */
    }
    // "/vault/Social Sciences/Languages - Dialects/Turc/…" and a note URL
    // keep the folder as its own segment; an Anki deck slug (/anki/<slug>/…)
    // runs them together ("…-languages-dialects-turc-vocabulaire").
    const flat = decoded.split("/").map(slugPart).join("/");
    const m = /(?:^|[/-])languages-dialects[/-]([a-z0-9]+)/.exec(flat);
    const lang = m && SPEECH_LANGS[m[1]];
    if (lang) return lang;
  }
  return null;
}
