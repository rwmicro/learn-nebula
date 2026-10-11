// Categorical syllogisms checked on a three-circle Venn diagram, for the
// "syllogisme" widget (public/js/sci/syllogisme.js).
//
// The diagram has 8 regions, one per membership pattern of the terms S
// (subject), M (middle) and P (predicate). A "model" says which regions hold
// at least one thing. A universal proposition empties regions; a particular
// one says that at least one region among two candidates is inhabited. The
// conclusion follows when it is true in every model of the premises, checked
// by brute force over the 2^8 models.

export type Terme = "S" | "M" | "P";
/** A: Tous les X sont Y · E: Aucun X n'est Y · I: Quelques X sont Y ·
 *  O: Quelques X ne sont pas Y. */
export type Forme = "A" | "E" | "I" | "O";

export interface Proposition {
  forme: Forme;
  sujet: Terme;
  predicat: Terme;
}

export const FORMES: Record<Forme, string> = {
  A: "Tous les X sont Y",
  E: "Aucun X n'est Y",
  I: "Quelques X sont Y",
  O: "Quelques X ne sont pas Y",
};

const BIT: Record<Terme, number> = { S: 1, M: 2, P: 4 };

/** Region index 0..7: bit 1 = inside S, bit 2 = inside M, bit 4 = inside P. */
export const REGIONS = [0, 1, 2, 3, 4, 5, 6, 7];

export function dans(region: number, t: Terme): boolean {
  return (region & BIT[t]) !== 0;
}

/** Regions a proposition is about: X∧¬Y for A and O, X∧Y for E and I. */
export function regionsVisees(p: Proposition): number[] {
  const croise = p.forme === "E" || p.forme === "I";
  return REGIONS.filter(
    (r) => dans(r, p.sujet) && dans(r, p.predicat) === croise,
  );
}

export function estUniverselle(p: Proposition): boolean {
  return p.forme === "A" || p.forme === "E";
}

/** Truth of p in a model (bit r of `modele` set = region r inhabited). */
export function vraie(p: Proposition, modele: number): boolean {
  const habitees = regionsVisees(p).filter((r) => (modele >> r) & 1);
  return estUniverselle(p) ? habitees.length === 0 : habitees.length > 0;
}

export interface Options {
  /** Aristotle's reading: every term names something that exists. */
  importationExistentielle?: boolean;
}

function admissible(modele: number, opts: Options): boolean {
  if (!opts.importationExistentielle) return true;
  return (["S", "M", "P"] as Terme[]).every((t) =>
    REGIONS.some((r) => dans(r, t) && (modele >> r) & 1),
  );
}

export interface Verdict {
  valide: boolean;
  /** The premises can all be true together. */
  coherent: boolean;
  /** A model where the premises hold and the conclusion fails, if any. */
  contreExemple: number | null;
}

export function verifier(
  premisses: Proposition[],
  conclusion: Proposition,
  opts: Options = {},
): Verdict {
  let coherent = false;
  for (let m = 0; m < 256; m++) {
    if (!admissible(m, opts) || !premisses.every((p) => vraie(p, m))) continue;
    coherent = true;
    if (!vraie(conclusion, m))
      return { valide: false, coherent, contreExemple: m };
  }
  return { valide: true, coherent, contreExemple: null };
}

export interface Diagramme {
  /** Regions shaded (known empty) by the universal premises. */
  vides: number[];
  /** One × per particular premise: in a region, or on the line between two. */
  croix: number[][];
}

/** Venn drawing of the premises, by the usual rule: universals first, then
 *  each particular's × goes in its one candidate region left unshaded, or on
 *  the boundary when two remain. */
export function diagramme(premisses: Proposition[]): Diagramme {
  const vides = new Set<number>();
  for (const p of premisses)
    if (estUniverselle(p)) regionsVisees(p).forEach((r) => vides.add(r));
  const croix = premisses
    .filter((p) => !estUniverselle(p))
    .map((p) => regionsVisees(p).filter((r) => !vides.has(r)));
  return { vides: [...vides].sort((a, b) => a - b), croix };
}

/** Classical figure (1–4) from where M stands in the major (M–P) and minor
 *  (S–M) premises, or null when the premises do not have that shape. */
export function figure(
  majeure: Proposition,
  mineure: Proposition,
): 1 | 2 | 3 | 4 | null {
  const okMaj = new Set([majeure.sujet, majeure.predicat]);
  const okMin = new Set([mineure.sujet, mineure.predicat]);
  if (!(okMaj.has("M") && okMaj.has("P") && okMin.has("S") && okMin.has("M")))
    return null;
  const mSujetMaj = majeure.sujet === "M";
  const mSujetMin = mineure.sujet === "M";
  if (mSujetMaj && !mSujetMin) return 1;
  if (!mSujetMaj && !mSujetMin) return 2;
  if (mSujetMaj && mSujetMin) return 3;
  return 4;
}

/** Medieval names of the 24 traditionally valid moods, by figure. */
const NOMS: Record<number, Record<string, string>> = {
  1: {
    AAA: "Barbara",
    EAE: "Celarent",
    AII: "Darii",
    EIO: "Ferio",
    AAI: "Barbari",
    EAO: "Celaront",
  },
  2: {
    EAE: "Cesare",
    AEE: "Camestres",
    EIO: "Festino",
    AOO: "Baroco",
    EAO: "Cesaro",
    AEO: "Camestros",
  },
  3: {
    AAI: "Darapti",
    IAI: "Disamis",
    AII: "Datisi",
    EAO: "Felapton",
    OAO: "Bocardo",
    EIO: "Ferison",
  },
  4: {
    AAI: "Bramantip",
    AEE: "Camenes",
    IAI: "Dimaris",
    EAO: "Fesapo",
    EIO: "Fresison",
    AEO: "Camenos",
  },
};

/** Name of the mood (e.g. "Barbara") when the syllogism is in standard form
 *  (conclusion S–P) and is one of the 24 classical moods. */
export function nomDuMode(
  majeure: Proposition,
  mineure: Proposition,
  conclusion: Proposition,
): string | null {
  if (conclusion.sujet !== "S" || conclusion.predicat !== "P") return null;
  const f = figure(majeure, mineure);
  if (!f) return null;
  return NOMS[f][majeure.forme + mineure.forme + conclusion.forme] ?? null;
}

export function parseForme(s: unknown, fallback: Forme): Forme {
  const k = String(s ?? "")
    .trim()
    .toUpperCase();
  return k === "A" || k === "E" || k === "I" || k === "O" ? k : fallback;
}
