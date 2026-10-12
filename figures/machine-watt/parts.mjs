import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import * as M from "./model.mjs";

export const PIV = [-10, 150];
export const AX = [85, 70];
export const CYLX = -105;
export const GLAND = 108;
export const GX = 172;
export const GY = -36;
export const HEAD = 152;
export const ARM = 40;
export const LNK = 22;
export const BELL = { x: 136, z: 95.5, a: 36, b: 16 };
export const ROD = { y: -33, z: 79.6, from: -215, to: 136 };
export const VALVE = { x: -215, z: 87.6, arm: 8 };
export const FLYY = -24;

const DEG = Math.PI / 180;
const Y = (o, y0) => G.frameOf([o[0], y0, o[1]], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const S = (paths, style) => k.solidSvg(paths, style);

export const bar = (a, b, y0, y1, w0, w1 = w0) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) / 2, nz = (dx / len) / 2;
  const poly = [[a[0] + nx * w0, a[1] + nz * w0], [b[0] + nx * w1, b[1] + nz * w1], [b[0] - nx * w1, b[1] - nz * w1], [a[0] - nx * w0, a[1] - nz * w0]];
  return { poly, y0, y1 };
};
export const barSvg = (P, a, b, y0, y1, w0, w1, style) => {
  const { poly } = bar(a, b, y0, y1, w0, w1);
  return S(G.prismOf(Y([0, 0], y0), poly, 0, y1 - y0, P), style);
};
const CACHE = new Map();
const kept = (key, make) => { if (!CACHE.has(key)) CACHE.set(key, make()); return CACHE.get(key); };
const moved = (P, at, svg) => `<g transform="${k.translateAlong(P, at)}">${svg}</g>`;
export const pinY = (P, at, r, y0, y1, style = { tone: "mid" }) => moved(P, [at[0], 0, at[1]], kept(`pin${r},${y0},${y1},${style.tone}`, () => S(G.disc(y0, y1, r, G.frameOf([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), style)));
const ball = (P, c, r, style) => moved(P, c, kept(`ball${r},${style.tone},${!!style.lit}`, () => S(G.sphereOf([0, 0, 0], r, P), style)));
const sleevePart = (P, z, r, h, style) => moved(P, [0, 0, z], kept(`sl${r},${h}`, () => S(k.cylinder(GX, GY, r, 0, h, P, 24), style)));

export function pose(s) {
  const L = M.linkage(s.theta);
  const zs = HEAD - 2 * LNK * Math.cos(s.phi);
  const gamma = Math.asin(Math.max(-1, Math.min(1, (zs - 22 - BELL.z) / BELL.a)));
  const shift = BELL.b * Math.sin(gamma);
  const delta = Math.asin(Math.max(-1, Math.min(1, shift / VALVE.arm)));
  return { ...L, zs, gamma, shift, delta, phi: s.phi, psi: s.psi, theta: s.theta };
}

export function valveCrank(P, q) {
  const piv = [VALVE.x, VALVE.z];
  const pin = [VALVE.x + VALVE.arm * Math.sin(q.delta), VALVE.z - VALVE.arm * Math.cos(q.delta)];
  return [
    barSvg(P, piv, pin, -37, -34.6, 4.4, 3, { tone: "mid" }),
    pinY(P, piv, 2.2, -37.4, -33.4),
    pinY(P, pin, 1.8, -34.6, -31.6),
  ].join("");
}

export function governor(P, q) {
  const head = [GX, GY, HEAD];
  const V = G.viewOf(P);
  const pairs = [0, Math.PI].map((off) => {
    const a = q.psi + off;
    const dir = [Math.sin(q.phi) * Math.cos(a), Math.sin(q.phi) * Math.sin(a), -Math.cos(q.phi)];
    const bc = G.add3(head, G.mul3(dir, ARM));
    const elbow = G.add3(head, G.mul3(dir, LNK));
    const foot = [GX + 3.4 * Math.cos(a), GY + 3.4 * Math.sin(a), q.zs + 1.5];
    const sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const armP = G.prismOf(G.frameAlong(head, dir), sq, 0, ARM - 6.2, P);
    const lnk = G.sub3(elbow, foot);
    const linkP = G.prismOf(G.frameAlong(foot, lnk), sq.map(([x, y]) => [x * 0.75, y * 0.75]), 0, G.len3(lnk), P);
    const svg = S(linkP, { tone: "mid" }) + S(armP, { tone: "hi", lit: true }) + ball(P, bc, 7, { tone: "hi", lit: true }) + ball(P, elbow, 1.5, { tone: "mid" });
    return { depth: G.dot3(bc, V) - G.dot3(head, V), svg };
  });
  const back = pairs.filter((p) => p.depth < 0).map((p) => p.svg).join("");
  const front = pairs.filter((p) => p.depth >= 0).map((p) => p.svg).join("");
  const sleeve = [
    sleevePart(P, q.zs - 24, 3.6, 3, { tone: "mid" }),
    sleevePart(P, q.zs - 21, 2.6, 22, { tone: "mid", crease: "none" }),
    sleevePart(P, q.zs - 20, 3.6, 3, { tone: "mid" }),
    sleevePart(P, q.zs - 1, 3.4, 4, { tone: "mid" }),
  ].join("");
  const bp = [BELL.x, BELL.z];
  const armA = [BELL.x + BELL.a * Math.cos(q.gamma), BELL.z + BELL.a * Math.sin(q.gamma)];
  const armB = [BELL.x + BELL.b * Math.sin(q.gamma), BELL.z - BELL.b * Math.cos(q.gamma)];
  const bell = [
    barSvg(P, bp, armA, -32.2, -30.4, 3.6, 2.4, { tone: "mid" }),
    barSvg(P, bp, armB, -32.2, -30.4, 3.6, 2.6, { tone: "mid" }),
    pinY(P, bp, 2.4, -33, -29.6),
    pinY(P, armB, 1.6, -32.2, -29.8),
  ].join("");
  const spindle = kept("spindle", () => S(k.cylinder(GX, GY, 1.6, 40, HEAD - 40, P, 16), { tone: "mid", crease: "none" }));
  const headSvg = ball(P, head, 3, { tone: "mid" });
  return back + spindle + sleeve + headSvg + bell + front;
}

export function spokes(P, theta) {
  const out = [];
  const F = Y([0, 0], FLYY - 1.4);
  for (let i = 0; i < 6; i++) {
    const a = theta + (i * Math.PI) / 3;
    const c = Math.cos(a), s = Math.sin(a);
    const at = (r, w) => [AX[0] + r * c - w * s, AX[1] + r * s + w * c];
    const poly = [at(7, 2.4), at(50, 1.5), at(50, -1.5), at(7, -2.4)];
    out.push({ z: Math.sin(a), svg: S(G.prismOf(F, poly, 0, 2.8, P), { tone: "mid" }) });
  }
  return out.map((o) => o.svg).join("");
}

export function leftEnd(q) {
  const lx = PIV[0] - M.BEAM.arm * Math.cos(q.beta);
  const lz = PIV[1] - M.BEAM.arm * Math.sin(q.beta);
  const ch = lz - Math.sqrt(14 * 14 - (lx - CYLX) ** 2);
  return { l: [lx, lz], ch };
}

export function piston(P, q) {
  const { ch } = leftEnd(q);
  return [
    S(k.cylinder(CYLX, 0, 1.8, GLAND, ch - 2 - GLAND, P, 16), { tone: "hi", crease: "none" }),
    S(k.slabOf({ x: CYLX - 6, y: -5, w: 12, d: 10, r: 1 }, ch - 2, 4, P, 2, 0.3), { tone: "mid" }),
  ].join("");
}

export function beam(P, q) {
  const c = Math.cos(q.beta), s = Math.sin(q.beta);
  const at = (t, d) => [PIV[0] + t * c - d * s, PIV[1] + t * s + d * c];
  const poly = [at(-101, -5), at(-60, -10), at(0, -13), at(60, -10), at(101, -5), at(101, 5), at(60, 10), at(0, 13), at(-60, 10), at(-101, 5)];
  const F = Y([0, 0], -4);
  const ends = [-101, 101].map((t) => S(G.prismOf(F, [at(t - Math.sign(t) * 7, -5.6), at(t, -5.6), at(t, 5.6), at(t - Math.sign(t) * 7, 5.6)], -0.6, 8.6, P), { tone: "mid" }));
  return S(G.prismOf(F, poly, 0, 8, P), { tone: "mid" }) + ends.join("") + pinY(P, PIV, 6, 4, 6.2);
}

function teeth(P, c, y, rot, n, r0, r1) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * 2 * Math.PI, w = Math.PI / n;
    for (const [da, r] of [[-w * 0.55, r0], [-w * 0.3, r1], [w * 0.3, r1], [w * 0.55, r0]]) pts.push([c[0] + r * Math.cos(a + da), y, c[1] + r * Math.sin(a + da)]);
  }
  return k.pathOf(pts.map((p) => k.iso(p, P)), true);
}

