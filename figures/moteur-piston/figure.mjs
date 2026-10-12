import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../kit/tube.mjs";
import * as M from "./model.mjs";
import * as Q from "./geom.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const title = "Moteur à quatre temps";

const WIDTH = 600;
const HEIGHT = 560;
const AZ = 60;

// World units: 1 unit = 2,5 mm of the real engine.
const UNIT_MM = 2.5;
const RC = M.crankMm() / UNIT_MM;
const ROD = M.rodMm() / UNIT_MM;
const BORE_R = M.BORE_MM / 2 / UNIT_MM;
const ZC = 62;
const PIN_UP = 14;
const PIN_DOWN = 20;
const pinZ = (t) => ZC + RC * Math.cos(t) + Math.sqrt(ROD * ROD - RC * RC * Math.sin(t) ** 2);
const CROWN_TDC = pinZ(0) + PIN_UP;
const deckAt = (r) => CROWN_TDC + M.clearanceMm(r) / UNIT_MM;
const H0 = deckAt(M.R_START);
const H1 = H0 + 22;
const H2 = H0 + 56;
const ROOF_SIDE = 2;
const ROOF_TOP = 8;
const DECK = 100;
const FLANGE = 108;

const PLATE = { x: -96, y: -84, w: 206, d: 124, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const CASE = { x0: -42, x1: 52, y0: -38, z0: 8 };
const FLY = { y0: -58, y1: -50, r: 44 };
const TILT = Math.atan2(ROOF_TOP - ROOF_SIDE, BORE_R);
const VALVES = [
  { name: "in", x: -8, r: 6.4, side: -1 },
  { name: "ex", x: 8, r: 5.6, side: 1 },
].map((v) => {
  const roofZ = H0 + ROOF_TOP - (ROOF_TOP - ROOF_SIDE) * (Math.abs(v.x) / BORE_R);
  const axis = [v.side * Math.sin(TILT), 0, Math.cos(TILT)];
  const origin = [v.x, 0, roofZ];
  const camAt = G.add3(origin, G.mul3(axis, 38));
  return { ...v, axis, origin, camAt };
});
const LIFT = 10 / UNIT_MM;
const CAM_BASE = 6;
const GAUGE = { x: 36, y: -21, z: 116, h: 10, r: 8, post: [45, -30] };
const WHEEL = { y: -19, z: 64, r: 11 };
const PER_TURN = 10;

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [0, 0, H2 + 12],
    [-36, -30, H2],
    [38, 0, H2],
    [0, FLY.y0, ZC + FLY.r],
    [-72, -15, H0 + 26],
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
const box = (x0, x1, y0, y1, z0, z1, steps = 2, bevel = 0) => k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0.5 }, z0, z1 - z0, P, steps, bevel);
const FZ = (x, y, z) => G.frameOf([x, y, z], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const FX = (x, y, z) => G.frameOf([x, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const FY0 = Q.frameY(0);
const FYC = G.frameOf([0, 0, ZC], [0, 1, 0], [1, 0, 0], [0, 0, 1]);

// Half of a round part, kept behind the cut plane y = 0 (a floor outline).
function halfRing(rIn, rOut, steps = 36) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = -(i / steps) * Math.PI;
    out.push([rOut * Math.cos(a), rOut * Math.sin(a)]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = -(i / steps) * Math.PI;
    out.push([rIn * Math.cos(a), rIn * Math.sin(a)]);
  }
  return out;
}
const halfTube = (rIn, rOut, z0, z1) => k.extrude(halfRing(rIn, rOut), z0, z1 - z0, P, { convex: false });

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const strip = { x: -60, y: PLATE.y + PLATE.d - 15, w: 150, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  const label = { x: -88, y: 8, w: 22, d: 14, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 3), { tone: "faint" }));
  for (const [i, len] of [[0, 14], [1, 10], [2, 12]]) out.push(L(k.lineOnTop([label.x + 4, label.y + 4.4 + i * 2.6], [label.x + 4 + len, label.y + 4.4 + i * 2.6], 0.8, P), { tone: "lo", free: true }));
  // Bed: two rails the crankcase feet bolt onto.
  for (const y of [-46, -10]) {
    out.push(S(box(-54, 66, y, y + 8, 0, 4, 2, 0.4), { tone: "mid" }));
    out.push(D([-48, 60].map((x) => at([x, y + 4, 4])), { size: 0.45 }));
  }
  return out.join("");
}

