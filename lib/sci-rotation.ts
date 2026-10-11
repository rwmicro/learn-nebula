// Illustrative crop-rotation model for the "rotation-cultures" widget
// (public/js/sci/rotation-cultures.js). The nitrogen score is qualitative
// (0 = sol épuisé, 10 = très riche), not kg N/ha: it only encodes the usual
// rules of thumb — legumes and green manure leave nitrogen, leafy and fruiting
// crops draw a lot, roots and cereals less — so the reader can see a rotation
// keep the soil in balance where a monoculture runs it down.

export type Famille =
  | "legumineuses"
  | "feuilles"
  | "racines"
  | "fruits"
  | "cereales"
  | "engrais-vert";

export interface InfoFamille {
  nom: string;
  court: string;
  exemples: string;
  /** Change of the nitrogen score over one season. */
  azote: number;
  /** Needs a well-supplied soil to do well. */
  gourmande: boolean;
  /** Pests or diseases that build up when the family comes back too soon. */
  risque: string;
}

export const FAMILLES: Record<Famille, InfoFamille> = {
  legumineuses: {
    nom: "Légumineuses",
    court: "Légum.",
    exemples: "pois, haricots, fèves",
    azote: 3,
    gourmande: false,
    risque: "fonte des semis, anthracnose, sitones",
  },
  feuilles: {
    nom: "Feuilles (choux, salades)",
    court: "Feuilles",
    exemples: "choux, salades, épinards",
    azote: -2,
    gourmande: true,
    risque: "hernie du chou, altises",
  },
  racines: {
    nom: "Racines",
    court: "Racines",
    exemples: "carottes, betteraves, panais",
    azote: -1,
    gourmande: false,
    risque: "mouche de la carotte, nématodes",
  },
  fruits: {
    nom: "Fruits (solanacées, courges)",
    court: "Fruits",
    exemples: "tomates, pommes de terre, courges",
    azote: -2,
    gourmande: true,
    risque: "mildiou, doryphores, nématodes",
  },
  cereales: {
    nom: "Céréales",
    court: "Céréales",
    exemples: "blé, orge, maïs",
    azote: -2,
    gourmande: false,
    risque: "piétin-verse, fusarioses",
  },
  "engrais-vert": {
    nom: "Engrais vert",
    court: "Engr. vert",
    exemples: "trèfle, vesce, phacélie",
    azote: 3,
    gourmande: false,
    risque: "",
  },
};

export const ORDRE_FAMILLES = Object.keys(FAMILLES) as Famille[];

export const AZOTE_DEPART = 5;
export const AZOTE_MAX = 10;
/** Below this score a demanding crop is likely to lack nitrogen. */
export const SEUIL_CARENCE = 3;

export interface Saison {
  famille: Famille | null;
  azoteAvant: number;
  azoteApres: number;
  /** Same family as last year on this plot. */
  repetition: boolean;
  /** Same family as two years ago (a short return). */
  retourRapide: boolean;
  /** A demanding crop planted on a poor soil. */
  carence: boolean;
}

/** Runs one plot's sequence of crops (null = jachère: the score holds). */
export function simulerParcelle(
  cultures: (Famille | null)[],
  depart = AZOTE_DEPART,
): Saison[] {
  let n = depart;
  return cultures.map((f, i) => {
    const avant = n;
    const info = f ? FAMILLES[f] : null;
    if (info) n = Math.max(0, Math.min(AZOTE_MAX, n + info.azote));
    // Green manure (often a mix of families, turned in young) is not flagged:
    // a simplification of this illustrative model.
    const suivi = f && f !== "engrais-vert";
    return {
      famille: f,
      azoteAvant: avant,
      azoteApres: n,
      repetition: !!suivi && i >= 1 && cultures[i - 1] === f,
      retourRapide:
        !!suivi && i >= 2 && cultures[i - 2] === f && cultures[i - 1] !== f,
      carence: !!info?.gourmande && avant < SEUIL_CARENCE,
    };
  });
}

export function parseFamille(s: unknown): Famille | null {
  const k = String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!k) return null;
  if (k.startsWith("leg")) return "legumineuses";
  if (k.startsWith("feu")) return "feuilles";
  if (k.startsWith("rac")) return "racines";
  if (k.startsWith("fru") || k.startsWith("sol")) return "fruits";
  if (k.startsWith("cer")) return "cereales";
  if (k.startsWith("eng") || k.includes("vert")) return "engrais-vert";
  return null;
}
