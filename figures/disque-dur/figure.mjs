import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as M from "./model.mjs";
import * as Gm from "./geom.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const title = "Disque dur et SSD";

const WIDTH = 600;
const HEIGHT = 350;
const AZ = 58;
const EL = 36;

const PLATE = { x: -14, y: -14, w: 290, d: 156, r: 8 };
const SSD_DX = -10;
const PLATE_H = 10;
const FOOT_H = 5;

const CASE = { x: 0, y: 0, w: 147, d: 102, r: 2 };
const PCB_Z = 2;
const FLOOR_Z = 5;
const WALL_TOP = 17;
const T = 3;
const { C, R, PT, Q } = Gm.HD;

const STRIP = { x: 2, y: 116, w: 212, d: 7, r: 1 };
const X0 = 8;
const MSU = 8;
const MAX_MS = 25;
const RAIL_H = { y: 106, d: 6 };
const RAIL_S = { y: 127, d: 6 };
const RAIL_Z = 1.2;

const ADP = { x: 170, y: 28, w: 104, d: 42, r: 2 };
const ADP_Z = 5;
const ADP_T = 1.6;
const SSD_B = { x: 183, y: 39, w: 80, d: 22, r: 0.6 };
const SSD_Z = 8.4;
const SSD_T = 0.8;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), ...k.boxCorners(CASE, 0, WALL_TOP), [Q[0], Q[1], 18]],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: AZ, elevation: EL },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const box = (x0, x1, y0, y1, z0, z1, steps = 2, bevel = 0) => k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: Math.min(0.6, (x1 - x0) / 4, (y1 - y0) / 4) }, z0, z1 - z0, P, steps, bevel);
const faceX = (x, pts) => k.pathOf(pts.map(([y, z]) => at([x, y, z])), true);

function bench() {
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
  return out.join("");
}

function hddBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf(CASE, 0, 4, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(k.insetPlan(CASE, 1.5), 0, PCB_Z, P, 2), { tone: "lo" }));
  out.push(S(k.slabOf(CASE, PCB_Z, FLOOR_Z - PCB_Z, P, 3), { tone: "mid" }));
  // back L of the casting: the -x wall and the -y wall, their inner faces seen inside the cavity
  const back = [[0, 0], [147, 0], [147, T], [T, T], [T, 102], [0, 102]];
  out.push(S(k.extrude(back, FLOOR_Z, WALL_TOP - FLOOR_Z, P, { convex: false }), { tone: "mid" }));
  // floor details: screws on the casting floor, the flex bracket and its ribbon
  out.push(D([at([108, 40, FLOOR_Z]), at([86, 12, FLOOR_Z]), at([140, 40, FLOOR_Z]), at([8, 8, FLOOR_Z])], { size: 0.5 }));
  out.push(S(box(90, 100, 4, 12, FLOOR_Z, 12, 2, 0.3), { tone: "mid" }));
  out.push(D([at([93, 8, 12]), at([97, 8, 12])], { size: 0.45 }));
  out.push(S(box(100, 101.2, 5, 11, 7, 11.4), { tone: "lo" }));
  const flex = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    flex.push([101.2 + 12.3 * t, 8 + 10.5 * t * t]);
  }
  const ribbon = [...flex.map(([x, y]) => [x, y - 0.35]), ...flex.reverse().map(([x, y]) => [x, y + 0.35])];
  out.push(S(k.extrude(ribbon, 7.4, 3.6, P, { convex: false }), { tone: "lo", crease: "none" }));
  // voice-coil motor: the lower magnet plate under the coil, and the crash stops
  const mag = [[118, 4], [140, 4], [143, 12], [139, 21], [131, 21], [125, 13]];
  out.push(S(k.extrude(mag, FLOOR_Z, 3, P, { convex: false }), { tone: "mid" }));
  out.push(S(k.extrude(mag.map(([x, y]) => [x + (x < 130 ? 0.8 : -0.8), y + (y < 10 ? 0.8 : -0.8)]), FLOOR_Z + 3, 4, P, { convex: false }), { tone: "hi" }));
  out.push(D([at([121, 6.4, FLOOR_Z + 3]), at([140.6, 8, FLOOR_Z + 3])], { size: 0.45 }));
  out.push(S(k.cylinder(120.4, 8.2, 1.4, FLOOR_Z + 7, 7, P, 16), { tone: "mid" }));
  return out.join("");
}

