// Turkish and Azerbaijani nominal suffix chains, for the `agglutination`
// widget (public/js/lang/agglutination.js). Pure, tested in
// lang-agglutination.test.ts.
//
// Suffixes are written with archiphonemes, as grammars do: A = a/e (two-way
// harmony; a/ə in Azerbaijani), I = ı/i/u/ü (four-way), D = d/t (Turkish
// voicing assimilation), and a buffer letter in parentheses that appears only
// after a vowel: -(y)I, -(n)In, -(s)I. After a third-person possessive or -ki
// the case suffixes take the "pronominal n": ev-i-n-de, ev-de-ki-n-i.

export type Lang = "tr" | "az";
export type SuffixId =
  | "pl"
  | "p1s"
  | "p2s"
  | "p3s"
  | "p1p"
  | "p2p"
  | "p3p"
  | "acc"
  | "dat"
  | "loc"
  | "abl"
  | "gen"
  | "ki";

export interface SuffixDef {
  id: SuffixId;
  /** Archiphonemic form, as in a grammar: -lAr, -(y)I… */
  form: Record<Lang, string>;
  nom: string;
  sens: string;
  group: "pluriel" | "possessif" | "cas" | "ki";
}

export const SUFFIXES: SuffixDef[] = [
  { id: "pl", form: { tr: "-lAr", az: "-lAr" }, nom: "pluriel", sens: "plusieurs", group: "pluriel" },
  { id: "p1s", form: { tr: "-(I)m", az: "-(I)m" }, nom: "possessif 1ʳᵉ sg.", sens: "mon, ma, mes", group: "possessif" },
  { id: "p2s", form: { tr: "-(I)n", az: "-(I)n" }, nom: "possessif 2ᵉ sg.", sens: "ton, ta, tes", group: "possessif" },
  { id: "p3s", form: { tr: "-(s)I", az: "-(s)I" }, nom: "possessif 3ᵉ sg.", sens: "son, sa, ses", group: "possessif" },
  { id: "p1p", form: { tr: "-(I)mIz", az: "-(I)mIz" }, nom: "possessif 1ʳᵉ pl.", sens: "notre, nos", group: "possessif" },
  { id: "p2p", form: { tr: "-(I)nIz", az: "-(I)nIz" }, nom: "possessif 2ᵉ pl.", sens: "votre, vos", group: "possessif" },
  { id: "p3p", form: { tr: "-lArI", az: "-lArI" }, nom: "possessif 3ᵉ pl.", sens: "leur, leurs", group: "possessif" },
  { id: "acc", form: { tr: "-(y)I", az: "-(n)I" }, nom: "accusatif", sens: "objet direct défini", group: "cas" },
  { id: "dat", form: { tr: "-(y)A", az: "-(y)A" }, nom: "datif", sens: "vers, à", group: "cas" },
  { id: "loc", form: { tr: "-DA", az: "-dA" }, nom: "locatif", sens: "dans, à, sur", group: "cas" },
  { id: "abl", form: { tr: "-DAn", az: "-dAn" }, nom: "ablatif", sens: "de, depuis", group: "cas" },
  { id: "gen", form: { tr: "-(n)In", az: "-(n)In" }, nom: "génitif", sens: "de (possession)", group: "cas" },
  { id: "ki", form: { tr: "-ki", az: "-kI" }, nom: "relateur", sens: "celui / ce qui est…", group: "ki" },
];

const BACK: Record<Lang, string> = { tr: "aıou", az: "aıou" };
const FRONT: Record<Lang, string> = { tr: "eiöü", az: "eəiöü" };
const VOICELESS = "fstkçşhp";

export function lower(s: string, lang: Lang): string {
  return s.trim().toLocaleLowerCase(lang === "tr" ? "tr" : "az");
}

const isVowel = (c: string, lang: Lang) => !!c && (BACK[lang] + FRONT[lang]).includes(c);

export function lastVowel(w: string, lang: Lang): string | null {
  for (let i = w.length - 1; i >= 0; i--) if (isVowel(w[i], lang)) return w[i];
  return null;
}

/** Two-way harmony: a after a back vowel, e (Azerbaijani ə) after a front one. */
export function harmA(w: string, lang: Lang): string {
  const v = lastVowel(w, lang);
  if (v && BACK[lang].includes(v)) return "a";
  return lang === "tr" ? "e" : "ə";
}

