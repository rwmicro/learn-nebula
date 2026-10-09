// The set of real note slugs and Anki deck slugs, loaded once from the build
// artifact (scripts/build-content-manifest.ts writes data/content-manifest.json).
// The progress-sync coin logic (server/account-store.ts) checks a read/review
// against this before paying, so a client can't mint coins by syncing progress
// for notes, questions or cards that don't exist.
//
// When the file is absent or unreadable (a dev run with no build, or an old
// volume from before this shipped), `available` is false and both predicates
// return true — so activity pays exactly as it did before, and nothing breaks
// without a build.

import fs from "node:fs";
import { env } from "./env.ts";
import type { ContentKnown } from "./accounts.ts";

interface ManifestFile {
  notes?: unknown;
  decks?: unknown;
}

const PAY_ALL: ContentKnown = { hasNote: () => true, hasDeck: () => true, available: false };

const strings = (v: unknown): Set<string> =>
  new Set(Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);

function load(): ContentKnown {
  let raw: string;
  try {
    raw = fs.readFileSync(env.contentManifest, "utf8");
  } catch {
    console.warn(
      `content-manifest: ${env.contentManifest} not found — progress-sync coins are not validated against real content (run the build to generate it).`,
    );
    return PAY_ALL;
  }
  try {
    const m = JSON.parse(raw) as ManifestFile;
    const notes = strings(m.notes);
    const decks = strings(m.decks);
    // An empty manifest would silently stop paying for everything; treat it as
    // "no manifest" rather than starve a legitimate reader of coins.
    if (notes.size === 0 && decks.size === 0) return PAY_ALL;
    return { hasNote: (s) => notes.has(s), hasDeck: (s) => decks.has(s), available: true };
  } catch (e) {
    console.warn("content-manifest: parse failed", e instanceof Error ? e.message : e);
    return PAY_ALL;
  }
}

let cache: ContentKnown | null = null;

/** The loaded manifest (cached for the process' life). */
export function contentKnown(): ContentKnown {
  return (cache ??= load());
}