function platters() {
  const out = [];
  out.push(S(k.cylinder(C[0], C[1], R, 8.2, 1.3, P, 96), { tone: "hi", crease: "lo" }));
  out.push(S(k.cylinder(C[0], C[1], R, 12, PT - 12, P, 96, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(C[0], C[1], R - 1.2, PT, P, 96) + k.ring(C[0], C[1], 18.5, PT, P, 64), { tone: "faint" }));
  return out.join("");
}

function spindle() {
  const out = [];
  out.push(S(k.cylinder(C[0], C[1], 15.5, PT, Gm.HD.CLAMP_Z - PT, P, 64, 0.4), { tone: "mid" }));
  return out.join("");
}

function spindleCap() {
  const out = [];
  out.push(S(k.cylinder(C[0], C[1], 5.5, Gm.HD.CLAMP_Z, 1.2, P, 32), { tone: "mid" }));
  out.push(L(k.ring(C[0], C[1], 2.4, Gm.HD.CLAMP_Z + 1.2, P, 20), { tone: "lo" }));
  out.push(D([at([C[0], C[1], Gm.HD.CLAMP_Z + 1.2])], { size: 0.55, tone: "mid" }));
  return out.join("");
}

function filter() {
  const out = [];
  out.push(S(box(4.2, 12, 84, 97, FLOOR_Z, 12.5, 2, 0.3), { tone: "mid" }));
  out.push(L(k.planOutline({ x: 6, y: 86, w: 4.2, d: 9, r: 0.6 }, 12.5, P, 2), { tone: "lo" }));
  return out.join("");
}

function pivotLow() {
  const out = [];
  out.push(S(k.cylinder(139.6, 21.4, 1.4, FLOOR_Z + 7, 7, P, 16), { tone: "mid" }));
  out.push(S(k.cylinder(Q[0], Q[1], 6.5, FLOOR_Z, 14.6 - FLOOR_Z, P, 40), { tone: "mid", inner: L(k.sideArc(Q[0], Q[1], 6.5, 9, P, 20), { tone: "faint" }) }));
  return out.join("");
}

function pivotCap() {
  const out = [];
  out.push(S(k.cylinder(Q[0], Q[1], 5, 15.6, 1.4, P, 32, 0.3), { tone: "mid" }));
  out.push(L(k.ring(Q[0], Q[1], 2, 17, P, 16), { tone: "lo" }));
  out.push(D([at([Q[0], Q[1], 17])], { size: 0.5, tone: "mid" }));
  return out.join("");
}

function hddFront() {
  const out = [];
  const front = [[147, 0], [147, 102], [0, 102], [0, 102 - T], [147 - T, 102 - T], [147 - T, 0]];
  const sideHoles = [28, 88, 128].map((x) => k.sideRing([x, 102, 10], 1.6, "y", P, 20)).join("");
  out.push(S(k.extrude(front, FLOOR_Z, WALL_TOP - FLOOR_Z, P, { convex: false }), { tone: "mid", inner: L(sideHoles, { tone: "lo" }) }));
  const lid = [[1.5, 12], [1.5, 60], [1.5, 92], [40, 1.5], [100, 1.5], [145.5, 12], [145.5, 60], [145.5, 92], [40, 100.5], [100, 100.5]];
  out.push(L(lid.map(([x, y]) => k.ring(x, y, 1, WALL_TOP, P, 12)).join(""), { tone: "lo" }));
  out.push(D(lid.map(([x, y]) => at([x, y, WALL_TOP])), { size: 0.4 }));
  // the drive's connectors on its end face: SATA power, SATA data, jumper block
  const conn = [[8, 32, 2.6, 9], [36, 49, 2.6, 8], [54, 62, 3, 7]];
  conn.forEach(([y0, y1, z0, z1], i) => {
    out.push(S(box(147, 149.4, y0, y1, z0, z1, 2), { tone: "mid", inner: i < 2 ? L(faceX(149.4, [[y0 + 1.2, z0 + 1.6], [y1 - 1.2, z0 + 1.6], [y1 - 1.2, z1 - 1.8], [y0 + 1.2, z1 - 1.8]]), { tone: "lo" }) : "" }));
  });
  out.push(D([56, 58, 60].map((y) => at([149.4, y, 5])), { size: 0.4, tone: "mid" }));
  return out.join("");
}

function ssd() {
  const out = [`<path class="iso-halo" d="${k.haloOf(ADP, 0, 3, P)}" style="filter:blur(3px)"/>`];
  const posts = k.corners(ADP, 4);
  for (const [x, y] of byDepth(posts).slice(0, 2)) out.push(S(k.cylinder(x, y, 2, 0, ADP_Z, P, 16), { tone: "lo" }));
  out.push(S(k.slabOf(ADP, ADP_Z, ADP_T, P, 3, 0.4), { tone: "mid" }));
  const top = ADP_Z + ADP_T;
  out.push(L(posts.map(([x, y]) => k.ring(x, y, 1.6, top, P, 14)).join(""), { tone: "lo" }));
  out.push(D(posts.map(([x, y]) => at([x, y, top])), { size: 0.45 }));
  // gold fingers on the adapter's edge
  const fingers = [];
  for (let x = 196; x <= 248; x += 2.6) fingers.push(k.lineOnTop([x, ADP.y], [x, ADP.y + 4], top, P));
  out.push(L(fingers.join(""), { tone: "lo" }));
  // regulator, capacitors and the activity LED on the adapter
  out.push(S(box(200, 210, 63, 68, top, top + 1.2, 2), { tone: "hi", crease: "lo" }));
  for (const x of [222, 230]) {
    out.push(S(k.cylinder(x, 65.5, 2.2, top, 4.2, P, 20), { tone: "mid" }));
    out.push(L(k.ring(x, 65.5, 1.2, top + 4.2, P, 12), { tone: "lo" }));
  }
  out.push(S(box(262, 266, 63.5, 67, top, top + 1, 2), { tone: "mid" }));
  // M.2 socket and the standoff under the far end
  out.push(S(box(175, 183, 36, 64, top, SSD_Z + 2, 2, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(263, 50, 2, top, SSD_Z - top, P, 16), { tone: "lo" }));
  // the SSD board: controller, DRAM, two NAND packages, passives, the screw in its notch
  out.push(S(k.slabOf(SSD_B, SSD_Z, SSD_T, P, 2), { tone: "mid" }));
  const st = SSD_Z + SSD_T;
  out.push(S(box(187, 198, 44, 56, st, st + 1, 2, 0.3), { tone: "hi", crease: "lo", inner: "" }));
  out.push(D([at([189, 46, st + 1])], { size: 0.45, tone: "mid" }));
  out.push(S(box(201, 208, 42, 58, st, st + 0.9, 2), { tone: "hi", crease: "lo" }));
  for (const x0 of [212, 232]) {
    out.push(S(box(x0, x0 + 16, 41, 59, st, st + 1.2, 2, 0.3), { tone: "hi", crease: "lo" }));
    out.push(D([at([x0 + 2, 43, st + 1.2])], { size: 0.45, tone: "mid" }));
  }
  for (const [x, y] of [[251, 43], [251, 46], [251, 49], [254.5, 43], [254.5, 46]]) out.push(S(box(x, x + 2, y, y + 1.2, st, st + 0.5, 2), { tone: "mid", crease: "none" }));
  out.push(S(box(251, 257, 52, 57, st, st + 0.8, 2), { tone: "hi", crease: "lo" }));
  out.push(S(k.cylinder(262, 50, 2.6, st, 1, P, 20), { tone: "mid" }));
  out.push(L(k.lineOnTop([260.4, 50], [263.6, 50], st + 1, P) + k.lineOnTop([262, 48.4], [262, 51.6], st + 1, P), { tone: "lo" }));
  for (const [x, y] of byDepth(posts).slice(2)) out.push(S(k.cylinder(x, y, 2, 0, ADP_Z, P, 16), { tone: "lo" }));
  return out.join("");
}

function screwsOnBench() {
  const out = [];
  for (const [x, y] of byDepth([[156, 84], [163, 92], [158, 99]])) {
    out.push(S(k.cylinder(x, y, 1.9, 0, 1.2, P, 16), { tone: "mid" }));
    out.push(L(k.ring(x, y, 0.9, 1.2, P, 10), { tone: "lo" }));
  }
  return out.join("");
}

function ruler() {
  const out = [];
  for (const rail of [RAIL_H, RAIL_S]) {
    out.push(S(k.slabOf({ x: STRIP.x, y: rail.y, w: STRIP.w, d: rail.d, r: 1 }, 0, RAIL_Z, P, 3, 0.3), { tone: "mid" }));
    out.push(D([STRIP.x + 3, STRIP.x + STRIP.w - 3].map((x) => at([x, rail.y + rail.d / 2, RAIL_Z])), { size: 0.4 }));
  }
  out.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(X0, X0 + MAX_MS * MSU, 4, 10, STRIP.y, 0.6, [1.6, 3.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([X0, STRIP.y], [X0, STRIP.y + STRIP.d], 0.6, P), { tone: "hi" }));
  const label = { x: 222, y: 114, w: 44, d: 14, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  for (const [i, len] of [[0, 30], [1, 22], [2, 26]]) out.push(L(k.lineOnTop([label.x + 5, label.y + 4 + i * 3], [label.x + 5 + len, label.y + 4 + i * 3], 0.6, P), { tone: "faint", free: true }));
  out.push(D([at([label.x + 2.4, label.y + 2.4, 0.6]), at([label.x + label.w - 2.4, label.y + label.d - 2.4, 0.6])], { size: 0.4 }));
  return out.join("");
}

function pointer(back) {
  const out = [];
  const z = RAIL_Z;
  if (back) {
    out.push(S(k.extrude([[-3.4, 111.6], [3.4, 111.6], [0, STRIP.y + 1.4]], z, 1.4, P), { tone: "hi" }));
    out.push(S(k.slabOf({ x: -4.5, y: 106.6, w: 9, d: 5, r: 0.8 }, z, 3, P, 2, 0.4), { tone: "mid" }));
    out.push(S(k.cylinder(0, 109.1, 1.5, z + 3, 2, P, 16), { tone: "mid" }));
  } else {
    out.push(S(k.slabOf({ x: -4.5, y: 127.4, w: 9, d: 5, r: 0.8 }, z, 3, P, 2, 0.4), { tone: "mid" }));
    out.push(S(k.extrude([[-3.4, 127.4], [3.4, 127.4], [0, STRIP.y + STRIP.d - 1.4]], z, 1.4, P), { tone: "hi" }));
    out.push(S(k.cylinder(0, 129.9, 1.5, z + 3, 2, P, 16), { tone: "mid" }));
  }
  return out.join("");
}

// The opening picture: a random read just finished.
const OMEGA = (2 * Math.PI) / M.TURN_MS;
const INIT = { uFrom: 0.12, uTo: 0.68, phi: 1.1, theta0: 0.4 };
const head0 = Gm.headAt(INIT.uTo);
const seek0 = M.seekMs(INIT.uFrom, INIT.uTo);
const mod = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
const gap0 = mod(head0.alpha - (INIT.phi + INIT.theta0 + OMEGA * seek0));
const plan0 = M.plan("random", INIT.uFrom, INIT.uTo, gap0);
const AFTER = 1.4;
const theta0 = INIT.theta0 + OMEGA * (plan0.total + AFTER);
const SPAN_MIN = (14 * Math.PI) / 180;
const span0 = Math.max(OMEGA * plan0.transfer, SPAN_MIN);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Un disque dur 3,5 pouces ouvert, sans son capot, posé sur un établi à côté d'un SSD M.2 monté sur une carte d'adaptation. Dans le boîtier du disque : les plateaux sur leur axe, le bras de lecture avec sa tête au bout, la bobine du moteur au-dessus de son aimant, la nappe souple. Sur le SSD : le contrôleur, la mémoire tampon et deux boîtiers de mémoire flash. Devant, une réglette graduée de 0 à 25 millisecondes porte deux index : celui de derrière avance pendant que le disque dur lit, celui de devant pendant que le SSD lit. Une lecture aléatoire fait pivoter le bras jusqu'à la piste, puis attend que le secteur marqué passe sous la tête.",
  body: [
    bench(),
    hddBack(),
    platters(),
    `<g data-part="sector">${Gm.trackSvg(head0.r, P)}${Gm.sectorSvg(head0.r, INIT.phi + theta0, span0, span0, P)}</g>`,
    spindle(),
    `<g data-part="clamp">${Gm.clampDotsSvg(theta0, P)}</g>`,
    spindleCap(),
    filter(),
    `<g data-part="coil">${Gm.coilSvg(head0.psi, P)}</g>`,
    pivotLow(),
    `<g data-part="arm">${Gm.armSvg(head0.psi, P)}</g>`,
    pivotCap(),
    hddFront(),
    `<g transform="${k.translateAlong(P, [SSD_DX, 0, 0])}">${ssd()}</g>`,
    screwsOnBench(),
    ruler(),
    `<g data-part="hdd-pointer" transform="${k.translateAlong(P, [X0 + MSU * plan0.total, 0, 0])}">${pointer(true)}</g>`,
    `<g data-part="ssd-pointer" transform="${k.translateAlong(P, [X0 + MSU * plan0.ssd, 0, 0])}">${pointer(false)}</g>`,
  ],
});

const strip = (src) => src.replace(/^import .*$/gm, "").replace(/^export /gm, "");
const model = strip(readFileSync(join(HERE, "model.mjs"), "utf8"));
const geom = strip(readFileSync(join(HERE, "geom.mjs"), "utf8"));

const live = `
${model}
${geom}
const P = ${JSON.stringify(P)};
const AFTER = ${AFTER}, X0 = ${X0}, MSU = ${MSU}, MAX_MS = ${MAX_MS}, SLOW = 210, HOLD = 1.9;
const OMEGA = 2 * Math.PI / TURN_MS, SPAN_MIN = ${SPAN_MIN};
const INIT = ${JSON.stringify(INIT)};
const TOUR = ["random", "random", "sequential", "random", "sequential", "random"];
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const sectorEl = part("sector"), clampEl = part("clamp"), coilEl = part("coil"), armEl = part("arm");
const hddEl = part("hdd-pointer"), ssdEl = part("ssd-pointer");
const out = root.querySelector("[data-readout]");
const say = stage.querySelector("[data-say]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const wrap = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
let theta = INIT.theta0, req = null, u = INIT.uTo, lastPsi = NaN, hddX = 0, ssdX = 0;
let frame = 0, last = 0, visible = false, touring = !still.matches, tourStep = 0, wait = 1.4, idle = 0;
function start(kind) {
  const from = u;
  const to = kind === "random" ? 0.04 + 0.92 * rand() : from;
  const head = headAt(to);
  let phi, gap = 0;
  if (kind === "random") {
    phi = 2 * Math.PI * rand();
    gap = wrap(head.alpha - (phi + theta + OMEGA * seekMs(from, to)));
  } else {
    phi = head.alpha - theta;
  }
  const p = plan(kind, from, to, gap);
  req = { kind, p, from, to, r: head.r, lead: phi, span: Math.max(OMEGA * p.transfer, SPAN_MIN), t: 0, done: false };
  if (still.matches) { req.t = p.total + AFTER; theta = wrap(theta + OMEGA * req.t); finish(); }
  sectorEl.innerHTML = trackSvg(head.r, P);
  run();
}
function finish() {
  req.done = true;
  const p = req.p;
  const what = req.kind === "random" ? "Lecture aléatoire de 4 Kio" : "Lecture séquentielle de 1 Mio";
  const text = what + " : recherche " + msText(p.seek) + " ms, rotation " + msText(p.rotation) + " ms, total " + msText(p.total) + " ms. Le SSD : " + msText(p.ssd) + " ms.";
  say.textContent = text;
}
function draw() {
  const psiNow = headAt(u).psi;
  if (Math.abs(psiNow - lastPsi) > 1e-5) {
    lastPsi = psiNow;
    coilEl.innerHTML = coilSvg(psiNow, P);
    armEl.innerHTML = armSvg(psiNow, P);
  }
  if (req) {
    const p = req.p;
    const read = Math.min(req.span, Math.max(0, OMEGA * (req.t - p.seek - p.rotation)));
    sectorEl.innerHTML = trackSvg(req.r, P) + sectorSvg(req.r, req.lead + theta, req.span, read, P);
    const text = readout(p, req.t);
    if (out.textContent !== text) out.textContent = text;
  }
  clampEl.innerHTML = clampDotsSvg(theta, P);
  hddEl.setAttribute("transform", translateAlong(P, [hddX, 0, 0]));
  ssdEl.setAttribute("transform", translateAlong(P, [ssdX, 0, 0]));
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  const dms = calm ? 0 : (dt * 1000) / SLOW;
  theta = wrap(theta + OMEGA * dms);
  if (req) {
    req.t += dms;
    const p = req.p;
    if (req.t < p.seek) { const s = req.t / p.seek; u = req.from + (req.to - req.from) * s * s * (3 - 2 * s); } else u = req.to;
    if (!req.done && req.t >= p.total) finish();
  }
  const p = req ? req.p : null;
  const wantH = X0 + MSU * (p ? Math.min(req.t, p.total) : 0);
  const wantS = X0 + MSU * (p ? Math.min(req.t, p.ssd) : 0);
  const ease = calm ? 1 : 1 - Math.exp(-dt / 0.16);
  hddX = wantH < hddX ? hddX + (wantH - hddX) * ease : wantH;
  ssdX = wantS < ssdX ? ssdX + (wantS - ssdX) * ease : wantS;
  if (touring && (!req || req.done)) {
    wait -= dt;
    if (wait <= 0) { start(TOUR[tourStep++ % TOUR.length]); wait = HOLD; }
  }
  draw();
  frame = visible && !calm ? requestAnimationFrame(tick) : 0;
}
const run = () => {
  if (still.matches) { draw(); return; }
  if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); }
};
const act = (kind) => {
  touring = false;
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; wait = 0.6; run(); }, 7000);
  start(kind);
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("click", (e) => act(e.shiftKey ? "sequential" : "random"));
stage.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "a" || key === " " || key === "enter") { e.preventDefault(); act("random"); }
  else if (key === "s") { e.preventDefault(); act("sequential"); }
});
{
  const head = headAt(INIT.uTo);
  const gap = wrap(head.alpha - (INIT.phi + INIT.theta0 + OMEGA * seekMs(INIT.uFrom, INIT.uTo)));
  const p = plan("random", INIT.uFrom, INIT.uTo, gap);
  theta = wrap(INIT.theta0 + OMEGA * (p.total + AFTER));
  req = { kind: "random", p, from: INIT.uFrom, to: INIT.uTo, r: head.r, lead: INIT.phi, span: Math.max(OMEGA * p.transfer, SPAN_MIN), t: p.total + AFTER, done: false };
  finish();
  hddX = X0 + MSU * p.total; ssdX = X0 + MSU * p.ssd;
  draw();
}
`;

const plateBody = k.plateHtml({
  fig: "Fig 1",
  title: "Disque dur et SSD",
  hint: "Toucher/A : aléatoire · S : suite",
  readout: M.readout(plan0, plan0.total),
  keys: [
    { mark: "lit", label: "Le bras et sa tête : il pivote jusqu'à la piste (recherche), puis la tête attend que le secteur sombre passe sous elle (rotation)" },
    { mark: "raised", label: "Réglette 0 à 25 ms : index arrière pour le disque dur, index avant pour le SSD" },
  ],
  caption: `Un disque 3,5 pouces à ${M.RPM} tr/min fait un tour en ${M.msText(M.TURN_MS)} ms : en moyenne la tête attend une demi-rotation, ${M.meanRotationMs().toFixed(2).replace(".", ",")} ms, après une recherche moyenne de ${M.msText(M.meanSeekMs())} ms (environ ${String(M.SEEK.settle).replace(".", ",")} ms de stabilisation plus une course qui croît comme la racine de la distance, ${M.msText(M.SEEK.full)} ms d'un bord à l'autre). Lire 4 Kio n'ajoute que ${M.msText(M.hddTransferMs(M.BYTES.random))} ms à ${M.HDD_MBPS} Mo/s ; le SSD, sans pièce mobile, répond en ~${String(M.SSD.latency).replace(".", ",")} ms (${M.msText(M.ssdMs(M.BYTES.random))} ms avec le transfert). En lecture séquentielle (1 Mio à la suite sur la même piste) il n'y a ni recherche ni attente : ${M.msText(M.hddTransferMs(M.BYTES.sequential))} ms pour le disque contre ${M.msText(M.ssdMs(M.BYTES.sequential))} ms pour un SSD SATA à ${M.SSD.mbps} Mo/s. Ordres de grandeur d'un disque de bureau courant ; le temps est ralenti environ 200 fois et le secteur de 4 Kio est dessiné plus large qu'il n'est.`,
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="Disque dur et SSD : A ou clic pour une lecture aléatoire, S pour une lecture séquentielle">${svg}<span data-say aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"></span></div>`,
});

export function render() {
  return { plate: plateBody, live };
}
