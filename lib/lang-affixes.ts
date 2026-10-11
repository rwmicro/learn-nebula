// Indonesian / Malay affixation, for the `affixes-indonesiens` widget
// (public/js/lang/affixes.js). Pure functions, tested in lang-affixes.test.ts.
//
// The rules are the ones the vault states in Indonésien/03-Grammaire/Affixes.md
// (« me- prend la nasale prononcée au même endroit que la première consonne de
// la racine… les consonnes sourdes k, p, t, s disparaissent »), plus the
// standard exceptions the note does not cover: monosyllabic roots take menge-,
// consonant clusters (pr-, tr-, kr-, kl-, st-…) keep their first consonant,
// and a handful of lexical exceptions listed in OVERRIDES.

export type AffixId =
  | "meN"
  | "meN-kan"
  | "meN-i"
  | "ber"
  | "di"
  | "ter"
  | "peN"
  | "an"
  | "ke-an"
  | "peN-an"
  | "per-an";

export interface AffixDef {
  id: AffixId;
  /** How the affix is written in the picker. */
  label: string;
  /** What it does, in a few words. */
  role: string;
}

export const AFFIXES: AffixDef[] = [
  { id: "meN", label: "meN-", role: "verbe actif transitif" },
  { id: "meN-kan", label: "meN-…-kan", role: "actif + causatif ou bénéfactif" },
  { id: "meN-i", label: "meN-…-i", role: "actif + lieu, répétition ou objet visé" },
  { id: "ber", label: "ber-", role: "verbe intransitif, état, activité" },
  { id: "di", label: "di-", role: "passif (agent à la 3ᵉ personne)" },
  { id: "ter", label: "ter-", role: "involontaire, état résultant, superlatif" },
  { id: "peN", label: "pe(N)-", role: "nom d'agent ou d'instrument" },
  { id: "an", label: "-an", role: "nom (résultat, objet)" },
  { id: "ke-an", label: "ke-…-an", role: "nom abstrait, état subi" },
  { id: "peN-an", label: "pe(N)-…-an", role: "nom de processus (verbe en me-)" },
  { id: "per-an", label: "per-…-an", role: "nom de processus ou de lieu (verbe en ber-, nom)" },
];

export type PartKind = "prefix" | "root" | "suffix";
export interface Part {
  text: string;
  kind: PartKind;
}

export interface Derivation {
  word: string;
  parts: Part[];
  /** Short French statement of the rule that applied. */
  rule: string;
  /** Stable id of that rule (for tests and highlighting). */
  ruleId: string;
  /** Initial consonant absorbed by the nasal, if any. */
  dropped?: string;
  /** Lexical exception: the form is listed, not computed. */
  exception?: string;
}

const VOWELS = "aeiou";
const isVowel = (c: string | undefined) => !!c && VOWELS.includes(c);

/** Number of vowel letters: a good enough syllable count for the
 *  monosyllable rule (cat, bom, tik). Diphthongs are not merged on purpose:
 *  the ai of main or the ia of tiap are two syllables. */
export function syllables(root: string): number {
  const m = root.toLowerCase().match(/[aeiou]/g);
  return m ? m.length : 0;
}

/** True when the root opens on two consonants (pr-, tr-, kl-, st-, sk-…). */
function cluster(root: string): boolean {
  const [a, b] = root;
  if (!a || !b || isVowel(a) || isVowel(b)) return false;
  // ng, ny, sy, kh are single sounds written with two letters.
  return !["ng", "ny", "sy", "kh"].includes(a + b);
}

interface Nasal {
  /** The prefix as written: me, mem, men, meng, meny, menge (or pe-…). */
  prefix: string;
  /** The root as it stays after the prefix (initial consonant possibly gone). */
  rest: string;
  rule: string;
  ruleId: string;
  dropped?: string;
}

/**
 * meN- / peN- before a root. `base` is "me" or "pe": the two prefixes share
 * the nasal rules, and only differ before l, m, n, r, w, y (me- / pe-).
 */
