import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import * as M from "./model.mjs";
import * as W from "./parts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const title = "Machine de Watt";

const WIDTH = 600;
const HEIGHT = 390;
const AZ = 58;

const PLATE = { x: -268, y: -84, w: 470, d: 128, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [-10, 0, 186],
    [-110, 0, 172],
    [86, 4, 184],
    [W.GX, W.GY, 166],
    [-215, -46, 136],
  ],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: AZ },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const slab = (x0, x1, y0, y1, z0, z1, steps = 2, bevel = 0) => k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0.6 }, z0, z1 - z0, P, steps, bevel);
const along = (o, a) => G.frameOf(o, a, Math.abs(a[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], Math.abs(a[2]) > 0.9 ? [0, 1, 0] : G.cross3(a, [0, 0, 1]));
const pipe = (a, b, r, style = { tone: "mid" }) => {
  const d = G.sub3(b, a);
  const len = G.len3(d);
  return S(G.disc(0, len, r, G.frameAlong(a, d), P), style);
};
const elbow = (c, r) => S(G.sphereOf(c, r, P), { tone: "mid" });
const flange = (c, a, r, t = 1.6) => S(G.disc(-t / 2, t / 2, r, G.frameAlong(c, a), P), { tone: "mid" });

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const strip = { x: -150, y: PLATE.y + PLATE.d - 16, w: 250, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3, 0.6]), at([strip.x + strip.w - 2, strip.y + 3, 0.6])], { size: 0.45 }));
  const label = { x: 128, y: 16, w: 44, d: 14, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 3), { tone: "faint" }));
  for (const [i, len] of [[0, 30], [1, 22], [2, 26]]) out.push(L(k.lineOnTop([label.x + 5, label.y + 4 + i * 3], [label.x + 5 + len, label.y + 4 + i * 3], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + 2.6, label.y + 2.6, 0.8]), at([label.x + label.w - 2.6, label.y + label.d - 2.6, 0.8])], { size: 0.4 }));
  return out.join("");
}