function flywheel() {
  const out = [];
  out.push(S(G.disc(FLY.y0, FLY.y1, FLY.r, FYC, P), { tone: "mid", inner: L(G.arcOf(FYC, (FLY.y0 + FLY.y1) / 2, FLY.r, P), { tone: "faint" }) }));
  out.push(L(Q.circleOnFace(FY0, FLY.y1, 0, ZC, FLY.r - 5, P, 72), { tone: "faint" }));
  out.push(L(Q.circleOnFace(FY0, FLY.y1, 0, ZC, 12, P, 36), { tone: "lo" }));
  out.push(S(G.disc(FLY.y1, FLY.y1 + 4, 9, FYC, P), { tone: "mid" }));
  out.push(S(G.disc(FLY.y1 + 4, CASE.y0, 6, FYC, P), { tone: "mid" }));
  return out.join("");
}
const flyMarks = (t) => {
  const holes = [];
  const spokes = [];
  for (let i = 0; i < 5; i++) {
    const a = -t + (i / 5) * Math.PI * 2;
    holes.push(Q.circleOnFace(FY0, FLY.y1, 26 * Math.sin(a), ZC + 26 * Math.cos(a), 6.5, P, 24));
  }
  return L(holes.join(""), { tone: "lo" }) + L(spokes.join(""), { tone: "faint" });
};

function intake() {
  const out = [];
  const can = [-64, -15];
  out.push(S(k.cylinder(can[0], can[1], 9, H0 + 2, 22, P, 40, 0.6), { tone: "mid", inner: L(k.sideArc(can[0], can[1], 9, H0 + 6, P, 28) + k.sideArc(can[0], can[1], 9, H0 + 20, P, 28), { tone: "faint" }) }));
  out.push(L(k.ring(can[0], can[1], 3, H0 + 24, P, 20), { tone: "lo" }));
  out.push(D([at([can[0], can[1], H0 + 24])], { size: 0.5 }));
  const route = [[-55, -15, H0 + 12], [-36, -15, H0 + 12]];
  for (const piece of tubePieces(route, 3, P)) out.push(tubeSvg(piece, { tone: "mid" }));
  return out.join("");
}

function crankcaseBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: CASE.x0, y: CASE.y0, w: CASE.x1 - CASE.x0, d: -CASE.y0, r: 2 }, 0, 6, P)}"/>`];
  out.push(S(box(CASE.x0 - 6, CASE.x1 + 6, CASE.y0 - 6, 0, 4, 8, 2, 0.5), { tone: "mid" }));
  out.push(D([CASE.x0 - 3, CASE.x1 + 3].flatMap((x) => [at([x, -42, 8]), at([x, -6, 8])]), { size: 0.5 }));
  out.push(S(box(CASE.x0, CASE.x1, CASE.y0, CASE.y0 + 6, CASE.z0, DECK, 2, 0.4), { tone: "mid" }));
  out.push(S(box(CASE.x0 + 6, CASE.x1 - 6, CASE.y0 + 6, 0, CASE.z0, CASE.z0 + 8, 2), { tone: "lo" }));
  out.push(S(box(CASE.x0, CASE.x0 + 6, CASE.y0 + 6, 0, CASE.z0, DECK, 2), { tone: "mid" }));
  out.push(S(G.disc(CASE.y0 + 6, -20, 11, FYC, P), { tone: "mid" }));
  out.push(L(Q.circleOnFace(FY0, -20, 0, ZC, 7, P, 32), { tone: "lo" }));
  out.push(D([0, 1, 2, 3].map((i) => Q.pointOnFace(FY0, -20, [8.6 * Math.cos(i * Math.PI / 2 + 0.6), ZC + 8.6 * Math.sin(i * Math.PI / 2 + 0.6)], P)), { size: 0.45 }));
  // Deck with its bore for the cylinder spigot.
  const deck = [[CASE.x1, 0], [CASE.x1, CASE.y0], [CASE.x0, CASE.y0], [CASE.x0, 0]];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (i / 24) * Math.PI;
    deck.push([21.6 * Math.cos(a), -21.6 * Math.sin(a) * -1]);
  }
  out.push(S(k.extrude(deck, DECK - 6, 6, P, { convex: false }), { tone: "mid" }));
  out.push(D([[-36, -32], [46, -32], [-36, -6], [46, -6]].map(([x, y]) => at([x, y, DECK])), { size: 0.5 }));
  return out.join("");
}

