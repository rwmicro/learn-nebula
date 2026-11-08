// srcset for the site's own pictures (public/images/eragny.*, the discipline
// plates of lib/paintings.ts): the original plus the smaller copies
// scripts/build-site-images.mjs writes beside it (<name>-<w>w.<ext>).
import { RESPONSIVE_WIDTHS } from "./responsive-widths.mjs";

/** The plates drawn smaller than the usual 2400 px. */
const NARROW: Record<string, number> = {
  "/images/disciplines/arts": 1080,
  "/images/disciplines/biologie": 1080,
};

/** Pixel width of an original, by path without extension: the Pissarro is
 *  1200 px, the discipline plates 2400 px (band and hero alike) but for
 *  {@link NARROW}. lib/responsive-image.test.ts checks this against the files. */
export function fullWidth(src: string): number {
  if (src in NARROW) return NARROW[src];
  return src.startsWith("/images/disciplines/") ? 2400 : 1200;
}

/** `srcSet` for `${src}.${ext}` and its smaller copies. */
export function srcSet(src: string, ext: "avif" | "webp"): string {
  const full = fullWidth(src);
  return [
    ...RESPONSIVE_WIDTHS.filter((w) => w < full).map((w) => `${src}-${w}w.${ext} ${w}w`),
    `${src}.${ext} ${full}w`,
  ].join(", ");
}

/** The welcome painting's `sizes`, the same in its three places on the home
 *  (phone card, tablet intro, desktop band) so the browser downloads one file
 *  for all three: full width on a phone, the 1070 px column elsewhere. */
export const ERAGNY_SIZES = "(max-width: 639px) 100vw, min(1070px, 92vw)";