function boiler() {
  const out = [];
  const B = { x: -256, y: -70, w: 82, d: 48, r: 1 };
  out.push(`<path class="iso-halo" d="${k.haloOf(B, 0, 4, P)}" style="filter:blur(3px)"/>`);
  const seams = [5, 10, 15].map((z) => k.sideSeam(B, z, P, 2)).join("");
  out.push(S(k.slabOf(B, 0, 20, P, 2, 0.5), { tone: "lo", inner: L(seams, { tone: "faint" }) }));
  const door = { x: -238, y: B.y + B.d, w: 16, d: 1.4, r: 0.4 };
  out.push(S(k.slabOf(door, 4, 11, P, 2, 0.3), { tone: "mid" }));
  out.push(S(k.slabOf({ x: -232, y: door.y + 1.4, w: 4, d: 1.6, r: 0.5 }, 9, 1.6, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: -206, y: B.y + B.d, w: 14, d: 1.2, r: 0.4 }, 2, 6, P, 2), { tone: "mid" }));
  const F = G.frameOf([-250, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const prof = [[-66, 20], [-26, 20], [-26, 42]];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; prof.push([-46 + 20 * Math.cos(a), 42 + 20 * Math.sin(a)]); }
  prof.push([-66, 42]);
  out.push(S(G.prismOf(F, prof, 2, 70, P), { tone: "mid" }));
  const rivets = [];
  for (const s of [14, 36, 58]) for (let i = 1; i < 10; i++) { const a = (i / 10) * Math.PI; rivets.push(at([-250 + s, -46 + 20.4 * Math.cos(a), 42 + 20.4 * Math.sin(a)])); }
  out.push(D(rivets, { size: 0.4, tone: "lo" }));
  const ZF = G.frameOf([-215, -46, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  out.push(S(G.solidOf([[60, 8], [70, 8], [72, 6.5, 1], [73, 4.5]], ZF, P), { tone: "mid" }));
  const SV = G.frameOf([-240, -46, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  out.push(S(G.solidOf([[60, 3.4], [67, 3.4], [67, 2], [70, 2]], SV, P), { tone: "mid" }));
  out.push(W.barSvg(P, [-240, 69.4], [-258, 69.4], -47, -45, 1.8, 1.4, { tone: "mid" }));
  out.push(S(k.cylinder(-255, -46, 3, 63, 5, P, 18), { tone: "mid" }));
  out.push(S(G.disc(-1, 1, 1.2, G.frameOf([-240, -46, 69.4], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: "mid" }));
  return out.join("");
}

function steamMain() {
  const out = [];
  const R = 3.6;
  out.push(pipe([-215, -46, 72.5], [-215, -46, 80], R));
  out.push(flange([-215, -46, 80], [0, 0, 1], 6));
  const VF = G.frameOf([-215, -46, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const bulge = [];
  for (let i = 0; i <= 12; i++) { const s = 80.8 + (i / 12) * 13.6; bulge.push([s, 4.6 + 3 * Math.sin((Math.PI * i) / 12), 1]); }
  out.push(S(G.solidOf(bulge, VF, P), { tone: "mid" }));
  out.push(flange([-215, -46, 95.2], [0, 0, 1], 6));
  out.push(pipe([-215, -40, W.VALVE.z], [-215, -37.4, W.VALVE.z], 2.6));
  out.push(pipe([-215, -46, 96], [-215, -46, 130 - R * 0.9], R));
  out.push(elbow([-215, -46, 130], R * 1.35));
  out.push(pipe([-215 + R * 1.2, -46, 130], [-105 - R * 1.2, -46, 130], R));
  out.push(flange([-160, -46, 130], [1, 0, 0], 5.6));
  out.push(D(G.dotsOf(G.frameAlong([-160, -46, 130], [1, 0, 0]), 0.8, 4.4, 6, P, { fade: [0.04, 0.42] }), { size: 0.4 }));
  out.push(elbow([-105, -46, 130], R * 1.35));
  out.push(pipe([-105, -46 + R * 1.2, 130], [-105, -24 - R * 1.2, 130], R));
  out.push(elbow([-105, -24, 130], R * 1.35));
  return out.join("");
}

function axlePiece(y0, y1) {
  return S(G.disc(y0, y1, 4, G.frameOf([W.AX[0], 0, W.AX[1]], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: "mid", crease: "none" });
}

function pedestal(y0, y1) {
  const out = [];
  out.push(S(slab(70, 100, y0 - 2, y1 + 2, 0, 4, 2, 0.4), { tone: "lo" }));
  out.push(S(slab(76, 94, y0, y1, 4, 62, 2, 0.4), { tone: "mid", inner: L(k.sideSeam({ x: 76, y: y0, w: 18, d: y1 - y0, r: 0.6 }, 30, P, 2), { tone: "faint" }) }));
  out.push(S(slab(74, 96, y0 - 0.5, y1 + 0.5, 62, 70, 2, 0.4), { tone: "mid" }));
  out.push(S(slab(75, 95, y0, y1, 70, 77, 2, 0.4), { tone: "mid" }));
  out.push(D([at([77.5, (y0 + y1) / 2, 77]), at([92.5, (y0 + y1) / 2, 77]), at([72, y1 + 1, 4]), at([98, y1 + 1, 4])], { size: 0.45 }));
  return out.join("");
}

function driveBelt() {
  const out = [];
  const yb = -52.2;
  const a = [W.AX[0], W.AX[1]], b = [W.GX, 31];
  const ra = 12, rb = 7;
  out.push(S(G.disc(-58, -52, ra, G.frameOf([a[0], 0, a[1]], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: "mid" }));
  out.push(axlePiece(-60, -58));
  const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz);
  const base = Math.atan2(dz, dx), off = Math.acos((ra - rb) / d);
  const belt = [];
  for (const sgn of [1, -1]) {
    const t = base + sgn * off;
    const pa = [a[0] + ra * Math.cos(t), yb, a[1] + ra * Math.sin(t)];
    const pb = [b[0] + rb * Math.cos(t), yb, b[1] + rb * Math.sin(t)];
    belt.push(k.segment(pa, pb, P));
  }
  out.push(S(G.disc(-58, -52, rb, G.frameOf([b[0], 0, b[1]], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: "mid" }));
  out.push(L(belt.join(""), { tone: "hi" }));
  return out.join("");
}

function govStand() {
  const out = [];
  out.push(S(slab(126, 192, -50, -22, 0, 5, 2, 0.5), { tone: "lo" }));
  out.push(D([at([129, -24, 5]), at([189, -24, 5]), at([129, -48, 5]), at([189, -48, 5])], { size: 0.45 }));
  out.push(S(slab(164, 180, -50, -42, 5, 27, 2, 0.4), { tone: "mid" }));
  out.push(S(G.disc(-60, -38, 2, G.frameOf([W.GX, 0, 31], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: "mid", crease: "none" }));
  out.push(S(G.disc(-41, -38, 5, G.frameOf([W.GX, 0, 31], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: "mid" }));
  out.push(S(slab(166, 178, -42, -30, 5, 30, 2, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(W.GX, W.GY, 5, 36, 3, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(W.GX, W.GY, 3, 39, 3, P, 18), { tone: "mid" }));
  out.push(S(k.cylinder(W.BELL.x, W.GY, 4.4, 5, 3, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(W.BELL.x, W.GY, 2.4, 8, W.HEAD + 10 - 8, P, 16), { tone: "mid", crease: "none", inner: L([60, 100].map((z) => k.sideArc(W.BELL.x, W.GY, 2.4, z, P, 10)).join(""), { tone: "faint" }) }));
  out.push(S(slab(W.BELL.x - 2.4, W.GX + 4, W.GY - 2, W.GY + 2, W.HEAD + 8, W.HEAD + 12, 2, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(W.GX, W.GY, 3.4, W.HEAD + 4, 8.6, P, 20), { tone: "mid" }));
  out.push(D([at([W.BELL.x + 4, W.GY, W.HEAD + 12]), at([W.GX - 6, W.GY, W.HEAD + 12])], { size: 0.4 }));
  return out.join("");
}

const STRIP = { x: -150, y: 28, w: 250 };
const loadX = (v) => STRIP.x + 8 + ((v - M.LOAD.low) / (M.LOAD.high - M.LOAD.low)) * (STRIP.w - 16);
function pointer() {
  const t = STRIP.y + 6;
  return [
    S(k.extrude([[-4.5, t + 6], [4.5, t + 6], [0, t]], 0, 2.4, P), { tone: "hi" }),
    S(k.slabOf({ x: -5, y: t + 6, w: 10, d: 3.4, r: 0.8 }, 0, 4, P, 2, 0.4), { tone: "mid" }),
    S(k.cylinder(0, t + 7.7, 1.6, 4, 2.6, P, 16), { tone: "mid" }),
  ].join("");
}

function regRod() {
  const len = W.ROD.to - W.ROD.from;
  return S(k.slabOf({ x: W.ROD.from, y: W.ROD.y - 1.1, w: len, d: 2.2, r: 1 }, W.ROD.z - 1.1, 2.2, P, 3), { tone: "mid", crease: "none" });
}

function rodGuide() {
  return [
    S(slab(-12, -8, -31, -6.6, W.ROD.z - 3, W.ROD.z - 0.8, 2), { tone: "mid" }),
    S(slab(-13.5, -6.5, -36.5, -29.5, W.ROD.z - 3.2, W.ROD.z + 3.6, 2, 0.3), { tone: "mid" }),
    D([at([-10, -33, W.ROD.z + 3.6])], { size: 0.45 }),
  ].join("");
}

function cylinderSet() {
  const out = [];
  out.push(S(slab(-112, -98, -28, -20, 84, 108, 2, 0.4), { tone: "mid" }));
  out.push(pipe([-105, -24, 108], [-105, -24, 130 - 4.6], 3.6));
  const stone = { x: -132, y: -26, w: 54, d: 52, r: 1 };
  out.push(`<path class="iso-halo" d="${k.haloOf(stone, 0, 3, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf(stone, 0, 8, P, 2, 0.6), { tone: "lo" }));
  out.push(D([at([-128, 22, 8]), at([-82, 22, 8]), at([-128, -22, 8])], { size: 0.45 }));
  const F = G.frameOf([W.CYLX, 0, 8], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const seams = [24, 46, 68].map((s) => G.arcOf(F, s, 20, P)).join("");
  out.push(S(G.disc(0, 4, 23, F, P), { tone: "mid" }));
  out.push(S(G.disc(4, 86, 20, F, P), { tone: "mid", inner: L(seams, { tone: "faint" }) }));
  out.push(S(G.disc(86, 90, 22.6, F, P), { tone: "mid" }));
  out.push(D(G.dotsOf(F, 4, 21.6, 16, P, { fade: [0.04, 0.42] }), { size: 0.4 }));
  out.push(D(G.dotsOf(F, 90, 21, 16, P, { all: true }), { size: 0.4 }));
  out.push(S(G.disc(90, 93, 15, F, P), { tone: "mid" }));
  out.push(S(G.disc(93, 97, 5, F, P), { tone: "mid" }));
  out.push(S(G.disc(97, 100, 6, F, P), { tone: "mid" }));
  out.push(D(G.dotsOf(F, 100, 4.6, 4, P, { all: true }), { size: 0.4 }));
  out.push(pipe([-87.5, -8, 20], [-75.6, -8, 20], 3.4));
  out.push(flange([-75.6, -8, 20], [1, 0, 0], 5.6, 1.2));
  return out.join("");
}

function cistern() {
  const out = [];
  const C = { x: -74, y: -24, w: 46, d: 48, r: 1.2 };
  out.push(S(k.slabOf(C, 0, 30, P, 3, 0.8), { tone: "lo", inner: L(k.sideSeam(C, 15, P, 3), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(C, 2.4), 30, P, 3), { tone: "lo" }));
  const water = [];
  for (const y of [-12, -2, 18]) water.push(k.lineOnTop([C.x + 2.4, y], [C.x + C.w - 2.4, y], 30, P));
  out.push(L(water.join(""), { tone: "faint" }));
  const CF = G.frameOf([-60, -8, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const dome = [[32, 8], [50, 8, 1]];
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); dome.push([50 + 7 * Math.sin(a), Math.max(0.01, 8 * Math.cos(a)), 1]); }
  out.push(S(G.disc(30, 32, 9.6, CF, P), { tone: "mid" }));
  out.push(S(G.solidOf(dome, CF, P), { tone: "mid", inner: L(G.arcOf(CF, 42, 8, P), { tone: "faint" }) }));
  const AF = G.frameOf([-40, 8, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  for (const [a, b, r] of [[30, 32, 8.6], [32, 57, 7], [57, 60, 8.4], [60, 64, 3], [64, 65, 3.6]]) out.push(S(G.disc(a, b, r, AF, P), { tone: "mid" }));
  out.push(D(G.dotsOf(AF, 60, 6.6, 8, P, { all: true }), { size: 0.4 }));
  return out.join("");
}

function columnSet(half) {
  const out = [];
  if (half === "back") {
    out.push(S(slab(-24, 4, -14, 14, 0, 7, 2, 0.5), { tone: "lo" }));
    out.push(D([at([-21, 11, 7]), at([1, 11, 7]), at([-21, -11, 7])], { size: 0.45 }));
    const F = G.frameOf([-10, 0, 7], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    out.push(S(G.solidOf([[0, 10], [3, 10], [5, 8, 1], [7, 7], [112, 6.2], [114, 8], [119, 8, 1], [121, 10.6]], F, P), { tone: "mid", inner: L(G.arcOf(F, 60, 6.6, P, { slope: -0.0076 }), { tone: "faint" }) }));
    out.push(S(slab(-25, 5, -17, 17, 128, 135, 2, 0.6), { tone: "mid" }));
    out.push(S(slab(-18, -2, -16, -6, 135, 147, 2, 0.4), { tone: "mid" }));
    out.push(S(slab(-17, -3, -16, -6, 147, 153, 2, 0.3), { tone: "mid" }));
    out.push(D([at([-15, -11, 153]), at([-5, -11, 153])], { size: 0.45 }));
    out.push(S(G.disc(-16, 16, 3, G.frameOf([-10, 0, 150], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: "mid", crease: "none" }));
  } else {
    out.push(S(slab(-18, -2, 6, 16, 135, 147, 2, 0.4), { tone: "mid" }));
    out.push(S(slab(-17, -3, 6, 16, 147, 153, 2, 0.3), { tone: "mid" }));
    out.push(D([at([-15, 11, 153]), at([-5, 11, 153])], { size: 0.45 }));
    out.push(S(G.disc(16, 18, 3.8, G.frameOf([-10, 0, 150], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: "mid" }));
  }
  return out.join("");
}

function flywheelRim() {
  const F = G.frameOf([W.AX[0], 0, W.AX[1]], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  return S(G.ringBand(W.FLYY - 3, W.FLYY + 3, 49, 55, F, P, { hole: [W.FLYY + 3, 49] }), { tone: "mid", inner: L(G.arcOf(F, W.FLYY, 55, P, { least: -1 }), { tone: "faint" }) });
}
function flywheelHub() {
  const F = G.frameOf([W.AX[0], 0, W.AX[1]], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  return S(G.disc(W.FLYY - 5, W.FLYY + 5, 8.5, F, P), { tone: "mid" }) + D(G.dotsOf(F, W.FLYY + 5, 6, 6, P, { all: true }), { size: 0.4 });
}

const start = M.settled(1);
const q0 = W.pose(start);
const g = (name, inner, transform) => `<g data-part="${name}"${transform ? ` transform="${transform}"` : ""}>${inner}</g>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Maquette d'une machine à vapeur rotative de Watt sur un socle : à gauche la chaudière en maçonnerie et sa conduite de vapeur avec la vanne d'admission, puis le cylindre et son piston, le condenseur séparé et la pompe à air dans une bâche d'eau froide, la colonne qui porte le balancier, la bielle, l'engrenage soleil et planète et le volant d'inertie. À droite, le régulateur à boules entraîné par une courroie depuis l'arbre du volant ; une longue tringle le relie à la vanne. Quand la charge baisse, le volant accélère, les boules s'écartent et montent, et la tringle referme la vanne.",
  body: [
    base(),
    boiler(),
    steamMain(),
    g("valve", W.valveCrank(P, q0)),
    pedestal(-48, -40),
    driveBelt(),
    axlePiece(-52, -48),
    govStand(),
    g("rod", regRod(), k.translateAlong(P, [q0.shift, 0, 0])),
    rodGuide(),
    g("gov", W.governor(P, q0)),
    axlePiece(-40, -29),
    flywheelRim(),
    g("spokes", W.spokes(P, q0.theta)),
    flywheelHub(),
    axlePiece(-19, -16),
    pedestal(-16, -8),
    axlePiece(-8, 0),
    cylinderSet(),
    g("piston", W.piston(P, q0)),
    cistern(),
    columnSet("back"),
    g("beam", W.beam(P, q0)),
    columnSet("front"),
    g("front", W.front(P, q0)),
    g("pointer", pointer(), k.translateAlong(P, [loadX(1), 0, 0])),
  ],
});

const strip = (src) => src.replace(/^import .*$/gm, "").replace(/^export /gm, "");
const model = strip(readFileSync(join(HERE, "model.mjs"), "utf8"));
const parts = strip(readFileSync(join(HERE, "parts.mjs"), "utf8"));
const lathe = strip(readFileSync(join(HERE, "..", "kit", "lathe.mjs"), "utf8"));

const live = `
${model}
const M = { linkage, BEAM, GOV };
const k = K;
const G = (() => {
${lathe}
return { prismOf, sphereOf, disc, frameOf, frameAlong, viewOf, dot3, add3, sub3, mul3, len3 };
})();
${parts}
const P = ${JSON.stringify(P)};
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const loadX = ${loadX.toString().replace(/STRIP\.x/g, STRIP.x).replace(/STRIP\.w/g, STRIP.w).replace(/M\.LOAD/g, "LOAD")};
const el = { pointer: part("pointer"), valve: part("valve"), rod: part("rod"), gov: part("gov"), spokes: part("spokes"), piston: part("piston"), beam: part("beam"), front: part("front") };
const out = root.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const TOUR = [1, 0.3, 0.7, 0.2];
let load = 1, target = 1, s = settled(1), frame = 0, last = 0, clock = 0, touring = !still.matches, visible = false, idle = 0, said = "";
const pct = (v) => Math.round(v * 100) + " %";
function describe() {
  const e = settled(target);
  stage.setAttribute("aria-valuenow", String(Math.round(target * 100)));
  stage.setAttribute("aria-valuetext", "charge " + pct(target) + " ; une fois stabilisée : " + readout(e, target));
}
function draw() {
  const q = pose(s);
  el.pointer.setAttribute("transform", translateAlong(P, [loadX(load), 0, 0]));
  el.valve.innerHTML = valveCrank(P, q);
  el.rod.setAttribute("transform", translateAlong(P, [q.shift, 0, 0]));
  el.gov.innerHTML = governor(P, q);
  el.spokes.innerHTML = spokes(P, q.theta);
  el.piston.innerHTML = piston(P, q);
  el.beam.innerHTML = beam(P, q);
  el.front.innerHTML = front(P, q);
  const text = readout(s, load);
  if (out.textContent !== text) out.textContent = text;
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) {
    clock += dt;
    const next = TOUR[Math.floor(clock / 7) % TOUR.length];
    if (next !== target) { target = next; describe(); }
  }
  load += (target - load) * (1 - Math.exp(-dt / 0.5));
  if (Math.abs(target - load) < 0.002) load = target;
  step(s, load, dt);
  draw();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
function calm() {
  load = target;
  const e = settled(target);
  s.omega = e.omega; s.phi = e.phi; s.rate = 0;
  draw();
}
const run = () => { if (still.matches) { calm(); return; } if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  touring = false;
  target = Math.min(LOAD.high, Math.max(LOAD.low, Math.round(next * 20) / 20));
  describe();
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 6000);
  run();
};
const fromPointer = (e) => { const box = svg.getBoundingClientRect(); return LOAD.low + (LOAD.high - LOAD.low) * Math.min(1, Math.max(0, ((e.clientX - box.left) / box.width - 0.15) / 0.7)); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); else if (frame) { cancelAnimationFrame(frame); frame = 0; } }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") steer(fromPointer(e)); });
stage.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") steer(fromPointer(e)); });
stage.addEventListener("keydown", (e) => {
  let next = null;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") next = target + (e.shiftKey ? 0.2 : 0.1);
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = target - (e.shiftKey ? 0.2 : 0.1);
  if (e.key === "Home") next = LOAD.low;
  if (e.key === "End") next = LOAD.high;
  if (next === null) return;
  e.preventDefault();
  steer(next);
});
still.addEventListener?.("change", () => { touring = !still.matches; run(); });
describe();
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Machine de Watt",
  hint: "Survol, toucher ou ← → : charge",
  readout: M.readout(start, 1),
  keys: [
    { mark: "lit", label: "Le régulateur à boules : plus le volant tourne vite, plus les boules s'écartent et montent, et la tringle referme la vanne de vapeur" },
    { mark: "raised", label: "Index de la règle : la charge de l'atelier, de 20 à 100 %" },
    { mark: "flat", label: "Condenseur séparé dans la bâche d'eau froide : le cylindre, lui, reste chaud" },
  ],
  caption:
    "Machine rotative de Watt (vers 1788) : la vapeur de la chaudière pousse le piston, le balancier transmet l'effort à la bielle, et l'engrenage soleil et planète fait faire deux tours au volant par coup de piston. La vapeur usée va se condenser dans un récipient à part, plongé dans l'eau froide : contrairement à la machine de Newcomen, qui refroidissait le cylindre lui-même à chaque coup, celle de Watt ne gaspille plus la chaleur à le réchauffer. Allégez la charge : le volant accélère, les boules montent, la vanne se ferme, et la vitesse se stabilise un peu plus haut (un régulateur centrifuge laisse toujours un léger écart). Ordres de grandeur approximatifs : une dizaine de chevaux-vapeur, environ 21 coups de piston et 42 tours de volant par minute à pleine charge ; bras du régulateur de 30 cm, volant de 6 000 kg·m², maquette pas à l'échelle.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Machine de Watt : les flèches changent la charge de l'atelier" aria-valuemin="20" aria-valuemax="100" aria-valuenow="100" style="touch-action:pan-y">${svg}</div>`,
});

export function render() {
  return { plate: body, live };
}
