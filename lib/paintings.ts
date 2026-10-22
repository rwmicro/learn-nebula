import type { PathFamily } from "./path-family";

// The painting behind the phone home's "Aujourd'hui" card: one per colour
// family, so the card says which discipline the path in progress belongs
// to. All public domain (Wikimedia Commons), cropped to the card's band and
// stored as public/images/disciplines/<family>.{avif,webp}. Pissarro's
// garden (public/images/eragny.*) stays for paths with no family and for the
// welcome card.

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
  informatique: "Claude Monet, La Gare Saint-Lazare, 1877",
  vivant: "Claude Monet, Nymphéas, 1906",
  pensee: "Caspar David Friedrich, Le Voyageur contemplant une mer de nuages, 1818",
  societe: "Auguste Renoir, Bal du moulin de la Galette, 1876",
  arts: "Edgar Degas, Le Foyer de la danse à l'Opéra de la rue Le Peletier, 1872",
  langues: "Pieter Bruegel l'Ancien, La Tour de Babel, 1563",
  jeux: "Sofonisba Anguissola, La Partie d'échecs, 1555",
};

/** The painting for a family, Pissarro's garden for none. */
export function paintingFor(family: PathFamily | null | undefined): Painting {
  return family ? { src: `/images/disciplines/${family}`, credit: BY_FAMILY[family] } : ERAGNY;
}
