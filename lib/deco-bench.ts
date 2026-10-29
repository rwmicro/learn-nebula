// An empty bench under a tree (no comments yet), apart from lib/deco-art.ts:
// comments.js is in the note bundle, which must not carry the other scenes.

import { inner, plant, svg } from "./deco-base";

export const BENCH = svg(
  "0 0 320 150",
  `<path d="M20 138c40-14 240-14 280 0z" fill="var(--ground)"/><g transform="translate(40 20) scale(1.1)">${inner(plant(3))}</g>` +
    `<g transform="translate(140 96)"><rect width="96" height="8" rx="3" fill="var(--f1)"/><rect y="-18" width="96" height="7" rx="3" fill="var(--f2)"/><g fill="var(--f0)"><rect x="8" y="6" width="6" height="26" rx="2"/><rect x="82" y="6" width="6" height="26" rx="2"/></g></g>` +
    `<g transform="translate(222 36)"><path d="M0 12c0-8 6-12 14-12h28c8 0 14 4 14 12s-6 12-14 12H22l-10 8 2-8C6 24 0 20 0 12z" fill="var(--deco-card)" stroke="var(--f2)" stroke-width="2.5"/><g fill="var(--f2)"><circle cx="18" cy="12" r="2.5"/><circle cx="28" cy="12" r="2.5"/><circle cx="38" cy="12" r="2.5"/></g></g>`,
);
