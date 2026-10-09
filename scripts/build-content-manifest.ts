// Build-time content manifest for the coin logic:
//
//   data/content-manifest.json — { notes: string[], decks: string[] }
//
// the real note slugs (lib/content.ts) and Anki deck slugs (lib/anki.ts). The
// Node server checks a progress-sync read/review against it before paying coins
// (server/content-manifest.ts), so a client can't mint coins by syncing
// progress for notes, questions or cards that don't exist.
//
// Written to data/ (baked into the image next to rag-chunks.json), NOT to out/:
// it never needs to be served. Run with tsx so it resolves slugs through the
// site's own lib/content.ts — the same slugs the pages and the reading/SRS
// storage keys use. Must run after fetch-notes and build-anki.

import fs from "node:fs";
import path from "node:path";
import { getPostSlugs } from "../lib/content";
import { getAnkiManifest } from "../lib/anki";

const OUT = path.join(process.cwd(), "data", "content-manifest.json");

const notes = getPostSlugs();
const decks = getAnkiManifest().map((d) => d.slug);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ notes, decks }));

console.log(
  `content-manifest: ${notes.length} notes, ${decks.length} decks → ${path.relative(process.cwd(), OUT)}`,
);
