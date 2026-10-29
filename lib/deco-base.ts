// Helpers and the growing plant shared by lib/deco-art.ts and
// lib/deco-bench.ts: kept apart so the note bundle can take one scene
// without the others.

export const inner = (svg: string) => svg.replace(/<\/?svg[^>]*>/g, "");

export function leafPair(x: number, y: number, s = 1): string {
  return (
    `<path d="M${x} ${y}c${-14 * s} ${-2 * s} ${-20 * s} ${-10 * s} ${-20 * s} ${-18 * s}c${10 * s} 0 ${18 * s} ${6 * s} ${20 * s} ${18 * s}z" fill="var(--f2)"/>` +
    `<path d="M${x} ${y}c${14 * s} ${-2 * s} ${20 * s} ${-10 * s} ${20 * s} ${-18 * s}c${-10 * s} 0 ${-18 * s} ${6 * s} ${-20 * s} ${18 * s}z" fill="var(--f1)"/>`
  );
}

export function sprout(x: number, base: number, h: number, s = 1): string {
  return `<path d="M${x} ${base}V${base - h}" stroke="var(--f0)" stroke-width="${3 * s}" stroke-linecap="round"/>` + leafPair(x, base - h, s);
}

export const svg = (viewBox: string, body: string) => `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

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
