/**
 * Colour families for reading paths: each discipline (the vault's level-2
 * folder, `ReadingPathView.discipline`) belongs to one broad family, and the
 * family picks the accent colour of its paths on /parcours/ and /themes/.
 * One colour per family rather than per path or per discipline: two dozen
 * hues would not stay apart, eight do. The colours themselves are CSS tokens
 * (`[data-family]` in assets/css/global.css), so they follow light/dark.
 */

export const PATH_FAMILIES = [
  "sciences",
  "informatique",
  "vivant",
  "pensee",
  "societe",
  "arts",
  "langues",
  "jeux",
] as const;

export type PathFamily = (typeof PATH_FAMILIES)[number];

const FAMILY_OF: Record<string, PathFamily> = {
  Mathematics: "sciences",
  Physics: "sciences",
  Chemistry: "sciences",
  Geology: "sciences",
  "Computer Science": "informatique",
  Biology: "vivant",
  Ecology: "vivant",
  Medicine: "vivant",
  Sport: "vivant",
  Agriculture: "vivant",
  History: "pensee",
  Philosophy: "pensee",
  Religion: "pensee",
  Mythology: "pensee",
  Sociology: "societe",
  Anthropology: "societe",
  Law: "societe",
  Communication: "societe",
  Economy: "societe",
  Psychologie: "societe",
  Arts: "arts",
  Architecture: "arts",
  Cinema: "arts",
  Music: "arts",
  Theatre: "arts",
  Littérature: "arts",
  "Languages & Dialects": "langues",
  Linguistics: "langues",
  Échecs: "jeux",
};

/** The colour family of a discipline folder name, or null for none. */
export function pathFamily(discipline: string): PathFamily | null {
  return FAMILY_OF[discipline] ?? null;
}
