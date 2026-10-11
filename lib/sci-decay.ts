// Radioactive decay and dating, for the "datation" widget
// (public/js/sci/datation.js). N(t) = N0·2^{−t/T½}, so the age of a sample
// that keeps a fraction f of its parent isotope is t = T½·log2(1/f).

export type IsotopeId = "c14" | "k40" | "u238";

export interface Isotope {
  id: IsotopeId;
  nom: string;
  symbole: string;
  /** Half-life in years. */
  demiVie: number;
  /** Half-life as written in French for the reader. */
  demiVieTexte: string;
  fils: string;
  /** Daughter name alone, for a table label. */
  filsCourt: string;
  usage: string;
}

export const ISOTOPES: Record<IsotopeId, Isotope> = {
  c14: {
    id: "c14",
    nom: "carbone 14",
    symbole: "¹⁴C",
    demiVie: 5730,
    demiVieTexte: "5 730 ans",
    fils: "azote 14",
    filsCourt: "azote 14",
    usage:
      "restes d'êtres vivants (bois, os, tissus) : l'organisme cesse d'absorber du carbone 14 à sa mort ; au-delà d'environ 50 000 ans il en reste trop peu pour le mesurer",
  },
  k40: {
    id: "k40",
    nom: "potassium 40",
    symbole: "⁴⁰K",
    demiVie: 1.25e9,
    demiVieTexte: "1,25 milliard d'années",
    fils: "argon 40 (environ 11 %) ou calcium 40 (environ 89 %)",
    filsCourt: "argon 40 ou calcium 40",
    usage:
      "roches volcaniques : l'argon, un gaz, s'échappe de la lave puis reste piégé une fois la roche cristallisée ; la méthode potassium-argon tient compte du fait que seule une désintégration sur neuf environ donne de l'argon",
  },
  u238: {
    id: "u238",
    nom: "uranium 238",
    symbole: "²³⁸U",
    demiVie: 4.47e9,
    demiVieTexte: "4,47 milliards d'années",
    fils: "plomb 206 (au bout d'une chaîne de désintégrations)",
    filsCourt: "plomb 206",
    usage:
      "les roches et minéraux les plus anciens (zircons), les météorites et l'âge de la Terre, environ 4,54 milliards d'années : il reste à peu près la moitié de l'uranium 238 initial",
  },
};

export function parseIsotope(s: unknown): IsotopeId {
  const k = String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (k.startsWith("k") || k.includes("potassium")) return "k40";
  if (k.startsWith("u") || k.includes("uranium")) return "u238";
  return "c14";
}

/** Fraction of parent atoms left after t (same unit as the half-life). */
export function restant(t: number, demiVie: number): number {
  return Math.pow(2, -t / demiVie);
}

/** Age from the fraction of parent left (0 < f ≤ 1): T½·log2(1/f). */
export function age(fraction: number, demiVie: number): number {
  if (!(fraction > 0) || fraction > 1) return NaN;
  return demiVie * Math.log2(1 / fraction);
}

/** Age from the daughter/parent ratio D/P when every decay gives the
 *  daughter measured and none was there at the start: f = 1/(1 + D/P). */
export function ageRapport(dSurP: number, demiVie: number): number {
  return age(1 / (1 + dSurP), demiVie);
}

/** Deterministic PRNG (mulberry32) so a seed gives the same grid every time. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Decay time of each of n atoms, in half-lives: an exponential draw,
 *  −log2(u) with u uniform in (0, 1]. */
export function tiragesVies(n: number, seed: number): number[] {
  const r = prng(seed);
  return Array.from({ length: n }, () => -Math.log2(1 - r()));
}

/** "12 300 ans", "1,8 million d'années", "3,2 milliards d'années". */
export function formatAns(a: number): string {
  const nf = (v: number, d: number) =>
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(v);
  if (!Number.isFinite(a)) return "—";
  if (a >= 1e9)
    return (
      nf(a / 1e9, 2) + (a >= 2e9 ? " milliards d'années" : " milliard d'années")
    );
  if (a >= 1e6)
    return (
      nf(a / 1e6, 2) + (a >= 2e6 ? " millions d'années" : " million d'années")
    );
  if (a >= 1e4) return nf(Math.round(a / 100) * 100, 0) + " ans";
  return nf(Math.round(a / 10) * 10, 0) + " ans";
}