export function nasalize(rootIn: string, base: "me" | "pe"): Nasal {
  const root = rootIn.toLowerCase();
  const B = base;
  const c = root[0];
  const two = root.slice(0, 2);
  if (syllables(root) === 1) {
    return {
      prefix: B + "nge",
      rest: root,
      rule: `racine d'une seule syllabe : ${B}nge- devant la racine entière`,
      ruleId: "monosyllabe",
    };
  }
  if (isVowel(c)) {
    return { prefix: B + "ng", rest: root, rule: `voyelle initiale : ${B}ng-`, ruleId: "voyelle" };
  }
  if (two === "ng" || two === "ny" || "lmnrwy".includes(c)) {
    return {
      prefix: B,
      rest: root,
      rule: `devant l, m, n, r, w, y, ng, ny : ${B}- sans nasale`,
      ruleId: "sans-nasale",
    };
  }
  if ("bfv".includes(c)) {
    return { prefix: B + "m", rest: root, rule: `devant b, f, v : ${B}m-`, ruleId: "m" };
  }
  if (c === "p") {
    if (cluster(root)) {
      return {
        prefix: B + "m",
        rest: root,
        rule: `groupe de consonnes (${two}-) : ${B}m-, le p reste`,
        ruleId: "groupe",
      };
    }
    return { prefix: B + "m", rest: root.slice(1), rule: `p → ${B}m-, le p tombe`, ruleId: "p", dropped: "p" };
  }
  if (two === "sy") {
    return { prefix: B + "n", rest: root, rule: `devant sy : ${B}n-, rien ne tombe`, ruleId: "n" };
  }
  if ("dcjz".includes(c)) {
    return { prefix: B + "n", rest: root, rule: `devant d, c, j, z : ${B}n-`, ruleId: "n" };
  }
  if (c === "t") {
    if (cluster(root)) {
      return {
        prefix: B + "n",
        rest: root,
        rule: `groupe de consonnes (${two}-) : ${B}n-, le t reste`,
        ruleId: "groupe",
      };
    }
    return { prefix: B + "n", rest: root.slice(1), rule: `t → ${B}n-, le t tombe`, ruleId: "t", dropped: "t" };
  }
  if (c === "s") {
    if (cluster(root)) {
      return {
        prefix: B + "n",
        rest: root,
        rule: `groupe de consonnes (${two}-) : ${B}n-, le s reste`,
        ruleId: "groupe",
      };
    }
    return { prefix: B + "ny", rest: root.slice(1), rule: `s → ${B}ny-, le s tombe`, ruleId: "s", dropped: "s" };
  }
  if (c === "k") {
    if (two === "kh" || cluster(root)) {
      return {
        prefix: B + "ng",
        rest: root,
        rule: `${two}- : ${B}ng-, le k reste`,
        ruleId: "groupe",
      };
    }
    return { prefix: B + "ng", rest: root.slice(1), rule: `k → ${B}ng-, le k tombe`, ruleId: "k", dropped: "k" };
  }
  if (c === "g" || c === "h") {
    return { prefix: B + "ng", rest: root, rule: `devant g, h : ${B}ng-`, ruleId: "ng" };
  }
  return { prefix: B, rest: root, rule: `consonne rare : ${B}- par défaut`, ruleId: "defaut" };
}

/** ber-, ter-, per- lose their r before r, and before a first syllable in -er (kerja, ternak). */
function rPrefix(root: string, p: "ber" | "ter" | "per"): { prefix: string; rule: string; ruleId: string } {
  if (root[0] === "r") {
    return { prefix: p.slice(0, 2), rule: `racine en r- : ${p}- devient ${p.slice(0, 2)}-`, ruleId: "r" };
  }
  // C + e + r + consonant: kerja (ker.ja), ternak (ter.nak) — not perang (pe.rang).
  if (p !== "per" && /^[^aeiou]er[^aeiou]/.test(root)) {
    return {
      prefix: p.slice(0, 2),
      rule: `première syllabe en -er (${root.slice(0, 3)}-) : ${p}- devient ${p.slice(0, 2)}-`,
      ruleId: "er",
    };
  }
  return { prefix: p, rule: `${p}- s'ajoute tel quel`, ruleId: "simple" };
}

