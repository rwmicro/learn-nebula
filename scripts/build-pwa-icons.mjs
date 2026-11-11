// Draws the installed app's small icons into public/icons/ (committed, run
// by hand after changing a drawing here: `node scripts/build-pwa-icons.mjs`).
//
// - raccourci-*.png: the app shortcuts of app/manifest.ts (Android's long
//   press on the icon; Chrome asks for 96×96). Paper and ink of the logo, the
//   glyph inside the central 60% so a launcher's circle mask never clips it.
// - notification-badge.png: the status-bar symbol of the review reminder
//   (public/sw.js `badge`). Android paints only its alpha channel, in white,
//   so it is a plain silhouette on transparent: the logo's arch and sun.
//
// File names stay clear of Unix command names: the prod WAF refuses those
// (see CLAUDE.md).

import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const PAPER = "#dfd9c9";
const INK = "#171711";
const FERN = "#3d6846";
const SUN = "#c89227";
const OUT = new URL("../public/icons/", import.meta.url);

const line = `fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"`;

/** Glyphs drawn on a 96 grid, kept within 20..76. */
const SHORTCUTS = {
  // Two cards, the front one ticked: today's review.
  reviser: `
    <rect x="30" y="20" width="40" height="50" rx="6" ${line} transform="rotate(-10 50 45)"/>
    <rect x="26" y="28" width="40" height="50" rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="5.5"/>
    <path d="M35 54 l7 7 l14 -15" fill="none" stroke="${FERN}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  // A winding path between three stops: the reading paths.
  parcours: `
    <path d="M26 72 C26 52 70 60 70 42 C70 30 46 34 46 22" ${line} stroke-dasharray="0.1 9"/>
    <circle cx="26" cy="72" r="6" fill="${FERN}"/>
    <circle cx="70" cy="42" r="6" fill="${INK}"/>
    <circle cx="46" cy="22" r="7" fill="${SUN}"/>`,
  // A speech bubble with a voice wave: the spoken partner.
  parler: `
    <path d="M24 30 a8 8 0 0 1 8 -8 h32 a8 8 0 0 1 8 8 v22 a8 8 0 0 1 -8 8 h-20 l-12 11 v-11 h0 a8 8 0 0 1 -8 -8 z" ${line}/>
    <path d="M38 36 v10 M46 32 v18 M54 36 v10" fill="none" stroke="${FERN}" stroke-width="5.5" stroke-linecap="round"/>`,
  // A die: a note at random.
  hasard: `
    <rect x="24" y="24" width="48" height="48" rx="9" ${line}/>
    <circle cx="36" cy="36" r="4.5" fill="${INK}"/>
    <circle cx="48" cy="48" r="4.5" fill="${SUN}"/>
    <circle cx="60" cy="60" r="4.5" fill="${INK}"/>`,
};

function shortcutSvg(glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect width="96" height="96" fill="${PAPER}"/>${glyph}</svg>`;
}

// The logo's arch with the sun over its shoulder, white on transparent; a
// paper gap keeps the sun apart from the arch.
const BADGE = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs><mask id="m">
    <rect width="96" height="96" fill="#fff"/>
    <circle cx="66" cy="28" r="17" fill="#000"/>
  </mask></defs>
  <path d="M18 86 V44 a30 30 0 0 1 60 0 V86 Z" fill="#fff" mask="url(#m)"/>
  <circle cx="66" cy="28" r="12" fill="#fff"/>
</svg>`;

await mkdir(OUT, { recursive: true });
for (const [name, glyph] of Object.entries(SHORTCUTS)) {
  await sharp(Buffer.from(shortcutSvg(glyph)))
    .png({ palette: true, compressionLevel: 9 })
    .toFile(new URL(`raccourci-${name}.png`, OUT).pathname);
}
await sharp(Buffer.from(BADGE))
  .png({ compressionLevel: 9 })
  .toFile(new URL("notification-badge.png", OUT).pathname);
console.log("pwa icons: public/icons/ written");
