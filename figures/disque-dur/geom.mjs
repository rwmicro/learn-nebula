// Moving parts of the drive, drawn per frame in the page and once at build.
// Only kit functions are used, so the page can inline this source as is.
import { extrude, solidSvg, onTop, lineSvg, dotsSvg, iso, ring } from "../kit/iso-kit.mjs";

export const HD = {
  C: [51, 51],
  R: 47.5,
  PT: 13.3,
  Q: [121, 22],
  L: 70,
  rOut: 45,
  rIn: 21,
  CLAMP_Z: 14,
};

export function headAt(u) {
  const r = HD.rOut - u * (HD.rOut - HD.rIn);
  const dx = HD.C[0] - HD.Q[0];
  const dy = HD.C[1] - HD.Q[1];
  const D = Math.hypot(dx, dy);
  const cb = (HD.L * HD.L + D * D - r * r) / (2 * HD.L * D);
  const psi = Math.atan2(dy, dx) - Math.acos(Math.max(-1, Math.min(1, cb)));
  const x = HD.Q[0] + HD.L * Math.cos(psi);
  const y = HD.Q[1] + HD.L * Math.sin(psi);
  return { r, psi, x, y, alpha: Math.atan2(y - HD.C[1], x - HD.C[0]) };
}

function armPoints(psi, pts) {
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  return pts.map(([a, w]) => [HD.Q[0] + a * c - w * s, HD.Q[1] + a * s + w * c]);
}

export function coilSvg(psi, P) {
  const out = [];
  const body = armPoints(psi, [[-6, -7.5], [-6, 7.5], [-17, 9.5], [-17, -9.5]]);
  const loop = armPoints(psi, [[-8.5, -4.8], [-8.5, 4.8], [-14.6, 6], [-14.6, -6]]);
  out.push(solidSvg(extrude(body, 13, 1.4, P), { tone: "mid" }));
  out.push(lineSvg(onTop(loop, 14.4, P, true), { tone: "lo" }));
  out.push(solidSvg(extrude(armPoints(psi, [[-6.2, -2.4], [-6.2, 2.4], [-3.6, 2.4], [-3.6, -2.4]]), 13.4, 1.2, P), { tone: "mid" }));
  return out.join("");
}

export function armSvg(psi, P) {
  const out = [];
  const L = HD.L;
  out.push(solidSvg(extrude(armPoints(psi, [[L - 1.6, -1.3], [L - 1.6, 1.3], [L + 1.6, 1.3], [L + 1.6, -1.3]]), 13.55, 0.7, P), { tone: "hi", lit: true }));
  out.push(solidSvg(extrude(armPoints(psi, [[45, -2.4], [45, 2.4], [L + 0.6, 0.9], [L + 0.6, -0.9]]), 14.25, 0.35, P), { tone: "hi", lit: true }));
  out.push(solidSvg(extrude(armPoints(psi, [[2, -5.4], [2, 5.4], [48, 2.8], [48, -2.8]]), 14.6, 1, P), {
    tone: "hi",
    lit: true,
    inner: lineSvg(onTop(armPoints(psi, [[13, -3.4], [13, 3.4], [33, 2.2], [33, -2.2]]), 15.6, P, true), { tone: "lo" }),
  }));
  out.push(dotsSvg([iso([...armPoints(psi, [[46.4, 0]])[0], 15.6], P)], { size: 0.5, tone: "mid" }));
  return out.join("");
}

function arc(r, from, to, z, P) {
  const n = Math.max(3, Math.ceil(Math.abs(to - from) / 0.06));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([HD.C[0] + r * Math.cos(a), HD.C[1] + r * Math.sin(a)]);
  }
  return pts;
}

export function sectorSvg(r, lead, span, read, P) {
  const z = HD.PT;
  const band = (a0, a1) => [...arc(r + 2.2, a0, a1, z, P), ...arc(r - 2.2, a1, a0, z, P)];
  const out = [`<path style="fill:var(--anatomy-mid);fill-opacity:.38" d="${onTop(band(lead - span, lead), z, P, true)}"/>`];
  if (read > 0.002) out.push(`<path style="fill:var(--anatomy-hi);fill-opacity:.5" d="${onTop(band(lead - read, lead), z, P, true)}"/>`);
  out.push(lineSvg(onTop(band(lead - span, lead), z, P, true), { tone: "mid" }));
  return out.join("");
}

export function trackSvg(r, P) {
  return lineSvg(ring(HD.C[0], HD.C[1], r, HD.PT, P, 96), { tone: "lo" });
}

export function clampDotsSvg(theta, P) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = theta + (i * Math.PI) / 3;
    pts.push(iso([HD.C[0] + 10.5 * Math.cos(a), HD.C[1] + 10.5 * Math.sin(a), HD.CLAMP_Z], P));
  }
  const mark = theta + Math.PI / 6;
  const out = [dotsSvg(pts, { size: 0.55, tone: "mid" })];
  out.push(lineSvg(onTop([[HD.C[0] + 4 * Math.cos(mark), HD.C[1] + 4 * Math.sin(mark)], [HD.C[0] + 15.5 * Math.cos(mark), HD.C[1] + 15.5 * Math.sin(mark)]], HD.CLAMP_Z, P), { tone: "lo" }));
  return out.join("");
}
