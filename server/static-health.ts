// Whether the static export can actually be served: out/index.html exists and
// this process may open it. /healthz answers 503 without it, so the image's
// HEALTHCHECK, the host's update-and-rollback script and the outside uptime
// probe all see a server that runs but serves only 404s (as on 20/10/2026,
// when the Pi's storage handed the container files it couldn't read) — the
// API alone kept /healthz green for hours.

import fs from "node:fs";
import path from "node:path";

export function staticReadable(dir: string): boolean {
  try {
    // open, not access/stat: the read permission is what serving needs.
    fs.closeSync(fs.openSync(path.join(dir, "index.html"), "r"));
    return true;
  } catch {
    return false;
  }
}