/** Four-way harmony: ı/i/u/ü by backness and rounding of the last vowel. */
export function harmI(w: string, lang: Lang): string {
  const v = lastVowel(w, lang) ?? "e";
  if ("aı".includes(v)) return "ı";
  if ("ou".includes(v)) return "u";
  if ("öü".includes(v)) return "ü";
  return "i"; // e, i, ə
}

export interface RootInfo {
  root: string;
  gloss: string;
  /** French gender of the gloss, for the French rendering. */
  g: "m" | "f";
  /** French plural of the gloss when it is not gloss + s. */
  pl?: string;
  /** Final consonant softens before a vowel (kitap → kitabı). */
  soft?: boolean;
}

/** Roots offered in the widget. Turkish ones are basic words (the vault's
 *  Turc/03-Grammaire/Bases.md has ev; the rest are elementary vocabulary);
 *  the Azerbaijani ones are from Azéri/03-Grammaire and 04-Vocabulaire. */
export const ROOTS: Record<Lang, RootInfo[]> = {
  tr: [
    { root: "ev", gloss: "maison", g: "f" },
    { root: "kitap", gloss: "livre", g: "m", soft: true },
    { root: "okul", gloss: "école", g: "f" },
    { root: "sokak", gloss: "rue", g: "f", soft: true },
    { root: "araba", gloss: "voiture", g: "f" },
    { root: "göz", gloss: "œil", g: "m", pl: "yeux" },
    { root: "el", gloss: "main", g: "f" },
    { root: "yol", gloss: "route", g: "f" },
    { root: "arkadaş", gloss: "ami", g: "m" },
    { root: "kapı", gloss: "porte", g: "f" },
    { root: "çocuk", gloss: "enfant", g: "m", soft: true },
  ],
  az: [
    { root: "ev", gloss: "maison", g: "f" },
    { root: "kitab", gloss: "livre", g: "m" },
    { root: "məktəb", gloss: "école", g: "f" },
    { root: "küçə", gloss: "rue", g: "f" },
    { root: "maşın", gloss: "voiture", g: "f" },
    { root: "göz", gloss: "œil", g: "m", pl: "yeux" },
    { root: "əl", gloss: "main", g: "f" },
    { root: "yol", gloss: "route", g: "f" },
    { root: "dost", gloss: "ami", g: "m" },
    { root: "qapı", gloss: "porte", g: "f" },
    { root: "uşaq", gloss: "enfant", g: "m", soft: true },
    { root: "otaq", gloss: "pièce", g: "f", soft: true },
    { root: "çörək", gloss: "pain", g: "m", soft: true },
  ],
};

export interface Step {
  id: SuffixId;
  before: string;
  /** Text added (after any change to the end of `before`). */
  add: string;
  after: string;
  /** Rules applied, in French. */
  rules: string[];
}

export interface Result {
  word: string;
  steps: Step[];
  /** Parts for display: root then each suffix as it surfaces. */
  parts: { text: string; id: SuffixId | "root" }[];
}

const POSS: SuffixId[] = ["p1s", "p2s", "p3s", "p1p", "p2p", "p3p"];
const CASES: SuffixId[] = ["acc", "dat", "loc", "abl", "gen"];

/** Which suffixes may follow `chain` (slot order: pl, poss, case, -ki, pl, case). */
export function allowed(chain: SuffixId[], lang: Lang): SuffixId[] {
  const kiAt = chain.indexOf("ki");
  if (kiAt >= 0) {
    const after = chain.slice(kiAt + 1);
    if (after.some((s) => CASES.includes(s))) return [];
    if (lang === "az") return after.length ? [] : ["pl"];
    return after.includes("pl") ? CASES : ["pl", ...CASES];
  }
  const last = chain[chain.length - 1];
  if (!last) return ["pl", ...POSS, ...CASES];
  if (last === "pl") return [...POSS, ...CASES];
  if (POSS.includes(last)) return CASES;
  if (last === "loc" || (lang === "tr" && last === "gen")) return ["ki"];
  return [];
}

/** Does the root's last consonant soften before a vowel? */
function softened(w: string, lang: Lang): string | null {
  const c = w[w.length - 1];
  const prev = w[w.length - 2];
  if (lang === "tr") {
    if (c === "p") return "b";
    if (c === "ç") return "c";
    if (c === "t") return "d";
    if (c === "k") return prev === "n" ? "g" : "ğ";
  } else {
    if (c === "q") return "ğ";
    if (c === "k") return "y";
  }
  return null;
}

