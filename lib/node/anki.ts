import fs from "node:fs";
import path from "node:path";

/** One Anki deck extracted from a vault .apkg at build time (scripts/build-anki.mjs). */
export interface AnkiDeck {
  slug: string;
  name: string;
  /** On-disk folder (under content/posts) that held the .apkg — used to place
   *  the deck in the notes tree, where the cards live. */
  folder: string;
  count: number;
}

const MANIFEST = path.join(process.cwd(), "content", "anki", "manifest.json");

let cache: AnkiDeck[] | null = null;

/** All decks (empty if the build step hasn't run / no .apkg in the vault). */
export function getAnkiManifest(): AnkiDeck[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as AnkiDeck[];
  } catch {
    cache = [];
  }
  return cache;
}

export function getAnkiDeck(slug: string): AnkiDeck | undefined {
  return getAnkiManifest().find((d) => d.slug === slug);
}