/** Forms that are listed rather than computed. Key: `root|affix`. */
const OVERRIDES: Record<string, { parts: Part[]; exception: string }> = {
  "ajar|ber": {
    parts: [
      { text: "bel", kind: "prefix" },
      { text: "ajar", kind: "root" },
    ],
    exception: "exception lexicale : ber- devient bel- devant ajar (belajar)",
  },
  "kerja|peN": {
    parts: [
      { text: "pe", kind: "prefix" },
      { text: "kerja", kind: "root" },
    ],
    exception: "formé sur bekerja (ber-) : pe- sans nasale, le k reste",
  },
  "kerja|peN-an": {
    parts: [
      { text: "pe", kind: "prefix" },
      { text: "kerja", kind: "root" },
      { text: "an", kind: "suffix" },
    ],
    exception: "formé sur bekerja (ber-) : pe- sans nasale, le k reste",
  },
  "punya|meN-i": {
    parts: [
      { text: "mem", kind: "prefix" },
      { text: "punya", kind: "root" },
      { text: "i", kind: "suffix" },
    ],
    exception: "exception : le p de punya ne tombe pas (mempunyai, pas *memunyai)",
  },
  "tahu|meN-i": {
    parts: [
      { text: "menge", kind: "prefix" },
      { text: "tahu", kind: "root" },
      { text: "i", kind: "suffix" },
    ],
    exception: "exception : mengetahui, le t reste et me- prend la forme menge-",
  },
};

/** Builds `root` + `affix`. */
export function derive(rootIn: string, affix: AffixId): Derivation {
  const root = rootIn.trim().toLowerCase();
  const o = OVERRIDES[root + "|" + affix];
  if (o) {
    return {
      word: o.parts.map((p) => p.text).join(""),
      parts: o.parts,
      rule: o.exception,
      ruleId: "exception",
      exception: o.exception,
    };
  }
  const R = (text: string): Part => ({ text, kind: "root" });
  const P = (text: string): Part => ({ text, kind: "prefix" });
  const S = (text: string): Part => ({ text, kind: "suffix" });
  const out = (parts: Part[], rule: string, ruleId: string, dropped?: string): Derivation => ({
    word: parts.map((p) => p.text).join(""),
    parts: parts.filter((p) => p.text),
    rule,
    ruleId,
    dropped,
  });

  switch (affix) {
    case "meN":
    case "meN-kan":
    case "meN-i":
    case "peN":
    case "peN-an": {
      const n = nasalize(root, affix.startsWith("peN") ? "pe" : "me");
      const suf = affix === "meN-kan" ? "kan" : affix === "meN-i" ? "i" : affix === "peN-an" ? "an" : "";
      return out([P(n.prefix), R(n.rest), S(suf)], n.rule, n.ruleId, n.dropped);
    }
    case "ber":
    case "ter": {
      const r = rPrefix(root, affix);
      return out([P(r.prefix), R(root)], r.rule, r.ruleId);
    }
    case "per-an": {
      const r = rPrefix(root, "per");
      return out([P(r.prefix), R(root), S("an")], r.rule, r.ruleId);
    }
    case "di":
      return out([P("di"), R(root)], "di- s'ajoute tel quel, sans changement", "simple");
    case "an":
      return out([R(root), S("an")], "-an s'ajoute tel quel", "simple");
    case "ke-an":
      return out([P("ke"), R(root), S("an")], "ke- et -an encadrent la racine, sans changement", "simple");
  }
}

/**
 * Roots of the vault's notes, with the French gloss the notes give and, for
 * each derived form the notes list, its meaning. A derived form missing here
 * is still built by the rules, but shown without a meaning.
 * `src`: "id" Indonésien/…/Affixes.md, Verbes.md, Formel-Informel.md;
 * "ms" Malais/03-Grammaire/Grammaire.md.
 */
export interface Root {
  root: string;
  gloss: string;
  src: ("id" | "ms")[];
  forms: Partial<Record<AffixId, string>>;
}

