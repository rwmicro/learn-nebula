import type { PathFamily } from "./path-family";

// The picture behind the "Aujourd'hui" card (phone and desktop home) and the
// /parcours/ hero: one per colour family, so the card says which discipline
// the path in progress belongs to, and its own for a discipline the family's
// picture misses (biology is not a planetarium clock). Documents of the
// subject rather than paintings: a museum object, a plate, a map, a photo,
// a hex dump. All public domain (Metropolitan Museum, Library of Congress,
// NASA, Cleveland Museum of Art CC0) or drawn for the site, stored as
// public/images/disciplines/<name>.{avif,webp} (2400×1090, the card's band)
// and, for most, <name>-hero.{avif,webp} (2400×1500, the /parcours/ hero).
// Pissarro's garden (public/images/eragny.*) stays for paths with no family
// and for the welcome card.

export interface Painting {
  /** Path without extension: `${src}.avif` and `${src}.webp` exist. */
  src: string;
  /** Same picture cut for a full screen, when there is one. */
  hero?: string;
  /** Who made it ("" for an anonymous object). */
  by: string;
  /** Its title, set in italics. */
  title: string;
  /** Date, place, technique. */
  note: string;
  /** "By, Title, note": the image's title attribute. */
  credit: string;
  /** Where the subject sits across the band (CSS object-position x), for a
   *  narrow crop such as the /parcours/ room's portrait frame. */
  focus: string;
}

function painting(name: string, by: string, title: string, note: string, hero = true, focus = "50%"): Painting {
  const src = name.startsWith("/") ? name : `/images/disciplines/${name}`;
  return {
    src,
    ...(hero ? { hero: `${src}-hero` } : {}),
    by,
    title,
    note,
    credit: [by, title, note].filter(Boolean).join(", "),
    focus,
  };
}

export const ERAGNY: Painting = painting("/images/eragny", "Camille Pissarro", "Le Jardin potager à Éragny", "1897", false);

const BY_FAMILY: Record<PathFamily, Painting> = {
  sciences: painting("sciences", "Louis Thouverez", "Horloge planétaire", "Paris, 1790", true, "84%"),
  informatique: painting("informatique", "", "MZ… This program cannot be run in DOS mode", "les premiers octets d’un exécutable Windows", true, "22%"),
  vivant: painting("vivant", "NASA", "Blue Marble", "2012", true, "40%"),
  pensee: painting("pensee", "", "Tête d’Épicure", "marbre, copie romaine du IIe siècle", true, "74%"),
  societe: painting("societe", "Carl von Ditmar", "Carte ethnographique du Kamtchatka", "1853", true, "22%"),
  arts: painting("arts", "Edgar Degas", "Le Foyer de la danse à l’Opéra de la rue Le Peletier", "1872", false, "32%"),
  langues: painting("langues", "", "Tablette proto-cunéiforme", "Mésopotamie, vers 3100-2900 av. J.-C."),
  jeux: painting("jeux", "", "Das Schachzabelbuch", "gravure sur bois coloriée, 1483"),
};

/** Disciplines with a picture of their own, by the slug of their folder
 *  (a note slug's second segment: "applied-sciences/biology/…"). */
const BY_DISCIPLINE: Record<string, Painting> = {
  biology: painting("biologie", "Ernst Haeckel", "Formes artistiques de la nature", "planche 8, 1904", false),
  economy: painting("economie", "", "Tétradrachme d’argent à la tête d’Héraclès", "315-308 av. J.-C."),
  medicine: painting("medecine", "André Vésale", "De humani corporis fabrica", "Bâle, 1555"),
  sport: painting("sport", "Eadweard Muybridge", "Animal Locomotion", "planche de galop, 1887"),
};

/** The picture for a note's discipline, else its family's, else Pissarro's
 *  garden. */
export function paintingFor(family: PathFamily | null | undefined, noteSlug = ""): Painting {
  return BY_DISCIPLINE[noteSlug.split("/")[1] ?? ""] ?? (family ? BY_FAMILY[family] : ERAGNY);
}
