// Zoom and pan of a reading path's graph (components/paths/PathZoom.tsx) — the pure
// geometry: a view is a scale and the offset of the content's top-left corner
// in the viewport. Unit-tested in lib/zoom-pan.test.ts.

export interface View {
  s: number;
  x: number;
  y: number;
}
export interface Box {
  /** Viewport size. */
  vw: number;
  vh: number;
  /** Content size at scale 1. */
  cw: number;
  ch: number;
}

export const MAX_SCALE = 2.5;

/** Scale at which the whole content fits the viewport (never above 1). */
export function fitScale(b: Box): number {
  if (b.cw <= 0 || b.ch <= 0) return 1;
  return Math.min(1, b.vw / b.cw, b.vh / b.ch);
}

/** Opening scale of a drawing too big for its viewport: the whole width
 *  when that costs at most 30% of the size (boxes cut at both edges read as
 *  a broken layout), else natural size. */
export function openingScale(b: Box): number {
  if (b.cw <= 0) return 1;
  const w = Math.min(1, b.vw / b.cw);
  return w >= 0.7 ? w : 1;
}

/** Does the content fit at its natural size (no zoom needed)? */
export const fits = (b: Box) => b.cw <= b.vw + 1 && b.ch <= b.vh + 1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep the scale in [fit, MAX_SCALE] and the content over the viewport: a
 *  dimension smaller than the viewport is centred, a larger one can't leave
 *  a gap at either edge. */
export function clampView(v: View, b: Box): View {
  const s = clamp(v.s, fitScale(b), MAX_SCALE);
  const w = b.cw * s;
  const h = b.ch * s;
  const x = w <= b.vw ? (b.vw - w) / 2 : clamp(v.x, b.vw - w, 0);
  const y = h <= b.vh ? (b.vh - h) / 2 : clamp(v.y, b.vh - h, 0);
  return { s, x, y };
}

/** Zoom by `factor` keeping the content point under (px, py) — viewport
 *  coordinates — where it is. */
export function zoomAt(v: View, factor: number, px: number, py: number, b: Box): View {
  const s = clamp(v.s * factor, fitScale(b), MAX_SCALE);
  const lx = (px - v.x) / v.s;
  const ly = (py - v.y) / v.s;
  return clampView({ s, x: px - lx * s, y: py - ly * s }, b);
}

/** View at `s` with the content point (cx, cy) (scale-1 coordinates) at the
 *  viewport's centre, as far as the edges allow. */
export function centreOn(cx: number, cy: number, s: number, b: Box): View {
  return clampView({ s, x: b.vw / 2 - cx * s, y: b.vh / 2 - cy * s }, b);
}

/** Smallest pan that brings the content rectangle (scale-1 coordinates) into
 *  the viewport, with `margin` px to spare. */
export function reveal(
  v: View,
  r: { x: number; y: number; w: number; h: number },
  b: Box,
  margin = 16,
): View {
  let { x, y } = v;
  const left = r.x * v.s + x;
  const right = (r.x + r.w) * v.s + x;
  const top = r.y * v.s + y;
  const bottom = (r.y + r.h) * v.s + y;
  if (left < margin) x += margin - left;
  else if (right > b.vw - margin) x -= right - (b.vw - margin);
  if (top < margin) y += margin - top;
  else if (bottom > b.vh - margin) y -= bottom - (b.vh - margin);
  return clampView({ s: v.s, x, y }, b);
}