function upperBack() {
  const out = [];
  out.push(S(halfTube(BORE_R, 21, DECK - 6, FLANGE - 4), { tone: "mid" }));
  out.push(S(box(-28, 28, -28, 0, FLANGE - 4, FLANGE, 2, 0.4), { tone: "mid" }));
  out.push(S(box(28, 41, -26, -16, FLANGE - 4, FLANGE, 2, 0.4), { tone: "mid" }));
  out.push(D([[-24, -24], [24, -24]].map(([x, y]) => at([x, y, FLANGE])), { size: 0.5 }));
  out.push(S(halfTube(BORE_R, 21, FLANGE, H0), { tone: "mid" }));
  for (let z = FLANGE + 5; z < H0 - 3; z += 6) out.push(S(halfTube(BORE_R, 30, z, z + 1.6), { tone: "mid", crease: "none" }));
  out.push(S(halfTube(BORE_R, BORE_R + 0.6, FLANGE, H0), { tone: "lo", crease: "none" }));
  out.push(S(box(-36, 36, -30, -16.5, H0, H1, 2, 0.4), { tone: "mid" }));
  out.push(S(box(-38, 38, -30, -12, H1, H2, 2, 0.5), { tone: "mid" }));
  for (const v of VALVES) out.push(S(G.disc(-12, -5, 3.4, G.frameOf(G.add3(v.camAt, [0, 0, 0]), [0, 1, 0], [1, 0, 0], [0, 0, 1]), P), { tone: "mid" }));
  return out.join("");
}

function upperFront() {
  const out = [];
  out.push(S(box(-36, -BORE_R, -16.5, 0, H0, H1, 2, 0.4), { tone: "mid" }));
  const roofL = [[-BORE_R, H0 + ROOF_SIDE], [0, H0 + ROOF_TOP], [0, H1], [-BORE_R, H1]];
  const roofR = roofL.map(([x, z]) => [-x, z]);
  out.push(S(Q.prismAlong(FY0, roofL, -16.5, 0, P), { tone: "mid" }));
  out.push(S(Q.prismAlong(FY0, roofR, -16.5, 0, P), { tone: "mid" }));
  out.push(S(box(BORE_R, 36, -16.5, 0, H0, H1, 2, 0.4), { tone: "mid" }));
  // Spark plug: thread in the head, hex, insulator, boot through the cover.
  out.push(S(k.cylinder(0, 0, 2.6, H0 + ROOF_TOP - 1.5, H1 - H0 - ROOF_TOP + 1.5, P, 24), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(0, 0, 5, H1, 4, P, 6), { tone: "mid" }));
  out.push(S(k.cylinder(0, 0, 2.8, H1 + 4, 10, P, 24), { tone: "hi", crease: "none", inner: L([H1 + 7, H1 + 10].map((z) => k.sideArc(0, 0, 2.8, z, P, 16)).join(""), { tone: "faint" }) }));
  out.push(S(k.cylinder(0, 0, 4.2, H1 + 12, H2 + 6 - H1 - 12, P, 28), { tone: "mid", inner: L(k.sideArc(0, 0, 4.2, H2 + 1, P, 20), { tone: "faint" }) }));
  out.push(S(k.cylinder(0, 0, 2.4, H2 + 6, 3, P, 20), { tone: "mid" }));
  // Valve springs and guides.
  for (const v of VALVES) {
    const F = G.frameAlong(v.origin, v.axis);
    const s0 = (H1 - v.origin[2]) / v.axis[2];
    out.push(S(G.disc(s0 - 1, s0 + 0.6, 4.6, F, P), { tone: "mid" }));
    for (let s = s0 + 1.6; s < 25.4; s += 1.7) out.push(S(G.ringBand(s, s + 0.9, 2.2, 4.2, F, P), { tone: "lo", crease: "none" }));
  }
  return out.join("");
}

