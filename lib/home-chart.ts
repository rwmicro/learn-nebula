// The desktop home's "Un graphique, trois paragraphes" card draws the latest
// graphique note's first Our World in Data series as a small area chart, at
// build (no script): gridlines every "nice" step, the first and last years,
// and the first and last values labelled. Colours are the site's tokens, so
// the chart follows light/dark and the card's family.

export interface ChartPoint {
  x: number;
  y: number;
}

const W = 360;
const H = 220;
const L = 34;
const R = 346;
const TOP = 14;
const BOT = 190;

/** A step of 1, 2, 2.5 or 5 × 10^n giving about `n` intervals. */
export function niceStep(max: number, n = 5): number {
  const raw = max / n || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v);

const text = (x: number, y: number, s: string, attrs = "") =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="11" fill="var(--muted)" font-family="var(--font-ui)"${attrs}>${s}</text>`;

/** The SVG for one series of [year, value] points, or "" with fewer than two. */
export function areaChartSvg(points: [number, number][], unit = ""): string {
  const pts = points.filter(([, v]) => Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) return "";
  const x0 = pts[0][0];
  const x1 = pts[pts.length - 1][0];
  const top = Math.max(...pts.map(([, v]) => v));
  const step = niceStep(top);
  const ymax = Math.ceil(top / step) * step || 1;
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (R - L);
  const sy = (y: number) => BOT - (y / ymax) * (BOT - TOP);
  const u = unit === "%" ? " %" : "";
  const out: string[] = [];
  for (let v = 0; v <= ymax + step / 2; v += step) {
    const y = sy(v);
    out.push(`<line x1="${L}" x2="${R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--rule)" stroke-width="1"/>`);
    out.push(text(L - 6, y + 4, `${fmt(v)}${u}`, ` text-anchor="end"`));
  }
  // The first and last years, and the round decades between when they fit.
  const years = [x0, ...Array.from({ length: 10 }, (_, i) => Math.ceil(x0 / 10) * 10 + i * 10).filter((y) => y > x0 + 4 && y < x1 - 4), x1];
  for (const y of years) out.push(text(sx(y), 210, String(y), ` text-anchor="middle"`));
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  out.push(`<path d="${line} L${R.toFixed(1)},${BOT.toFixed(1)} L${L.toFixed(1)},${BOT.toFixed(1)} Z" fill="var(--fam-wash, var(--garden-wash))"/>`);
  out.push(`<path d="${line}" fill="none" stroke="var(--fam, var(--garden))" stroke-width="2.5" stroke-linejoin="round"/>`);
  const [a, b] = [pts[0], pts[pts.length - 1]];
  out.push(`<circle cx="${sx(a[0]).toFixed(1)}" cy="${sy(a[1]).toFixed(1)}" r="4" fill="var(--fam, var(--garden))"/>`);
  out.push(`<circle cx="${sx(b[0]).toFixed(1)}" cy="${sy(b[1]).toFixed(1)}" r="4" fill="var(--fam, var(--garden))"/>`);
  const label = (x: number, y: number, v: number, end: boolean) =>
    `<text x="${(x + (end ? -6 : 8)).toFixed(1)}" y="${(y - (end ? 10 : 4)).toFixed(1)}"${end ? ` text-anchor="end"` : ""} font-size="12" font-weight="600" fill="var(--ink)" font-family="var(--font-ui)">${fmt(v)}${u}</text>`;
  out.push(label(sx(a[0]), sy(a[1]), a[1], false));
  out.push(label(sx(b[0]), sy(b[1]), b[1], true));
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-hidden="true">${out.join("")}</svg>`;
}
