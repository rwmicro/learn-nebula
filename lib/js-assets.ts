// The page scripts every navigation loads (layout + note), served as hashed
// copies under /js/h/<name>.<hash>.js so the server can mark them immutable
// (server/static-cache.ts).
//
// Under their plain names they were `no-cache`, so each page view revalidated
// a dozen scripts against the Pi — and Cloudflare's Browser Cache TTL rewrote
// that `no-cache` into a 4 h max-age, so after a deploy a reader could run
// yesterday's note.bundle.js against today's HTML. A name that changes with
// the bytes fixes both: no request while the file is the same, a new URL the
// moment it isn't.
//
// scripts/bundle-js.mjs writes the copies (lib/hashed-scripts.js names them).
// The scripts fetched on demand (widget packs, pronounce, diagrams…) keep
// their plain names: their loaders build the URL at runtime.

import fs from "node:fs";
import path from "node:path";
import { HASHED_SCRIPTS, hashedScriptName } from "./hashed-scripts.js";

export type HashedScript = (typeof HASHED_SCRIPTS)[number];

const cache = new Map<string, string>();

/**
 * Public URL of one of HASHED_SCRIPTS. The plain /js/ name in dev (an edited
 * script must show up without re-running bundle-js), and whenever the hashed
 * copy wasn't written, so a page never points at a missing file.
 */
export function jsAsset(file: HashedScript): string {
  if (process.env.NODE_ENV !== "production") return `/js/${file}`;
  const hit = cache.get(file);
  if (hit) return hit;
  let url = `/js/${file}`;
  try {
    const js = path.join(process.cwd(), "public", "js");
    const name = hashedScriptName(file, fs.readFileSync(path.join(js, file)));
    if (fs.existsSync(path.join(js, "h", name))) url = `/js/h/${name}`;
  } catch {
    /* source not built: the plain name still works */
  }
  cache.set(file, url);
  return url;
}
