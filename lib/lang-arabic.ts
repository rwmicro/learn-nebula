// Arabic letter shapes, for the `lettres-arabes` widget
// (public/js/lang/lettres-arabes.js). Pure, tested in lang-arabic.test.ts.
//
// The browser does the shaping: a letter followed by U+200D ZERO WIDTH JOINER
// is drawn in its initial form, preceded by one in its final form, between two
// in its medial form. This module only decides, for each letter of a word,
// which of the four positions it takes — which depends on whether its
// neighbours connect, and six letters (ا د ذ ر ز و) never connect to the
// letter after them.

export const ZWJ = "‍";

/** D: joins on both sides. R: joins only to the letter before it. U: never joins. */
export type Joining = "D" | "R" | "U";

export interface ArLetter {
  ch: string;
  /** Name and transliteration as in Arabe/Littéraire/…/Alphabet-Prononciation.md. */
  name: string;
  tr: string;
  join: Joining;
}

/** The 28 letters and the hamza, in the vault's table order. */
export const ALPHABET: ArLetter[] = [
  { ch: "ا", name: "alif", tr: "a / ā", join: "R" },
  { ch: "ب", name: "bāʾ", tr: "b", join: "D" },
  { ch: "ت", name: "tāʾ", tr: "t", join: "D" },
  { ch: "ث", name: "thāʾ", tr: "th", join: "D" },
  { ch: "ج", name: "jīm", tr: "j", join: "D" },
  { ch: "ح", name: "ḥāʾ", tr: "7 / ḥ", join: "D" },
  { ch: "خ", name: "khāʾ", tr: "5 / kh", join: "D" },
  { ch: "د", name: "dāl", tr: "d", join: "R" },
  { ch: "ذ", name: "dhāl", tr: "dh", join: "R" },
  { ch: "ر", name: "rāʾ", tr: "r", join: "R" },
  { ch: "ز", name: "zāy", tr: "z", join: "R" },
  { ch: "س", name: "sīn", tr: "s", join: "D" },
  { ch: "ش", name: "shīn", tr: "sh", join: "D" },
  { ch: "ص", name: "ṣād", tr: "S", join: "D" },
  { ch: "ض", name: "ḍād", tr: "D", join: "D" },
  { ch: "ط", name: "ṭāʾ", tr: "T", join: "D" },
  { ch: "ظ", name: "ẓāʾ", tr: "Z / DH", join: "D" },
  { ch: "ع", name: "ʿayn", tr: "3", join: "D" },
  { ch: "غ", name: "ghayn", tr: "gh", join: "D" },
  { ch: "ف", name: "fāʾ", tr: "f", join: "D" },
  { ch: "ق", name: "qāf", tr: "2 / q", join: "D" },
  { ch: "ك", name: "kāf", tr: "k", join: "D" },
  { ch: "ل", name: "lām", tr: "l", join: "D" },
  { ch: "م", name: "mīm", tr: "m", join: "D" },
  { ch: "ن", name: "nūn", tr: "n", join: "D" },
  { ch: "ه", name: "hāʾ", tr: "h", join: "D" },
  { ch: "و", name: "wāw", tr: "w / ū", join: "R" },
  { ch: "ي", name: "yāʾ", tr: "y / ī", join: "D" },
  { ch: "ء", name: "hamza", tr: "ʾ / 2", join: "U" },
];

/** Letters outside the 28 that a word may contain: hamza seats, tāʾ marbūṭa… */
export const VARIANTS: ArLetter[] = [
  { ch: "أ", name: "alif + hamza", tr: "ʾa", join: "R" },
  { ch: "إ", name: "alif + hamza dessous", tr: "ʾi", join: "R" },
  { ch: "آ", name: "alif madda", tr: "ʾā", join: "R" },
  { ch: "ؤ", name: "wāw + hamza", tr: "ʾ", join: "R" },
  { ch: "ئ", name: "yāʾ + hamza", tr: "ʾ", join: "D" },
  { ch: "ة", name: "tāʾ marbūṭa", tr: "a / at", join: "R" },
  { ch: "ى", name: "alif maqṣūra", tr: "ā", join: "R" },
];

/** The six letters that never join the next one. */
export const NON_CONNECTORS = new Set(["ا", "د", "ذ", "ر", "ز", "و"]);

const BY_CHAR = new Map([...ALPHABET, ...VARIANTS].map((l) => [l.ch, l]));

export function letterInfo(ch: string): ArLetter | undefined {
  return BY_CHAR.get(ch);
}

/** Short vowels, shadda, sukūn, tanwīn, dagger alif: drawn on the letter, transparent to joining. */
export const isMark = (c: string) => /[ً-ٰٟ]/.test(c);

export type Position = "isolée" | "initiale" | "médiane" | "finale";

export interface WordLetter {
  ch: string;
  /** Marks (harakat) carried by the letter. */
  marks: string;
  info?: ArLetter;
  position: Position;
  /** Does this letter connect to the next one? */
  joinsNext: boolean;
  /** Is it one of ا د ذ ر ز و (or a seat of them) and followed by a letter it cannot join? */
  breaks: boolean;
}

/** Splits a word into letters and gives each its contextual position. */
export function analyse(word: string): WordLetter[] {
  const letters: { ch: string; marks: string }[] = [];
  for (const c of word.normalize("NFC")) {
    if (isMark(c) && letters.length) letters[letters.length - 1].marks += c;
    else if (c === "ـ" || /\s/.test(c)) letters.push({ ch: c, marks: "" });
    else if (BY_CHAR.has(c)) letters.push({ ch: c, marks: "" });
  }
  const join = (i: number): Joining | null => {
    const l = letters[i];
    return l ? (BY_CHAR.get(l.ch)?.join ?? "U") : null;
  };
  return letters
    .map((l, i) => {
      const me = join(i)!;
      const prevJoins = i > 0 && join(i - 1) === "D" && me !== "U";
      const nextJoins = me === "D" && i + 1 < letters.length && (join(i + 1) === "D" || join(i + 1) === "R");
      const position: Position = prevJoins
        ? nextJoins
          ? "médiane"
          : "finale"
        : nextJoins
          ? "initiale"
          : "isolée";
      const nextIsLetter = i + 1 < letters.length && join(i + 1) !== "U";
      return {
        ch: l.ch,
        marks: l.marks,
        info: BY_CHAR.get(l.ch),
        position,
        joinsNext: nextJoins,
        breaks: me === "R" && nextIsLetter,
      };
    })
    .filter((l) => l.info);
}

/** The four shapes of a letter, as strings the browser will shape. */
export function forms(ch: string): Record<Position, string> {
  const j = BY_CHAR.get(ch)?.join ?? "U";
  return {
    isolée: ch,
    initiale: j === "D" ? ch + ZWJ : ch,
    médiane: j === "D" ? ZWJ + ch + ZWJ : j === "R" ? ZWJ + ch : ch,
    finale: j === "U" ? ch : ZWJ + ch,
  };
}

/** One letter drawn in a given position. */
export function shape(ch: string, p: Position): string {
  return forms(ch)[p];
}
