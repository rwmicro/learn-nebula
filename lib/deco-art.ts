// Small flat scenes for the rest of the site (empty states, endings, waits),
// in the road's style (lib/road-art.ts): three tones of a family colour
// (--f0 to --f3) and a ground, set on .deco / .road in app.css so they follow
// light and dark. Static strings: nothing from the vault goes into them.

import { ART, type ArtKey } from "./road-art";

const inner = (svg: string) => svg.replace(/<\/?svg[^>]*>/g, "");

function leafPair(x: number, y: number, s = 1): string {
  return (
    `<path d="M${x} ${y}c${-14 * s} ${-2 * s} ${-20 * s} ${-10 * s} ${-20 * s} ${-18 * s}c${10 * s} 0 ${18 * s} ${6 * s} ${20 * s} ${18 * s}z" fill="var(--f2)"/>` +
    `<path d="M${x} ${y}c${14 * s} ${-2 * s} ${20 * s} ${-10 * s} ${20 * s} ${-18 * s}c${-10 * s} 0 ${-18 * s} ${6 * s} ${-20 * s} ${18 * s}z" fill="var(--f1)"/>`
  );
}

function sprout(x: number, base: number, h: number, s = 1): string {
  return `<path d="M${x} ${base}V${base - h}" stroke="var(--f0)" stroke-width="${3 * s}" stroke-linecap="round"/>` + leafPair(x, base - h, s);
}

const svg = (viewBox: string, body: string) => `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

/** One plant in an 80×100 box, from sown (0) to a tree in bloom (4). */
export function plant(stage: 0 | 1 | 2 | 3 | 4): string {
  const ground = `<path d="M8 92c16-8 48-8 64 0z" fill="var(--ground)"/>`;
  const body = [
    `<ellipse cx="40" cy="86" rx="5" ry="3.5" fill="var(--f0)"/><path d="M33 78l-3-4M47 78l3-4M40 76v-5" stroke="var(--f2)" stroke-width="2.5" stroke-linecap="round"/>`,
    sprout(40, 88, 14, 0.7),
    `<path d="M40 88V44" stroke="var(--f0)" stroke-width="3.5" stroke-linecap="round"/>${leafPair(40, 70, 0.8)}${leafPair(40, 46, 0.9)}`,
    `<rect x="37" y="58" width="6" height="30" rx="3" fill="var(--f0)"/><circle cx="40" cy="44" r="22" fill="var(--f1)"/><circle cx="27" cy="54" r="13" fill="var(--f2)"/><circle cx="53" cy="54" r="13" fill="var(--f2)"/>`,
    `<rect x="36" y="56" width="8" height="32" rx="3" fill="var(--f0)"/><circle cx="40" cy="36" r="27" fill="var(--f1)"/><circle cx="22" cy="48" r="16" fill="var(--f2)"/><circle cx="58" cy="48" r="16" fill="var(--f2)"/><g fill="var(--blossom)"><circle cx="30" cy="24" r="4"/><circle cx="50" cy="20" r="4"/><circle cx="56" cy="40" r="4"/><circle cx="22" cy="44" r="4"/><circle cx="40" cy="38" r="4"/><circle cx="62" cy="54" r="3.5"/><circle cx="16" cy="56" r="3.5"/></g>`,
  ][stage];
  return svg("0 0 80 100", ground + body);
}

const can = (open: boolean) =>
  `<path d="M6 ${open ? 14 : 10}h${open ? 46 : 40}l${open ? -6 : -5} ${open ? 28 : 26}H${open ? 12 : 11}z" fill="var(--f1)"/>` +
  (open
    ? `<path d="M52 18c14-6 22-14 26-22" stroke="var(--f1)" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M14 14c0-12 30-12 30 0" fill="none" stroke="var(--f0)" stroke-width="4"/><g fill="var(--f2)"><circle cx="84" cy="2" r="2.5"/><circle cx="88" cy="10" r="2.5"/></g>`
    : `<path d="M46 14c12-2 20-8 24-16" stroke="var(--f1)" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M12 10c0-12 28-12 28 0" fill="none" stroke="var(--f0)" stroke-width="4"/>`);