export function front(P, q) {
  const { l, ch } = leftEnd(q);
  const out = [];
  out.push(barSvg(P, [CYLX, ch], l, 5, 7, 3.2, 3.2, { tone: "mid" }));
  out.push(pinY(P, [CYLX, ch], 1.6, 5, 8));
  out.push(pinY(P, l, 2.4, 4, 8.4));
  const pumpX = PIV[0] - 30 * Math.cos(q.beta), pumpZ = PIV[1] - 30 * Math.sin(q.beta);
  out.push(S(k.cylinder(-40, 8, 1.4, 65, pumpZ - 65, P, 14), { tone: "hi", crease: "none" }));
  out.push(pinY(P, [pumpX, pumpZ], 2.6, 4, 10.2));
  const link = barSvg(P, AX, q.q, -5, -2, 5, 4, { tone: "mid" });
  const sunA = q.theta;
  const sun = pinY(P, AX, 9.6, 0, 6) + k.lineSvg(teeth(P, AX, 6, sunA, 16, 8.3, 9.6), { tone: "lo" });
  const rodAngle = Math.atan2(q.e[1] - q.q[1], q.e[0] - q.q[0]);
  const planet = pinY(P, q.q, 9.6, 0, 6) + k.lineSvg(teeth(P, q.q, 6, rodAngle, 16, 8.3, 9.6), { tone: "lo" });
  const sunDepth = G.dot3([AX[0], 3, AX[1]], G.viewOf(P)), planetDepth = G.dot3([q.q[0], 3, q.q[1]], G.viewOf(P));
  out.push(link);
  out.push(...(sunDepth < planetDepth ? [sun, planet] : [planet, sun]));
  out.push(pinY(P, AX, 3.4, 6, 9));
  out.push(barSvg(P, q.q, q.e, 7, 11, 6, 4, { tone: "mid" }));
  out.push(pinY(P, q.q, 4.4, 6, 11.4));
  out.push(pinY(P, q.e, 3.6, -5, 12));
  return out.join("");
}