function valveSvg(v) {
  const F = G.frameAlong(v.origin, v.axis);
  const prof = [[0, 0], [0, v.r], [1.2, v.r], [2, v.r - 1.2, 1], [3.4, 2.6, 1], [5.4, 1.3, 1], [28, 1.3], [28, 0]];
  return S(G.solidOf(prof.slice(1, -1), F, P), { tone: "mid" }) + S(G.disc(25.4, 31.6, 5, F, P), { tone: "mid", inner: L(G.arcOf(F, 28.5, 5, P), { tone: "faint" }) });
}

function coverFront() {
  const out = [];
  out.push(S(box(-38, -34, -12, 0, H1, H2, 2, 0.4), { tone: "mid" }));
  out.push(S(box(-34, -5.2, -12, 0, H2 - 4, H2, 2, 0.4), { tone: "mid" }));
  out.push(S(box(5.2, 34, -12, 0, H2 - 4, H2, 2, 0.4), { tone: "mid" }));
  out.push(S(box(34, 38, -12, 0, H1, H2, 2, 0.4), { tone: "mid" }));
  out.push(D([[-30, -24], [-12, -24], [12, -24], [30, -24], [-30, -6], [30, -6]].map(([x, y]) => at([x, y, H2])), { size: 0.5 }));
  // Exhaust: flange on the head's right face, pipe out and down to the silencer.
  const flangeF = FX(36, -15, H0 + 11);
  out.push(S(G.disc(0, 2, 6, flangeF, P), { tone: "mid" }));
  out.push(D(G.dotsOf(flangeF, 2, 4.4, 4, P, { all: true, phase: Math.PI / 4 }), { size: 0.45 }));
  const route = G.fillet([[38, -15, H0 + 11], [58, -15, H0 + 11], [58, -15, H0 - 12]], 9, 7, { P, tube: 3 });
  for (const piece of tubePieces(route, 3, P, { maxLength: 60 })) out.push(tubeSvg(piece, { tone: "mid" }));
  out.push(S(k.cylinder(58, -15, 4.4, H0 - 15, 3, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(58, -15, 10, H0 - 50, 35, P, 40, 0.6), { tone: "mid", inner: L(k.sideArc(58, -15, 10, H0 - 45, P, 28) + k.sideArc(58, -15, 10, H0 - 20, P, 28), { tone: "faint" }) }));
  out.push(S(k.cylinder(58, -15, 2.4, H0 - 56, 6, P, 20), { tone: "mid" }));
  return out.join("");
}

function crankcaseFront() {
  const out = [];
  out.push(S(box(CASE.x1 - 6, CASE.x1, CASE.y0 + 6, 0, CASE.z0, DECK, 2), { tone: "mid", inner: L(k.sideSeam({ x: CASE.x1 - 6, y: CASE.y0 + 6, w: 6, d: -CASE.y0 - 6, r: 0.5 }, 30, P, 2), { tone: "faint" }) }));
  // Drain plug and filler on the right face.
  out.push(S(G.disc(0, 2, 2.6, FX(CASE.x1, -8, 16), P), { tone: "mid" }));
  // Handwheel that raises the cylinder (compression ratio).
  const F = FX(CASE.x1, WHEEL.y, WHEEL.z);
  out.push(S(G.disc(0, 3, 6, F, P), { tone: "mid" }));
  out.push(D(G.dotsOf(F, 3, 4.6, 4, P, { all: true }), { size: 0.45 }));
  out.push(S(G.disc(3, 7, 3, F, P), { tone: "mid" }));
  out.push(S(G.ringBand(7, 10, WHEEL.r - 2.4, WHEEL.r, F, P), { tone: "mid" }));
  out.push(S(G.disc(7, 10, 3.4, F, P), { tone: "mid" }));
  return out.join("");
}
const FW = Q.axisFrame([CASE.x1, WHEEL.y, WHEEL.z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const wheelParts = (turn) => {
  const out = [];
  const spokes = [];
  for (let i = 0; i < 3; i++) {
    const a = turn + (i / 3) * Math.PI * 2;
    spokes.push(Q.prismAlong(FW, Q.hull2([...Q.circlePoly(3.2 * Math.cos(a), 3.2 * Math.sin(a), 1.1, 10), ...Q.circlePoly((WHEEL.r - 2.2) * Math.cos(a), (WHEEL.r - 2.2) * Math.sin(a), 1.1, 10)]), 8, 9.4, P));
  }
  for (const s of spokes) out.push(S(s, { tone: "mid" }));
  const hx = (WHEEL.r - 1.2) * Math.cos(turn);
  const hy = (WHEEL.r - 1.2) * Math.sin(turn);
  out.push(S(Q.discAlong(FW, hx, hy, 1.1, 10, 13, P, 14), { tone: "mid" }));
  out.push(S(Q.discAlong(FW, hx, hy, 2, 13, 19, P, 20), { tone: "mid" }));
  return out.join("");
};

function gauge() {
  const out = [];
  const [px, py] = GAUGE.post;
  out.push(S(k.cylinder(px, py, 4, DECK, 3, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(px, py, 2.4, DECK + 3, GAUGE.z + 8 - DECK - 3, P, 20), { tone: "mid", crease: "none" }));
  out.push(S(box(GAUGE.x + GAUGE.r - 1, px + 2.4, GAUGE.y - 2.5, GAUGE.y + 2.5, GAUGE.z + 3, GAUGE.z + 6, 2, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(px, py, 3, GAUGE.z + 8, 2, P, 20), { tone: "mid" }));
  return out.join("");
}
function dial() {
  const out = [];
  const { x, y, z, h, r } = GAUGE;
  const top = z + h;
  out.push(S(k.cylinder(x, y, r, z, h, P, 56, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, r, top - 3, top, 60, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, r, top - 3, P, 32), { tone: "faint" }));
  out.push(L(k.ring(x, y, r - 1.8, top, P, 48), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, r - 2.2, 40, 5, top, [1, 2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.2, top, P, 12), { tone: "mid" }));
  return out.join("");
}
const needleAt = (dz) => {
  const a = (dz / PER_TURN) * Math.PI * 2;
  const { x, y, h, z, r } = GAUGE;
  return lineOnTop([x - Math.sin(a) * 2.4, y + Math.cos(a) * 2.4], [x + Math.sin(a) * (r - 3), y - Math.cos(a) * (r - 3)], z + h + 0.2, P);
};
const lineOnTop = k.lineOnTop;

// Moving internals, rebuilt per frame in the page from the same functions.
const WEB = Q.webPoly(RC, 8.5, 11, 25, 0.95);
const CAM = Q.camPoly(CAM_BASE, LIFT, Math.PI / 2);
function crankParts(t) {
  const pin = [RC * Math.sin(t), ZC + RC * Math.cos(t)];
  const small = [0, pinZ(t)];
  const web = Q.turnPoly(WEB, -t, [0, ZC]);
  const rod = [...Q.circlePoly(pin[0], pin[1], 9.4, 32), ...Q.circlePoly(small[0], small[1], 6.2, 24)];
  const dx = small[0] - pin[0];
  const dz = small[1] - pin[1];
  const len = Math.hypot(dx, dz);
  const nx = -dz / len;
  const nz = dx / len;
  const capA = [pin[0] + nx * 9.39 + (dx / len) * 1.5, pin[1] + nz * 9.39 + (dz / len) * 1.5];
  const capB = [pin[0] - nx * 9.39 + (dx / len) * 1.5, pin[1] - nz * 9.39 + (dz / len) * 1.5];
  const bolts = [1, -1].map((side) => Q.pointOnFace(FY0, 5, [pin[0] + side * nx * 7.4 + (dx / len) * 3.6, pin[1] + side * nz * 7.4 + (dz / len) * 3.6], P));
  return [
    S(Q.prismAlong(FY0, web, -16, -9, P), { tone: "mid" }),
    S(Q.discAlong(FY0, pin[0], pin[1], 5.4, -9, 5, P, 32), { tone: "mid" }),
    S(Q.prismAlong(FY0, rod, -5, 5, P), { tone: "mid" }),
    L(Q.segmentOnFace(FY0, 5, capA, capB, P), { tone: "lo" }),
    D(bolts, { size: 0.5 }),
    S(Q.discAlong(FY0, pin[0], pin[1], 5.4, 5, 6.4, P, 32), { tone: "mid" }),
    D([Q.pointOnFace(FY0, 6.4, pin, P)], { size: 0.5 }),
  ].join("");
}
const valveLiftOf = (t, v) => M.valveLift(t, v.name) * LIFT;
function camParts(t) {
  return VALVES.map((v) => {
    const peak = v.name === "in" ? Math.PI / 2 : 3.5 * Math.PI;
    const follower = Math.atan2(-v.axis[2], -v.axis[0]);
    const angle = follower + (t - peak) / 2;
    const c = [v.camAt[0], v.camAt[2]];
    return S(Q.prismAlong(FY0, Q.turnPoly(CAM, angle, c), -5, 5, P), { tone: "mid" }) + D([Q.pointOnFace(FY0, 5, c, P)], { size: 0.5 }) + L(Q.circleOnFace(FY0, 5, c[0], c[1], 2.4, P, 16), { tone: "lo" });
  }).join("");
}

function piston() {
  const z0 = pinZ(0) - PIN_DOWN;
  const top = pinZ(0) + PIN_UP;
  const r = BORE_R - 0.3;
  const grooves = [top - 2.4, top - 4.6, top - 6.8].map((z) => k.sideArc(0, 0, r, z, P, 40)).join("");
  return S(k.cylinder(0, 0, r, z0, PIN_UP + PIN_DOWN, P, 56, 0.6), {
    tone: "hi",
    lit: true,
    inner: L(grooves, { tone: "lo" }) + L(k.sideRing([0, r, pinZ(0)], 4.2, "y", P), { tone: "lo" }),
  });
}

function clipPath() {
  const pts = [[-300, 400], [BORE_R, 400], [BORE_R, DECK - 6], [CASE.x1 - 6, DECK - 6], [CASE.x1 - 6, -60], [-300, -60]].map(([x, z]) => at([x, 0, z]));
  return `<clipPath id="mp-open"><path d="${k.pathOf(pts, true)}"/></clipPath>`;
}

const start = M.gasState(0, M.R_START);
const T0 = 0;
const valveG = (v) => `<g data-part="valve-${v.name}">${valveSvg(v)}</g>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Moteur monocylindre à quatre temps, en coupe, sur un banc d'essai : carter et volant à l'arrière, vilebrequin à masse d'équilibrage, bielle, piston dans un cylindre à ailettes, culasse avec deux soupapes inclinées commandées par deux arbres à cames, bougie au centre, pot d'échappement à droite, filtre à air à gauche. Un volant à main relève le cylindre pour changer le rapport volumétrique, lu par un comparateur.",
  body: [
    clipPath(),
    base(),
    flywheel(),
    `<g data-part="fly-marks">${flyMarks(T0)}</g>`,
    `<g data-part="upper-a">${intake()}</g>`,
    crankcaseBack(),
    `<g data-part="upper-b">${upperBack()}</g>`,
    `<g clip-path="url(#mp-open)"><g data-part="crank">${crankParts(T0)}</g><g data-part="piston">${piston()}</g></g>`,
    `<g data-part="upper-c">${upperFront()}${VALVES.map(valveG).join("")}<g data-part="cams">${camParts(T0)}</g><g data-part="spark" opacity="0">${D([[0, 0, H0 + ROOF_TOP - 2], [1.2, 0, H0 + ROOF_TOP - 2.8], [-1.2, 0, H0 + ROOF_TOP - 2.6], [0.4, 0, H0 + ROOF_TOP - 3.6], [-0.6, 0, H0 + ROOF_TOP - 1.2]].map(at), { size: 1, tone: "hi" })}</g>${coverFront()}</g>`,
    crankcaseFront(),
    `<g data-part="wheel">${wheelParts(0)}</g>`,
    gauge(),
    `<g data-part="plunger">${S(k.cylinder(GAUGE.x, GAUGE.y, 1.3, FLANGE, GAUGE.z + 2 - FLANGE, P, 16), { tone: "mid", crease: "none" })}${S(k.cylinder(GAUGE.x, GAUGE.y, 2, FLANGE, 1.4, P, 16), { tone: "mid" })}</g>`,
    dial(),
    `<path data-part="needle" class="iso-line" data-tone="hi" data-free="start" d="${needleAt(0)}" style="stroke-width:1"/>`,
  ],
});

const strip = (src) => src.replace(/^import .*$/gm, "").replace(/^export /gm, "");
const model = strip(readFileSync(join(HERE, "model.mjs"), "utf8"));
const geom = strip(readFileSync(join(HERE, "geom.mjs"), "utf8"));
const src = (fn) => fn.toString().replace(/\b[QkMG]\./g, "");

const live = `
${model}
${geom}
const P = ${JSON.stringify(P)};
const RC = ${RC}, ROD = ${ROD}, ZC = ${ZC}, UNIT_MM = ${UNIT_MM}, LIFT = ${LIFT}, PER_TURN = ${PER_TURN}, H0 = ${H0};
const FLY = ${JSON.stringify(FLY)}, GAUGE = ${JSON.stringify(GAUGE)}, WHEEL = ${JSON.stringify(WHEEL)};
const VALVES = ${JSON.stringify(VALVES)};
const WEB = ${JSON.stringify(WEB)}, CAM = ${JSON.stringify(CAM)};
const FY0 = frameY(0);
const FW = ${JSON.stringify(FW)};
const S = (paths, style) => solidSvg(paths, style);
const L = (d, style) => lineSvg(d, style);
const D = (points, style) => dotsSvg(points, style);
const pinZ = ${src(pinZ)};
const CROWN_TDC = pinZ(0) + ${PIN_UP};
const deckAt = (r) => CROWN_TDC + clearanceMm(r) / UNIT_MM;
const flyMarks = ${src(flyMarks)};
const crankParts = ${src(crankParts)};
const camParts = ${src(camParts)};
const wheelParts = ${src(wheelParts)};
const needleAt = ${src(needleAt)};
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const fly = part("fly-marks"), crank = part("crank"), pis = part("piston"), cams = part("cams"), spark = part("spark");
const uppers = ["upper-a", "upper-b", "upper-c"].map(part);
const valves = VALVES.map((v) => part("valve-" + v.name));
const wheel = part("wheel"), plunger = part("plunger"), needle = part("needle");
const out = root.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const SPEED = Math.PI * 2 / 5;
let cyc = 0, goal = 0, ratio = ${M.R_START}, ratioGoal = ratio, frame = 0, last = 0, visible = false, idle = 0;
let touring = !still.matches, spoken = "";
const lo = ${M.R_LOW}, hi = ${M.R_HIGH};
const clampR = (r) => Math.min(hi, Math.max(lo, r));
function draw() {
  const t = cyc;
  const s = gasState(t, ratio);
  const dz = deckAt(ratio) - H0;
  const lift = translateAlong(P, [0, 0, dz]);
  uppers.forEach((g) => g.setAttribute("transform", lift));
  plunger.setAttribute("transform", lift);
  needle.setAttribute("d", needleAt(dz));
  wheel.innerHTML = wheelParts(dz / 4 * Math.PI * 2);
  fly.innerHTML = flyMarks(t);
  crank.innerHTML = crankParts(t);
  cams.innerHTML = camParts(t);
  pis.setAttribute("transform", translateAlong(P, [0, 0, pinZ(t) - pinZ(0)]));
  VALVES.forEach((v, i) => { const d = valveLift(t, v.name) * LIFT; valves[i].setAttribute("transform", translateAlong(P, [-v.axis[0] * d, 0, -v.axis[2] * d])); });
  const m = ((t % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI);
  const near = Math.abs(m - 2 * Math.PI);
  spark.setAttribute("opacity", near < 0.22 ? String(Math.cos(near / 0.22 * Math.PI / 2) ** 2) : "0");
  const text = readoutOf(s, (stage.clientWidth || 600) < 480);
  if (out.textContent !== text) out.textContent = text;
  const words = s.name + ", rapport volumétrique " + ratio.toFixed(1).replace(".", ",") + ", rendement d'Otto " + Math.round(s.otto * 100) + " %, limite de Carnot " + Math.round(s.carnot * 100) + " %";
  if (words !== spoken) { spoken = words; stage.setAttribute("aria-valuetext", words); stage.setAttribute("aria-valuenow", ratio.toFixed(1)); }
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { goal += SPEED * dt; cyc = goal; }
  else cyc = calm ? goal : cyc + (goal - cyc) * (1 - Math.exp(-dt / 0.22));
  if (Math.abs(goal - cyc) < 0.001) cyc = goal;
  ratio = calm ? ratioGoal : ratio + (ratioGoal - ratio) * (1 - Math.exp(-dt / 0.3));
  if (Math.abs(ratioGoal - ratio) < 0.002) ratio = ratioGoal;
  draw();
  const settled = !touring && cyc === goal && ratio === ratioGoal;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const hold = () => { touring = false; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; goal = cyc; run(); }, 4000); run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
let drag = null;
stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }; if (e.pointerType === "mouse") stage.setPointerCapture(e.pointerId); });
stage.addEventListener("pointermove", (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 4) return;
  if (!drag.moved) { drag.moved = true; goal = cyc; try { stage.setPointerCapture(e.pointerId); } catch (_) {} }
  drag.x = e.clientX;
  const w = svg.getBoundingClientRect().width || 1;
  goal += dx / w * Math.PI * 4;
  hold();
});
const end = (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const tapped = !drag.moved;
  drag = null;
  if (tapped && e.type === "pointerup") {
    if (touring) { goal = cyc; hold(); } else { clearTimeout(idle); touring = !still.matches; goal = cyc; run(); }
  }
};
stage.addEventListener("pointerup", end);
stage.addEventListener("pointercancel", end);
stage.addEventListener("keydown", (e) => {
  const step = e.shiftKey ? Math.PI / 2 : Math.PI / 12;
  if (e.key === "ArrowRight") { if (touring) goal = cyc; goal += step; }
  else if (e.key === "ArrowLeft") { if (touring) goal = cyc; goal -= step; }
  else if (e.key === "ArrowUp") { if (touring) goal = cyc; ratioGoal = clampR(ratioGoal + (e.shiftKey ? 2 : 0.5)); }
  else if (e.key === "ArrowDown") { if (touring) goal = cyc; ratioGoal = clampR(ratioGoal - (e.shiftKey ? 2 : 0.5)); }
  else if (e.key === "Home") { if (touring) goal = cyc; ratioGoal = ${M.R_START}; }
  else if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (touring) { goal = cyc; hold(); } else { clearTimeout(idle); touring = !still.matches; goal = cyc; run(); } return; }
  else return;
  e.preventDefault();
  hold();
});
draw();
`;

const plate = k.plateHtml({
  fig: "Fig 1",
  title: "Moteur à quatre temps",
  hint: "Glisser, toucher, ← → ↑ ↓",
  readout: M.readoutOf(start),
  keys: [
    { mark: "lit", label: "Le piston : il aspire, comprime, reçoit la poussée des gaz, puis chasse les gaz brûlés" },
    { mark: "raised", label: "Soupapes et cames : l'admission s'ouvre au premier temps, l'échappement au quatrième" },
    { mark: "flat", label: "Volant à main et comparateur : ils relèvent le cylindre pour changer le rapport volumétrique r (↑ ↓, de 5 à 14)" },
    { mark: "dotted", label: "Lecture : le temps en cours, la pression et le volume du gaz, puis le rendement d'Otto comparé à la limite de Carnot" },
    { mark: "dim", label: "Glisser ou ← → : tourner le vilebrequin à la main · toucher ou Espace : lancer ou arrêter le moteur" },
  ],
  caption:
    "Un monocylindre à quatre temps coupé en deux sur son banc : deux tours de vilebrequin pour un cycle, admission, compression, détente, échappement. La lecture vient d'un cycle d'Otto idéal pour l'air (gaz parfait, γ = 1,4) : admission à 1 bar et 300 K, compression et détente adiabatiques réversibles, combustion instantanée au point mort haut (1 500 kJ par kg d'air), échappement instantané. Son rendement 1 − r^(1−γ) ne dépend que du rapport volumétrique r : 60 % pour r = 10. La limite de Carnot est prise entre 300 K et la température de fin de combustion du même modèle (2 843 K pour r = 10), soit 89 %. Cotes inspirées du moteur d'essai CFR (alésage 82,55 mm, course 114,3 mm, rapport réglable, ici de 5 à 14) ; bielle supposée 3,5 fois le rayon de manivelle, chambre et calage des soupapes simplifiés. Un vrai moteur à essence plafonne vers 30 à 35 % (pertes thermiques, frottements, combustion non instantanée), et le cliquetis limite r autour de 10.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-valuemin="${M.R_LOW}" aria-valuemax="${M.R_HIGH}" aria-valuenow="${M.R_START}" aria-valuetext="admission, rapport volumétrique 10,0" aria-label="Moteur à quatre temps : flèches gauche et droite pour tourner le vilebrequin, haut et bas pour le rapport volumétrique, Espace pour lancer ou arrêter" style="touch-action:pan-y">${svg}</div>`,
});

export function render() {
  return { plate, live };
}
