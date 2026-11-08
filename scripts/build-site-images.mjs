// Smaller copies of the site's own pictures (public/images/eragny.* and
// public/images/disciplines/*), for the srcset lib/responsive-image.ts writes.
//
// The originals are 1200 px (Pissarro) and 2400 px (the discipline plates):
// a phone showed the home's painting at ~360 px from a 192 KB AVIF, and the
// /parcours/ room thumbnails, a few dozen pixels wide, loaded the full 2400 px
// plates. Each original gets <name>-<w>w.<ext> for every width of
// RESPONSIVE_WIDTHS below its own. Written beside the originals, git-ignored,
// and skipped when already newer than the source, so a rebuild costs nothing.
// Same encoder settings as build-image-variants.mjs (effort 2: measured there).

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { RESPONSIVE_WIDTHS } from "../lib/responsive-widths.mjs";

const ROOT = process.cwd();
const DIRS = [path.join(ROOT, "public", "images"), path.join(ROOT, "public", "images", "disciplines")];
const VARIANT = /-\d+w\.(avif|webp)$/;

const ENCODERS = {
  avif: (p) => p.avif({ quality: 50, effort: 2 }),
  webp: (p) => p.webp({ quality: 78 }),
};

let made = 0;
let kept = 0;
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    const ext = path.extname(name).slice(1);
    if (!(ext in ENCODERS) || VARIANT.test(name)) continue;
    if (dir.endsWith("images") && !name.startsWith("eragny.")) continue;
    const src = path.join(dir, name);
    const stat = fs.statSync(src);
    const { width } = await sharp(src).metadata();
    for (const w of RESPONSIVE_WIDTHS) {
      if (!width || w >= width) continue;
      const out = path.join(dir, `${path.basename(name, `.${ext}`)}-${w}w.${ext}`);
      if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= stat.mtimeMs) {
        kept++;
        continue;
      }
      await ENCODERS[ext](sharp(src).resize({ width: w })).toFile(out);
      made++;
    }
  }
}
console.log(`build-site-images: ${made} written, ${kept} up to date`);
