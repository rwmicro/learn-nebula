// Share images for notes (Open Graph / Twitter): a card per note with its
// title and discipline, drawn at build time by scripts/build-og-images.ts
// into public/og/. The file name hashes everything drawn on the card, so a
// renamed note gets a new image (and link previews refresh) while an
// unchanged one is skipped on the next build.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { disciplineOf } from "./garden-stats";

/** Bump when the card's design changes, to redraw every image. */
export const OG_CARD_VERSION = "1";
export const OG_DIR = path.join(process.cwd(), "public", "og");

export interface OgCard {
  slug: string;
  title: string;
  /** Discipline folder name (vault spelling, e.g. "Philosophy"). */
  discipline: string;
}

export function ogCardFor(doc: { slug: string; rawPath: string; frontmatter: { title: string } }): OgCard {
  return { slug: doc.slug, title: doc.frontmatter.title, discipline: disciplineOf(doc.rawPath) };
}

export function ogFileName(card: OgCard): string {
  const h = createHash("sha1")
    .update([OG_CARD_VERSION, card.slug, card.title, card.discipline].join("\0"))
    .digest("hex")
    .slice(0, 20);
  return `${h}.png`;
}

/** Site path of the note's card, or null when the build did not draw it
 *  (dev server, or a build without the og step): callers keep the default. */
export function ogImagePath(card: OgCard): string | null {
  const name = ogFileName(card);
  return fs.existsSync(path.join(OG_DIR, name)) ? `/og/${name}` : null;
}
