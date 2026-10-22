import type { PathFamily } from "./path-family";

// The painting behind the phone home's "Aujourd'hui" card: one per colour
// family, so the card says which discipline the path in progress belongs
// to, and its own for a discipline the family's painting misses (biology
// is not water lilies). All public domain (Wikimedia Commons), cropped to
// the card's band and stored as public/images/disciplines/<name>.{avif,webp}.
// Pissarro's garden (public/images/eragny.*) stays for paths with no family
// and for the welcome card.

export interface Painting {
  /** Path without extension: `${src}.avif` and `${src}.webp` exist. */
  src: string;
  /** Artist, title, year: the image's title attribute. */
  credit: string;
}

export const ERAGNY: Painting = {
  src: "/images/eragny",
  credit: "Camille Pissarro, Le Jardin potager à Éragny, 1879",
};

const BY_FAMILY: Record<PathFamily, string> = {
  sciences: "Vincent van Gogh, La Nuit étoilée, 1889",
  informatique: "Piet Mondrian, Broadway Boogie Woogie, 1943",
  vivant: "Claude Monet, Nymphéas, 1906",
  pensee: "Caspar David Friedrich, Le Voyageur contemplant une mer de nuages, 1818",
  societe: "Auguste Renoir, Bal du moulin de la Galette, 1876",
  arts: "Edgar Degas, Le Foyer de la danse à l'Opéra de la rue Le Peletier, 1872",
  langues: "Pieter Bruegel l'Ancien, La Tour de Babel, 1563",
  jeux: "Sofonisba Anguissola, La Partie d'échecs, 1555",
};

/** Disciplines with a painting of their own, by the slug of their folder
 *  (a note slug's second segment: "applied-sciences/biology/…"). */
const BY_DISCIPLINE: Record<string, [file: string, credit: string]> = {
  biology: ["biologie", "Ernst Haeckel, Formes artistiques de la nature, planche 8, 1904"],
  economy: ["economie", "Quentin Metsys, Le Prêteur et sa femme, 1514"],
};

/** The painting for a note's discipline, else its family's, else
 *  Pissarro's garden. */
export function paintingFor(family: PathFamily | null | undefined, noteSlug = ""): Painting {
  const own = BY_DISCIPLINE[noteSlug.split("/")[1] ?? ""];
  if (own) return { src: `/images/disciplines/${own[0]}`, credit: own[1] };
  return family ? { src: `/images/disciplines/${family}`, credit: BY_FAMILY[family] } : ERAGNY;
}