export const SCENES = {
  /** 404: a sown bed with a "?" label, nothing up yet. */
  bed: svg(
    "0 0 320 160",
    `<circle cx="262" cy="34" r="16" fill="var(--f3)"/><path d="M14 140c40-26 252-26 292 0z" fill="var(--ground)"/>` +
      `<path d="M40 128c30-10 70-10 100 0M150 126c30-10 70-10 100 0" fill="none" stroke="var(--f3)" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>` +
      `<rect x="108" y="62" width="5" height="64" rx="2" fill="var(--f0)"/><rect x="80" y="54" width="62" height="34" rx="4" fill="var(--deco-card)" stroke="var(--f0)" stroke-width="3"/>` +
      `<text x="111" y="78" text-anchor="middle" font-family="Alegreya, serif" font-style="italic" font-size="20" fill="var(--f1)">?</text>` +
      sprout(196, 122, 8, 0.55) +
      `<g transform="translate(218 86)">${can(true)}</g>`,
  ),
  /** Nothing to review today: everything watered, the can at rest. */
  rest: svg(
    "0 0 320 160",
    `<circle cx="70" cy="40" r="18" fill="var(--f3)"/><g stroke="var(--f3)" stroke-width="3" stroke-linecap="round"><path d="M70 10v-6M70 76v-6M40 40h-6M106 40h-6M49 19l-4-4M95 19l4-4"/></g>` +
      `<path d="M10 142c50-20 250-20 300 0z" fill="var(--ground)"/>` +
      sprout(120, 132, 30, 1) + sprout(160, 130, 44, 1.15) + sprout(200, 132, 26, 0.95) +
      `<g transform="translate(232 98) rotate(8)">${can(false)}</g>`,
  ),
  /** End of a path: the road reaches a tree in bloom, with a bench and a flag. */
  done: svg(
    "0 0 360 200",
    `<path d="M0 178c60-18 300-18 360 0v22H0z" fill="var(--ground)"/>` +
      `<path d="M150 200c4-20 24-34 56-40" fill="none" stroke="var(--deco-road)" stroke-width="16" stroke-linecap="round"/>` +
      `<path d="M150 200c4-20 24-34 56-40" fill="none" stroke="var(--deco-card)" stroke-width="2.5" stroke-dasharray="6 9" stroke-linecap="round"/>` +
      `<g transform="translate(196 20) scale(1.5)">${inner(plant(4))}</g>` +
      `<g transform="translate(92 136)"><rect width="56" height="7" rx="3" fill="var(--f1)"/><rect y="-14" width="56" height="6" rx="3" fill="var(--f2)"/><g fill="var(--f0)"><rect x="5" y="6" width="5" height="16" rx="2"/><rect x="46" y="6" width="5" height="16" rx="2"/></g></g>` +
      `<g transform="translate(40 120)"><rect width="5" height="44" rx="2" fill="var(--f0)"/><path d="M5 2h34l-8 10 8 10H5z" fill="var(--deco-mark)"/></g>` +
      sprout(326, 176, 12, 0.7) + sprout(18, 172, 10, 0.6),
  ),
  /** Nothing saved yet: a seed packet. */
  packet: svg(
    "0 0 320 150",
    `<path d="M40 138c40-16 200-16 240 0z" fill="var(--ground)"/>` +
      `<g transform="rotate(-8 140 80)"><rect x="104" y="22" width="76" height="104" rx="6" fill="var(--f2)"/><path d="M104 22h76v14H104z" fill="var(--f0)"/><path d="M104 36l8 6 8-6 8 6 8-6 8 6 8-6 8 6 8-6 8 6" fill="none" stroke="var(--f0)" stroke-width="2"/><g transform="translate(110 54) scale(.8)">${inner(plant(3))}</g></g>` +
      `<g fill="var(--f0)"><ellipse cx="206" cy="126" rx="5" ry="3.5"/><ellipse cx="222" cy="122" rx="5" ry="3.5" transform="rotate(30 222 122)"/><ellipse cx="236" cy="128" rx="5" ry="3.5"/></g>` +
      sprout(258, 126, 10, 0.6),
  ),
  /** No search result: a magnifier over bare ground. */
  search: svg(
    "0 0 320 140",
    `<path d="M30 128c50-16 210-16 260 0z" fill="var(--ground)"/><circle cx="150" cy="70" r="34" fill="var(--f3)"/><circle cx="150" cy="70" r="34" fill="none" stroke="var(--f1)" stroke-width="9"/>` +
      `<path d="M176 96l26 26" stroke="var(--f0)" stroke-width="12" stroke-linecap="round"/><path d="M136 74c8 6 20 6 28 0" fill="none" stroke="var(--f2)" stroke-width="4" stroke-linecap="round"/>`,
  ),
  /** End of a review session: a basket of picked fruit. */
  basket: svg(
    "0 0 320 170",
    `<path d="M20 156c40-14 240-14 280 0z" fill="var(--ground)"/>` +
      `<g fill="var(--deco-fruit)"><circle cx="128" cy="78" r="15"/><circle cx="160" cy="70" r="16"/><circle cx="192" cy="80" r="15"/><circle cx="144" cy="94" r="14"/><circle cx="178" cy="96" r="14"/></g>` +
      `<g fill="var(--f1)"><path d="M160 54c4-8 12-10 18-8-4 6-10 8-18 8z"/><path d="M128 63c-2-8 2-14 8-16 0 6-4 12-8 16z"/></g>` +
      `<path d="M100 96h120l-14 54H114z" fill="var(--f2)"/><path d="M100 96h120" stroke="var(--f0)" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M108 112h104M112 128h96" stroke="var(--f1)" stroke-width="3" stroke-dasharray="8 6"/><path d="M118 96c0-50 84-50 84 0" fill="none" stroke="var(--f0)" stroke-width="5"/>` +
      `<circle cx="246" cy="148" r="9" fill="var(--deco-fruit)"/>`,
  ),
  /** Offline: rain over the bed, the plants fine. */
  rain: svg(
    "0 0 320 160",
    `<g fill="var(--f3)"><circle cx="120" cy="44" r="22"/><circle cx="150" cy="34" r="28"/><circle cx="186" cy="46" r="20"/><rect x="100" y="44" width="106" height="22" rx="11"/></g>` +
      `<g stroke="var(--f2)" stroke-width="3" stroke-linecap="round"><path d="M116 78l-4 10M140 82l-4 10M164 78l-4 10M188 82l-4 10M128 100l-4 10M176 100l-4 10"/></g>` +
      `<path d="M20 146c40-16 240-16 280 0z" fill="var(--ground)"/>` +
      sprout(120, 138, 18, 0.8) + sprout(160, 136, 26, 0.95) + sprout(200, 138, 16, 0.75) +
      `<g transform="translate(236 100)"><path d="M0 22c0-14 10-22 22-22s22 8 22 22z" fill="var(--f1)"/><path d="M22 22v18c0 4-6 4-6 0" fill="none" stroke="var(--f0)" stroke-width="3" stroke-linecap="round"/></g>`,
  ),
  /** Login link sent: a garden letterbox with its flag up. */
  mailbox: svg(
    "0 0 320 160",
    `<path d="M20 146c40-16 240-16 280 0z" fill="var(--ground)"/><rect x="148" y="84" width="8" height="58" rx="3" fill="var(--f0)"/>` +
      `<path d="M112 56h60c10 0 18 8 18 18v18h-96V74c0-10 8-18 18-18z" fill="var(--f1)"/><path d="M94 74c0-10 8-18 18-18s18 8 18 18v18H94z" fill="var(--f2)"/>` +
      `<rect x="184" y="44" width="5" height="34" rx="2" fill="var(--f0)"/><path d="M189 44h18v12h-18z" fill="var(--deco-mark)"/>` +
      `<g transform="translate(206 78) rotate(-14)"><rect width="50" height="34" rx="4" fill="var(--deco-card)" stroke="var(--f0)" stroke-width="2.5"/><path d="M2 3l23 17 23-17" fill="none" stroke="var(--f0)" stroke-width="2.5"/></g>` +
      sprout(70, 140, 16, 0.7) + sprout(250, 140, 12, 0.6),
  ),
  /** No comment yet: an empty bench under a tree. */
  bench: svg(
    "0 0 320 150",
    `<path d="M20 138c40-14 240-14 280 0z" fill="var(--ground)"/><g transform="translate(40 20) scale(1.1)">${inner(plant(3))}</g>` +
      `<g transform="translate(140 96)"><rect width="96" height="8" rx="3" fill="var(--f1)"/><rect y="-18" width="96" height="7" rx="3" fill="var(--f2)"/><g fill="var(--f0)"><rect x="8" y="6" width="6" height="26" rx="2"/><rect x="82" y="6" width="6" height="26" rx="2"/></g></g>` +
      `<g transform="translate(222 36)"><path d="M0 12c0-8 6-12 14-12h28c8 0 14 4 14 12s-6 12-14 12H22l-10 8 2-8C6 24 0 20 0 12z" fill="var(--deco-card)" stroke="var(--f2)" stroke-width="2.5"/><g fill="var(--f2)"><circle cx="18" cy="12" r="2.5"/><circle cx="28" cy="12" r="2.5"/><circle cx="38" cy="12" r="2.5"/></g></g>`,
  ),
  /** Duel, waiting: a table with a board and two chairs, one for the guest. */
  duel: svg(
    "0 0 320 160",
    `<path d="M20 148c40-14 240-14 280 0z" fill="var(--ground)"/><rect x="118" y="84" width="84" height="8" rx="3" fill="var(--f0)"/><rect x="156" y="92" width="8" height="48" rx="2" fill="var(--f0)"/>` +
      `<g transform="translate(136 64)">${[0, 1, 2, 3].map((i) => `<rect x="${i * 12}" y="${i % 2 ? 8 : 0}" width="12" height="8" fill="var(--f2)"/><rect x="${i * 12}" y="${i % 2 ? 0 : 8}" width="12" height="8" fill="var(--f3)"/>`).join("")}<rect y="16" width="48" height="4" fill="var(--f1)"/></g>` +
      `<g transform="translate(70 60)" fill="var(--f1)"><rect width="8" height="80" rx="3"/><rect y="40" width="40" height="8" rx="3"/><rect x="32" y="44" width="6" height="36" rx="2"/></g>` +
      `<g transform="translate(212 60)" fill="var(--f2)"><rect x="32" width="8" height="80" rx="3"/><rect y="40" width="40" height="8" rx="3"/><rect x="2" y="44" width="6" height="36" rx="2"/></g>`,
  ),
} as const;