/** Default softening for a typed root: polysyllabic, ending in p, ç, k (Turkish) or q, k (Azerbaijani). */
export function guessSoft(root: string, lang: Lang): boolean {
  const vowels = [...root].filter((c) => isVowel(c, lang)).length;
  const c = root[root.length - 1];
  return vowels > 1 && (lang === "tr" ? "pçk".includes(c) : "qk".includes(c));
}

export function build(rootIn: string, chain: SuffixId[], lang: Lang, opts: { soft?: boolean } = {}): Result {
  const root = lower(rootIn, lang);
  const info = ROOTS[lang].find((r) => r.root === root);
  const soft = opts.soft ?? info?.soft ?? guessSoft(root, lang);
  let w = root;
  const steps: Step[] = [];
  const parts: Result["parts"] = [{ text: root, id: "root" }];
  let pronominal = false; // after a 3rd-person possessive or -ki
  let hasPl = false;

  for (const id of chain) {
    const before = w;
    const rules: string[] = [];
    const endsV = isVowel(w[w.length - 1], lang);
    const A = () => harmA(w, lang);
    const I = () => harmI(w, lang);
    let add = "";
    let vowelInitial = false;
    const harmNoteA = () => rules.push(`harmonie à deux voies : ${A()} (dernière voyelle ${lastVowel(w, lang)})`);
    const harmNoteI = () => rules.push(`harmonie à quatre voies : ${I()} (dernière voyelle ${lastVowel(w, lang)})`);

    switch (id) {
      case "pl":
        add = "l" + A() + "r";
        harmNoteA();
        hasPl = true;
        // After -ki (evdeki-ler), the next case is regular again: evdekilere.
        pronominal = false;
        break;
      case "p1s":
      case "p2s":
      case "p1p":
      case "p2p": {
        const core = { p1s: "m", p2s: "n", p1p: "m" + I() + "z", p2p: "n" + I() + "z" }[id];
        if (endsV) {
          add = core;
          rules.push("après une voyelle : pas de voyelle de liaison");
        } else {
          add = I() + core;
          vowelInitial = true;
        }
        harmNoteI();
        break;
      }
      case "p3s":
        if (endsV) {
          add = "s" + I();
          rules.push("après une voyelle : consonne tampon s");
        } else {
          add = I();
          vowelInitial = true;
        }
        harmNoteI();
        pronominal = true;
        break;
      case "p3p":
        if (hasPl) {
          add = I();
          vowelInitial = true;
          rules.push("déjà au pluriel : -lArI se réduit à -I (ambigu : « leur » ou « ses »)");
          harmNoteI();
        } else {
          const a = A();
          add = "l" + a + "r" + (a === "a" ? "ı" : "i");
          harmNoteA();
          rules.push("puis harmonie à quatre voies sur le a/e du suffixe");
        }
        pronominal = true;
        break;
      case "acc":
        if (pronominal) {
          add = "n" + I();
          rules.push("après un possessif de 3ᵉ personne ou -ki : n pronominal");
        } else if (endsV) {
          add = (lang === "tr" ? "y" : "n") + I();
          rules.push(lang === "tr" ? "après une voyelle : consonne tampon y" : "après une voyelle : consonne tampon n (azéri)");
        } else {
          add = I();
          vowelInitial = true;
        }
        harmNoteI();
        break;
      case "dat":
        if (pronominal) {
          add = "n" + A();
          rules.push("après un possessif de 3ᵉ personne ou -ki : n pronominal");
        } else if (endsV) {
          add = "y" + A();
          rules.push("après une voyelle : consonne tampon y");
        } else {
          add = A();
          vowelInitial = true;
        }
        harmNoteA();
        break;
      case "loc":
      case "abl": {
        const tail = id === "abl" ? "n" : "";
        if (pronominal) {
          add = "nd" + A() + tail;
          rules.push("après un possessif de 3ᵉ personne ou -ki : n pronominal");
        } else {
          const last = w[w.length - 1];
          const t = lang === "tr" && VOICELESS.includes(last);
          add = (t ? "t" : "d") + A() + tail;
          if (t) rules.push(`assimilation : d → t après la consonne sourde ${last}`);
          else if (lang === "az" && VOICELESS.includes(last))
            rules.push("en azéri, pas d'assimilation : le d reste après une consonne sourde");
        }
        harmNoteA();
        break;
      }
      case "gen":
        if (pronominal || endsV) {
          add = "n" + I() + "n";
          rules.push(pronominal ? "après un possessif de 3ᵉ personne ou -ki : n pronominal" : "après une voyelle : consonne tampon n");
        } else {
          add = I() + "n";
          vowelInitial = true;
        }
        harmNoteI();
        break;
      case "ki":
        if (lang === "tr") {
          add = "ki";
          rules.push("-ki ne suit pas l'harmonie (sauf quelques mots figés : bugünkü, dünkü)");
        } else {
          add = A() === "a" ? "kı" : "ki";
          rules.push(`harmonie : -${add} après -d${A()}`);
        }
        pronominal = true;
        hasPl = false;
        break;
    }
    // Softening of the root's last consonant before a vowel-initial suffix.
    if (vowelInitial && steps.length === 0 && soft) {
      const s = softened(w, lang);
      if (s) {
        rules.unshift(`adoucissement : ${w[w.length - 1]} final → ${s} devant voyelle`);
        w = w.slice(0, -1) + s;
        parts[0] = { text: w, id: "root" };
      }
    }
    w += add;
    parts.push({ text: add, id });
    steps.push({ id, before, add, after: w, rules });
  }
  return { word: w, steps, parts };
}