export const ROOTS: Root[] = [
  { root: "tulis", gloss: "écrire", src: ["id", "ms"], forms: { meN: "écrire", di: "être écrit", ter: "écrit", peN: "écrivain", an: "écriture, écrit", "peN-an": "rédaction" } },
  { root: "baca", gloss: "lire", src: ["id", "ms"], forms: { meN: "lire", ter: "lisible", an: "lecture" } },
  { root: "pukul", gloss: "frapper", src: ["id"], forms: { meN: "frapper" } },
  { root: "kirim", gloss: "envoyer", src: ["id"], forms: { meN: "envoyer" } },
  { root: "sapu", gloss: "balayer", src: ["id"], forms: { meN: "balayer" } },
  { root: "dengar", gloss: "entendre", src: ["id"], forms: { meN: "entendre", "meN-kan": "écouter", ter: "audible", peN: "auditeur" } },
  { root: "ajar", gloss: "enseigner, étudier", src: ["id"], forms: { meN: "enseigner", ber: "étudier" } },
  { root: "beli", gloss: "acheter", src: ["id", "ms"], forms: { meN: "acheter", "meN-kan": "acheter pour qqn", di: "être acheté", peN: "acheteur" } },
  { root: "buka", gloss: "ouvrir", src: ["id", "ms"], forms: { meN: "ouvrir", di: "ouvert", ter: "ouvert", peN: "ouvre-(bouteille…)" } },
  { root: "tutup", gloss: "fermer", src: ["id"], forms: { meN: "fermer", di: "fermé", ter: "fermé", peN: "couvercle" } },
  { root: "masak", gloss: "cuisiner", src: ["id", "ms"], forms: { meN: "cuisiner", "meN-kan": "cuisiner pour qqn", di: "être cuisiné" } },
  { root: "ambil", gloss: "prendre", src: ["id", "ms"], forms: { meN: "prendre" } },
  { root: "makan", gloss: "manger", src: ["id", "ms"], forms: { meN: "manger (qqch)", an: "nourriture" } },
  { root: "minum", gloss: "boire", src: ["id", "ms"], forms: { an: "boisson" } },
  { root: "cari", gloss: "chercher", src: ["id"], forms: { meN: "chercher" } },
  { root: "cium", gloss: "embrasser", src: ["id"], forms: { meN: "embrasser" } },
  { root: "gambar", gloss: "dessin, image", src: ["id"], forms: { meN: "dessiner" } },
  { root: "lihat", gloss: "voir", src: ["id"], forms: { meN: "voir", ter: "visible" } },
  { root: "jual", gloss: "vendre", src: ["id"], forms: { di: "vendu", peN: "vendeur" } },
  { root: "curi", gloss: "voler (dérober)", src: ["id"], forms: { di: "volé", peN: "voleur" } },
  { root: "nyanyi", gloss: "chanter", src: ["id"], forms: { ber: "chanter", peN: "chanteur" } },
  { root: "main", gloss: "jeu, jouer", src: ["id", "ms"], forms: { ber: "jouer", peN: "joueur", an: "jouet" } },
  { root: "jalan", gloss: "chemin, marcher", src: ["id", "ms"], forms: { ber: "marcher", "per-an": "voyage" } },
  { root: "kerja", gloss: "travail", src: ["id", "ms"], forms: { ber: "travailler", peN: "travailleur", "peN-an": "travail" } },
  { root: "renang", gloss: "nage", src: ["id"], forms: { ber: "nager" } },
  { root: "tanya", gloss: "question, demander", src: ["id"], forms: { ber: "demander" } },
  { root: "pikir", gloss: "penser", src: ["id"], forms: { ber: "penser", an: "pensée" } },
  { root: "tidur", gloss: "dormir", src: ["id"], forms: { ter: "s'endormir (sans le vouloir)" } },
  { root: "kenal", gloss: "connaître", src: ["id"], forms: { ter: "célèbre" } },
  { root: "baik", gloss: "bon", src: ["id"], forms: { ter: "le meilleur", "ke-an": "bonté" } },
  { root: "besar", gloss: "grand", src: ["id"], forms: { ter: "le plus grand", "ke-an": "grandeur" } },
  { root: "sehat", gloss: "en bonne santé", src: ["id"], forms: { "ke-an": "santé" } },
  { root: "lapar", gloss: "avoir faim", src: ["id"], forms: { "ke-an": "avoir faim (état subi)" } },
  { root: "dingin", gloss: "froid", src: ["id"], forms: { "ke-an": "avoir froid", peN: "refroidisseur" } },
  { root: "hapus", gloss: "effacer", src: ["id"], forms: { peN: "gomme" } },
  { root: "garis", gloss: "ligne", src: ["id"], forms: { peN: "règle (instrument)" } },
  { root: "potong", gloss: "couper", src: ["id"], forms: { peN: "coupeur, ciseaux" } },
  { root: "tari", gloss: "danse", src: ["id"], forms: { peN: "danseur" } },
  { root: "lukis", gloss: "peindre", src: ["id"], forms: { peN: "peintre" } },
  { root: "didik", gloss: "éduquer", src: ["id"], forms: { "peN-an": "éducation" } },
  { root: "jelas", gloss: "clair", src: ["id"], forms: { "peN-an": "explication" } },
  { root: "pilih", gloss: "choisir", src: ["id"], forms: { "peN-an": "élection" } },
  { root: "bangun", gloss: "se lever, bâtir", src: ["id"], forms: { an: "bâtiment", "peN-an": "développement", ter: "se réveiller (sans le vouloir)" } },
  { root: "ubah", gloss: "changer", src: ["id"], forms: { "per-an": "changement" } },
  { root: "rumah", gloss: "maison", src: ["id", "ms"], forms: { "per-an": "lotissement" } },
  { root: "pustaka", gloss: "livres", src: ["id"], forms: { "per-an": "bibliothèque" } },
  { root: "cinta", gloss: "amour", src: ["id"], forms: { "meN-i": "aimer (d'amour)" } },
  { root: "masuk", gloss: "entrer", src: ["id"], forms: { "meN-i": "entrer dans" } },
  { root: "duduk", gloss: "s'asseoir", src: ["id"], forms: { "meN-i": "occuper" } },
  { root: "ikut", gloss: "suivre", src: ["id"], forms: { "meN-i": "suivre" } },
  { root: "suka", gloss: "aimer, apprécier", src: ["id"], forms: { "meN-i": "aimer" } },
  { root: "tahu", gloss: "savoir", src: ["id"], forms: { "meN-i": "savoir" } },
  { root: "punya", gloss: "avoir", src: ["id"], forms: { "meN-i": "avoir" } },
  { root: "kata", gloss: "mot, dire", src: ["id"], forms: { "meN-kan": "dire" } },
  { root: "lupa", gloss: "oublier", src: ["id"], forms: { "meN-kan": "oublier" } },
  { root: "putus", gloss: "rompu, trancher", src: ["id"], forms: { "meN-kan": "décider" } },
  { root: "beri", gloss: "donner", src: ["id"], forms: { "meN-kan": "donner" } },
  { root: "bersih", gloss: "propre", src: ["id"], forms: { "meN-kan": "nettoyer" } },
  { root: "jawab", gloss: "réponse", src: ["id"], forms: { meN: "répondre" } },
  { root: "panggil", gloss: "appeler", src: ["id"], forms: { meN: "appeler" } },
  { root: "tangis", gloss: "pleurs", src: ["id"], forms: { meN: "pleurer" } },
  { root: "terima", gloss: "recevoir", src: ["id"], forms: { meN: "recevoir" } },
  { root: "telepon", gloss: "téléphone", src: ["id"], forms: { meN: "téléphoner" } },
  { root: "dapat", gloss: "obtenir", src: ["ms"], forms: { meN: "obtenir" } },
  { root: "kira", gloss: "calculer", src: ["ms"], forms: { meN: "calculer" } },
  { root: "bicara", gloss: "discours", src: ["id", "ms"], forms: { ber: "parler" } },
  { root: "temu", gloss: "rencontre", src: ["id", "ms"], forms: { ber: "se rencontrer", "meN-i": "rencontrer, aller voir" } },
  { root: "pakai", gloss: "utiliser", src: ["id", "ms"], forms: { an: "vêtements" } },
];

/** Meaning of root+affix when a note gives it, else null. */
export function meaning(root: string, affix: AffixId): string | null {
  const r = ROOTS.find((x) => x.root === root.trim().toLowerCase());
  return r?.forms[affix] ?? null;
}