export type SceneKey = keyof typeof SCENES;

/** A small ornament between a note's sections. */
export const FLEURON = svg(
  "0 0 120 24",
  `<path d="M6 14h38M76 14h38" stroke="var(--f3)" stroke-width="2" stroke-linecap="round"/>${leafPair(60, 18, 0.55)}<path d="M60 22v-6" stroke="var(--f0)" stroke-width="2" stroke-linecap="round"/>`,
);

/** The vignette that closes a note: an open book and a sprout. */
export const CUL_DE_LAMPE = svg(
  "0 0 160 70",
  `<path d="M20 62c30-8 90-8 120 0z" fill="var(--ground)"/><g transform="translate(46 0) scale(.68)">${inner(ART.book)}</g>${sprout(116, 60, 18, 0.7)}`,
);

/** A deck as a seed drawer, with its theme's drawing on the corner. */
export function drawer(k: ArtKey): string {
  return svg(
    "0 0 120 80",
    `<rect x="4" y="10" width="112" height="64" rx="6" fill="var(--f2)"/><rect x="12" y="18" width="96" height="48" rx="4" fill="var(--f3)"/><rect x="46" y="38" width="28" height="7" rx="3.5" fill="var(--f0)"/><g transform="translate(82 -4) scale(.42)">${inner(ART[k])}</g>`,
  );
}