// ------------------------------------------------------------- French gloss

const POSS_FR: Record<string, [string, string, string]> = {
  // [masc. sg / fem. sg before vowel, fem. sg, plural]
  p1s: ["mon", "ma", "mes"],
  p2s: ["ton", "ta", "tes"],
  p3s: ["son", "sa", "ses"],
  p1p: ["notre", "notre", "nos"],
  p2p: ["votre", "votre", "vos"],
  p3p: ["leur", "leur", "leurs"],
};

const startsV = (s: string) => /^[aeiouyéèêœh]/i.test(s);

function plural(info: RootInfo): string {
  if (info.pl) return info.pl;
  return /[sxz]$/.test(info.gloss) ? info.gloss : info.gloss + "s";
}

/** "de" + noun phrase, with du/des contractions. */
function de(np: string): string {
  if (np.startsWith("le ")) return "du " + np.slice(3);
  if (np.startsWith("les ")) return "des " + np.slice(4);
  return "de " + np;
}

/**
 * French rendering of a chain built on a known root, e.g. ev-ler-im-de-ki
 * → « ce qui est dans mes maisons ». Null for a typed root (no gloss).
 */
export function frenchGloss(rootIn: string, chain: SuffixId[], lang: Lang): string | null {
  const info = ROOTS[lang].find((r) => r.root === lower(rootIn, lang));
  if (!info) return null;
  const kiAt = chain.indexOf("ki");
  const head = kiAt >= 0 ? chain.slice(0, kiAt + 1) : chain;
  const tail = kiAt >= 0 ? chain.slice(kiAt + 1) : [];

  const pl = head.includes("pl");
  const poss = head.find((s) => POSS.includes(s));
  const cas = head.find((s) => CASES.includes(s));
  const noun = pl ? plural(info) : info.gloss;
  let np: string;
  if (poss) {
    const [m, f, p] = POSS_FR[poss];
    np = (pl ? p : info.g === "m" || startsV(noun) ? m : f) + " " + noun;
  } else {
    np = pl ? "les " + noun : startsV(noun) ? "l'" + noun : (info.g === "m" ? "le " : "la ") + noun;
  }
  const withCase = (c: SuffixId | undefined, x: string) => {
    switch (c) {
      case "acc":
        return x + " (objet défini)";
      case "dat":
        return "vers " + x;
      case "loc":
        return "dans " + x;
      case "abl":
        return de(x) + " (provenance)";
      case "gen":
        return de(x);
      default:
        return x;
    }
  };
  if (kiAt < 0) return withCase(cas, np);

  const many = tail.includes("pl");
  let rel: string;
  if (cas === "gen") rel = (many ? "ceux " : "celui ") + de(np);
  else rel = (many ? "ceux qui sont " : "ce qui est ") + "dans " + np;
  return withCase(
    tail.find((s) => CASES.includes(s)),
    rel,
  );
}