/** Quiz feedback: a leaf unfolds on a right answer… */
export const FEEDBACK_GOOD = svg(
  "0 0 80 60",
  `<path d="M10 56c20-6 40-6 60 0z" fill="var(--ground)"/>${sprout(40, 54, 18, 0.8)}<path d="M40 40c6-10 16-14 24-12-4 8-14 12-24 12z" fill="var(--f1)"/><g fill="var(--deco-mark)"><circle cx="64" cy="14" r="3"/><circle cx="18" cy="20" r="2.5"/><circle cx="56" cy="6" r="2"/></g>`,
);
/** …and on a wrong one the sprout only bends under a passing cloud. */
export const FEEDBACK_BAD = svg(
  "0 0 80 60",
  `<path d="M10 56c20-6 40-6 60 0z" fill="var(--ground)"/><path d="M40 54c0-10 4-18 12-22" fill="none" stroke="var(--f0)" stroke-width="2.4" stroke-linecap="round"/>${leafPair(52, 32, 0.6)}<g transform="translate(16 18)"><path d="M0 8c0-5 4-8 8-8s8 3 8 8" fill="var(--f3)"/><path d="M4 14l-1 4M10 14l-1 4" stroke="var(--f2)" stroke-width="2" stroke-linecap="round"/></g>`,
);

/** The week as seven pots: a read day sprouts, taller as the streak runs.
 *  `done[i]` for Monday..Sunday, `today` its index. */
export function weekPots(done: readonly boolean[], today: number): string[] {
  let streak = 0;
  return done.map((d, i) => {
    streak = d ? streak + 1 : 0;
    const h = 8 + Math.min(streak, 5) * 7;
    const seed = i === today && !d ? `<ellipse cx="22" cy="42" rx="3.5" ry="2.5" fill="var(--f0)"/>` : "";
    return svg(
      "0 0 44 70",
      `<path d="M8 48h28l-4 18H12z" fill="${d ? "var(--f1)" : "var(--deco-empty)"}"/><rect x="5" y="44" width="34" height="7" rx="2" fill="${d ? "var(--f0)" : "var(--deco-empty-2)"}"/>${d ? sprout(22, 44, h, 0.62) : seed}`,
    );
  });
}

/** Three frames of a seed coming up, shown one after the other while loading. */
export const LOADING_FRAMES = [plant(0), plant(1), plant(2)];
