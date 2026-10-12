import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const title = "Nappe artésienne";

const { iso, pathOf } = k;
const { sandTop, sandBottom, clayTop, ground, waterTable, headAt, clayThick, alluvThick, BOTTOM } = M;

const WIDTH = 600;
const HEIGHT = 300;
const AZ = 99;

// World: x along the section (10 units per km), y across, z up (ZU units per metre of elevation).
const KM = 13;
const X0 = -12 * KM;
const X1 = 12 * KM;
const YF = 22;
const YB = -22;
const ZU = 1.25;
const STEP = 1;

const xOf = (s) => X0 + s * KM;
const sOf = (x) => (x - X0) / KM;
const Z = (m) => (m - BOTTOM) * ZU;
const F = (x, m) => iso([x, YF, Z(m)], P);
const XS = Array.from({ length: Math.round((X1 - X0) / STEP) + 1 }, (_, i) => X0 + i * STEP);

const PLATE = { x: X0 - 40, y: -32, w: X1 - X0 + 56, d: 68, r: 8 };
const PLATE_H = 7;
const FOOT_H = 5;

const TANK = { x0: X0 - 26, x1: X0, y0: -18, y1: 18, base: 3 };
const TANK_TOP = Z(142);
const PIPE = [X0 - 14, 8];
const SLIDE_LOW = Z(M.RECHARGE.low);
const SLIDE_HIGH = Z(M.RECHARGE.high);
const CROSS_Z = TANK_TOP + 2;
const STAFF = { x: X0 - 36, y: 18, w: 4, d: 3 };
const STAFF_TOP = Z(146);

const XW = xOf(M.WELL_KM);
const YW = YF - 3.4;
const XS_WELL = xOf(M.SHALLOW_KM);
const YS_WELL = YF - 6;
const XP = xOf(M.PIEZO_KM);
const YP = YF - 2.6;
const PIEZO_TOP = Z(124);

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [X0, YB, Z(ground(0)) + 14],
    [X0, YF, Z(ground(0))],
    [PIPE[0], PIPE[1], CROSS_Z + (SLIDE_HIGH - SLIDE_LOW) + 8],
    [STAFF.x, STAFF.y + STAFF.d, STAFF_TOP],
    [X1, YB, Z(ground(24)) + 10],
  ],
  WIDTH,
  HEIGHT,
  { pad: 18, azimuth: AZ, elevation: 26 },
);

const at = (point) => iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const fillPath = (d, cls, extra = "") => `<path class="${cls}" d="${d}"${extra}/>`;

// A deterministic scatter, so the stipple is the same on every build.
function scatter(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- The block: a section cut along the front face ---------------------------------------

function band(lower, upper, from = X0, to = X1) {
  const xs = XS.filter((x) => x >= from - 1e-9 && x <= to + 1e-9);
  const top = xs.map((x) => F(x, upper(sOf(x))));
  const bottom = xs.map((x) => F(x, lower(sOf(x)))).reverse();
  return pathOf([...top, ...bottom], true);
}

function firstWhere(test, from = X0, to = X1) {
  let lo = from;
  let hi = to;
  if (test(lo)) return lo;
  for (let x = from; x <= to; x += 0.5) {
    if (test(x)) { hi = x; break; }
    lo = x;
  }
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (test(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

const CLAY_FROM = firstWhere((x) => clayThick(sOf(x)) > 0.02);
const ALLU_FROM = firstWhere((x) => alluvThick(sOf(x)) > 0.02);
const PHREATIC_FROM = firstWhere((x) => waterTable(sOf(x)) - clayTop(sOf(x)) > 0.02);

function curveLine(fn, from = X0, to = X1) {
  const xs = [from, ...XS.filter((x) => x > from + 1e-6 && x < to - 1e-6), to];
  return pathOf(xs.map((x) => F(x, fn(sOf(x)))));
}

function bedding(lower, upper, fractions, from) {
  return fractions.map((t) => curveLine((s) => lower(s) + (upper(s) - lower(s)) * t, from)).join("");
}

function stipple(lower, upper, count, seed, from = X0, margin = 0.6) {
  const rnd = scatter(seed);
  const out = [];
  for (let i = 0; out.length < count && i < count * 6; i++) {
    const x = from + 1 + rnd() * (X1 - from - 2);
    const s = sOf(x);
    const z0 = Z(lower(s)) + margin;
    const z1 = Z(upper(s)) - margin;
    if (z1 <= z0) continue;
    out.push(at([x, YF, z0 + rnd() * (z1 - z0)]));
  }
  return out;
}

function pebbles(lower, upper, count, seed, from) {
  const rnd = scatter(seed);
  const out = [];
  for (let i = 0; out.length < count && i < count * 8; i++) {
    const x = from + 3 + rnd() * (X1 - from - 6);
    const s = sOf(x);
    const r = 0.5 + rnd() * 0.5;
    const z0 = Z(lower(s)) + r + 0.5;
    const z1 = Z(upper(s)) - r - 0.5;
    if (z1 <= z0) continue;
    const z = z0 + rnd() * (z1 - z0);
    const pts = Array.from({ length: 8 }, (_, j) => at([x + r * Math.cos((j / 8) * Math.PI * 2), YF, z + r * 0.8 * Math.sin((j / 8) * Math.PI * 2)]));
    out.push(pathOf(pts, true));
  }
  return out.join("");
}

function topSurface() {
  const buckets = new Map();
  for (let i = 0; i < XS.length - 1; i++) {
    const x0 = XS[i], x1 = XS[i + 1];
    const z0 = Z(ground(sOf(x0))), z1 = Z(ground(sOf(x1)));
    const normal = [-(z1 - z0), 0, x1 - x0];
    const tone = G.toneOf(normal, P);
    const quad = pathOf([at([x0, YB, z0]), at([x1, YB, z1]), at([x1, YF, z1]), at([x0, YF, z0])], true);
    buckets.set(tone, (buckets.get(tone) ?? "") + quad);
  }
  const out = [];
  for (const [tone, d] of buckets) out.push(tone >= 4 ? fillPath(d, "iso-top") : fillPath(d, "iso-shade", ` data-shade="${tone}"`));
  return out.join("");
}

function block() {
  const out = [];
  const xs = XS;
  const outline = pathOf([
    at([X0, YF, 0]),
    at([X1, YF, 0]),
    at([X1, YF, Z(ground(24))]),
    at([X1, YB, Z(ground(24))]),
    ...[...xs].reverse().map((x) => at([x, YB, Z(ground(sOf(x)))])),
    at([X0, YB, 0]),
  ], true);
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: X0, y: YB, w: X1 - X0, d: YF - YB, r: 1 }, 0, 4, P)}"/>`);
  out.push(fillPath(outline, "iso-fill"));

  // left end face (x = X0), mostly behind the tank
  const lf = (y, m) => at([X0, y, Z(m)]);
  out.push(fillPath(pathOf([lf(YB, BOTTOM), lf(YF, BOTTOM), lf(YF, sandBottom(0)), lf(YB, sandBottom(0))], true), "np-clay2 np-side"));
  out.push(fillPath(pathOf([lf(YB, sandBottom(0)), lf(YF, sandBottom(0)), lf(YF, ground(0)), lf(YB, ground(0))], true), "np-sand np-side"));
  out.push(`<path class="np-wet" data-part="wet-left" d="${wetLeft(M.RECHARGE.start)}"/>`);
  out.push(L(pathOf([lf(YB, sandBottom(0)), lf(YF, sandBottom(0))]), { tone: "lo" }));

  // front face: the strata
  out.push(fillPath(band(() => BOTTOM, sandBottom), "np-clay2"));
  out.push(fillPath(band(sandBottom, sandTop), "np-sand"));
  out.push(fillPath(band(sandTop, clayTop, CLAY_FROM), "np-clay"));
  out.push(fillPath(band(clayTop, ground, ALLU_FROM), "np-allu"));
  out.push(fillPath(band(clayTop, waterTable, PHREATIC_FROM), "np-wet"));
  out.push(`<path class="np-wet" data-part="wet" d="${wetFront(M.RECHARGE.start)}"/>`);

  out.push(L(bedding(() => BOTTOM, sandBottom, [0.22, 0.44, 0.66, 0.84]), { tone: "faint" }));
  out.push(L(bedding(sandTop, clayTop, [0.3, 0.55, 0.8], CLAY_FROM), { tone: "faint" }));
  out.push(D(stipple(sandBottom, sandTop, 520, 7), { size: 0.38, tone: "lo" }));
  out.push(D(stipple(clayTop, ground, 140, 11, ALLU_FROM, 0.5), { size: 0.32, tone: "lo" }));
  out.push(L(pebbles(clayTop, ground, 46, 23, ALLU_FROM), { tone: "lo" }));

  out.push(L(curveLine(sandBottom) + curveLine(sandTop, CLAY_FROM) + curveLine(clayTop, ALLU_FROM), { tone: "mid" }));
  out.push(L(curveLine(waterTable, PHREATIC_FROM), { tone: "hi" }));
  out.push(`<path class="iso-line" data-tone="hi" data-part="table" d="${tableLine(M.RECHARGE.start)}"/>`);

  // ground surface
  out.push(topSurface());
  const contact = (x) => pathOf([at([x, YF, Z(ground(sOf(x)))]), at([x, YB, Z(ground(sOf(x)))])]);
  out.push(L(contact(CLAY_FROM) + contact(ALLU_FROM), { tone: "faint" }));
  const rnd = scatter(5);
  const grit = [];
  for (let i = 0; i < 90; i++) {
    const x = X0 + 1 + rnd() * (CLAY_FROM - X0 - 2);
    const y = YB + 1 + rnd() * (YF - YB - 2);
    grit.push(at([x, y, Z(ground(sOf(x)))]));
  }
  out.push(D(grit, { size: 0.36, tone: "lo" }));
  const fields = [];
  for (const x of [ALLU_FROM + 22, ALLU_FROM + 62, ALLU_FROM + 104]) {
    fields.push(pathOf([at([x, YB, Z(ground(sOf(x)))]), at([x, YF, Z(ground(sOf(x)))])]));
  }
  out.push(L(fields.join(""), { tone: "faint" }));

  out.push(L(outline, { tone: "mid" }));
  out.push(L(curveLine(ground), { tone: "mid" }));
  out.push(L(pathOf([at([X0, YF, 0]), at([X0, YF, Z(ground(0))])]) + pathOf([at([X1, YF, 0]), at([X1, YF, Z(ground(24))])]) + pathOf([at([X0, YF, Z(ground(0))]), at([X0, YB, Z(ground(0))])]), { tone: "mid" }));
  return out.join("");
}

// --- Things that move with the recharge level (source shared with the page) ---------------

function wetFront(recharge) {
  const top = XS.map((x) => F(x, Math.max(sandBottom(sOf(x)), Math.min(sandTop(sOf(x)), headAt(sOf(x), recharge)))));
  const bottom = XS.map((x) => F(x, sandBottom(sOf(x)))).reverse();
  return pathOf([...top, ...bottom], true);
}

function wetLeft(recharge) {
  const m = Math.min(recharge, ground(0));
  const lf = (y, e) => iso([X0, y, Z(e)], P);
  return pathOf([lf(YB, sandBottom(0)), lf(YF, sandBottom(0)), lf(YF, m), lf(YB, m)], true);
}

function tableLine(recharge) {
  const pts = [];
  for (const x of XS) {
    const s = sOf(x);
    const h = headAt(s, recharge);
    if (h >= sandTop(s)) {
      let lo = x - STEP, hi = x;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (headAt(sOf(mid), recharge) >= sandTop(sOf(mid))) hi = mid; else lo = mid;
      }
      pts.push(F(hi, headAt(sOf(hi), recharge)));
      break;
    }
    pts.push(F(x, h));
  }
  return pathOf(pts);
}

function tankWater(recharge) {
  const zt = Z(recharge);
  const a = (x, y, z) => iso([x, y, z], P);
  const x0 = TANK.x0 + 1.2, x1 = TANK.x1, y0 = TANK.y0 + 1.2, y1 = TANK.y1 - 1.2, zb = TANK.base;
  const front = pathOf([a(x0, y1, zb), a(x1, y1, zb), a(x1, y1, zt), a(x0, y1, zt)], true);
  const side = pathOf([a(x0, y0, zb), a(x0, y1, zb), a(x0, y1, zt), a(x0, y0, zt)], true);
  const top = pathOf([a(x0, y0, zt), a(x1, y0, zt), a(x1, y1, zt), a(x0, y1, zt)], true);
  return { body: front + side, top, rim: pathOf([a(x0, y0, zt), a(x0, y1, zt), a(x1, y1, zt)]) };
}

function wellColumn(recharge) {
  const s = WELL_S;
  const head = headAt(s, recharge);
  const soil = ground(s);
  const top = Math.min(head, soil);
  const a = (x, m) => iso([x, YF, Z(m)], P);
  const w = 1.3;
  return pathOf([a(XW - w, sandBottom(s) + 1), a(XW + w, sandBottom(s) + 1), a(XW + w, top), a(XW - w, top)], true);
}

function fountain(recharge) {
  const s = WELL_S;
  const head = headAt(s, recharge);
  const soil = ground(s);
  const over = head - soil;
  if (over < 0.05) return { jet: "", splash: [], pool: "" };
  const base = Z(soil) + COLLAR_H;
  const apex = Math.max(base + 0.4, Z(head));
  const spread = 2.4 + (apex - base) * 1.4;
  const jets = [];
  const splash = [];
  for (const side of [-1, 1]) {
    const pts = [];
    const land = Z(ground(sOf(XW + side * spread)));
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(iso([XW + side * (0.6 + spread * t), YW, apex - (apex - land) * t * t], P));
    }
    jets.push(pathOf(side < 0 ? [iso([XW, YW, base], P), iso([XW, YW, apex], P), ...pts] : [iso([XW, YW, apex], P), ...pts]));
    const end = pts[pts.length - 1];
    splash.push(end, [end[0] + side * 1.4, end[1] - 0.6], [end[0] + side * 2.4, end[1] + 0.2]);
  }
  const rx = spread + 2.4, ry = Math.min(3.2, 1.2 + over * 0.4);
  const pool = pathOf(Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    const x = XW + rx * Math.cos(a);
    return iso([x, YW + ry * Math.sin(a), Z(ground(sOf(x))) + 0.15], P);
  }), true);
  return { jet: jets.join(""), splash, pool };
}

function piezoColumns(recharge) {
  const s = PIEZO_S;
  const head = headAt(s, recharge);
  const soil = ground(s);
  const a = (x, y, z) => iso([x, y, z], P);
  const w = 0.7;
  const inCut = pathOf([a(XP - w, YF, Z(sandTop(s)) + 0.2), a(XP + w, YF, Z(sandTop(s)) + 0.2), a(XP + w, YF, Z(Math.min(head, soil))), a(XP - w, YF, Z(Math.min(head, soil)))], true);
  const zt = Math.min(Z(head), PIEZO_TOP - 1);
  const zb = Z(soil) + 1.2;
  const r = 0.75;
  const tube = zt > zb ? pathOf([a(XP - r, YP, zb), a(XP + r, YP, zb), a(XP + r, YP, zt), a(XP - r, YP, zt)], true) : "";
  return { inCut, tube };
}

const WELL_S = M.WELL_KM;
const PIEZO_S = M.PIEZO_KM;
const COLLAR_H = 1;

// --- Bench, staff and tank ---------------------------------------------------------------

function bench() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 16))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 4), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 8);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // km ruler along the section
  const strip = { x: X0 - 2, y: YF + 3, w: X1 - X0 + 4, d: 6, r: 0.8 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(X0, X1, KM, 5, strip.y, 0.6, [1.6, 3.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([XW, strip.y], [XW, strip.y + strip.d], 0.6, P), { tone: "hi" }));
  out.push(D([at([strip.x + 1, strip.y + 4.6, 0.6]), at([strip.x + strip.w - 1, strip.y + 4.6, 0.6])], { size: 0.4 }));
  // label plate
  const label = { x: 92, y: YF + 2, w: 30, d: 9, r: 1 };
  void label;
  return out.join("");
}

function labelPlate() {
  const label = { x: X1 - 2, y: YF + 0.5, w: 13, d: 9, r: 1 };
  const plan = { x: X1 + 4, y: -12, w: 9, d: 24, r: 1 };
  const out = [S(k.slabOf(plan, 0, 0.7, P, 3), { tone: "lo", crease: "none" })];
  out.push(L(k.planOutline(k.insetPlan(plan, 1.2), 0.7, P, 3), { tone: "faint" }));
  for (const [i, len] of [[0, 20], [1, 14], [2, 17]]) out.push(L(k.lineOnTop([plan.x + 2.6 + i * 1.9, plan.y + 4], [plan.x + 2.6 + i * 1.9, plan.y + 4 + len], 0.7, P), { tone: "lo", free: true }));
  out.push(D([at([plan.x + 4.5, plan.y + 1.6, 0.7]), at([plan.x + 4.5, plan.y + plan.d - 1.6, 0.7])], { size: 0.4 }));
  void label;
  return out.join("");
}

function staff() {
  const out = [];
  const plan = { x: STAFF.x, y: STAFF.y, w: STAFF.w, d: STAFF.d, r: 0.4 };
  out.push(S(k.slabOf({ x: STAFF.x - 2, y: STAFF.y - 2, w: STAFF.w + 4, d: STAFF.d + 4, r: 1 }, 0, 2, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf(plan, 2, STAFF_TOP - 2, P, 2, 0.3), { tone: "mid" }));
  const face = STAFF.y + STAFF.d;
  const minor = [], major = [];
  for (let m = 10; m <= 140; m += 10) {
    const z = Z(m);
    const big = m % 50 === 0;
    (big ? major : minor).push(k.segment([STAFF.x + STAFF.w, face, z], [STAFF.x + STAFF.w - (big ? 2.8 : 1.6), face, z], P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  out.push(S(k.slabOf({ x: STAFF.x - 0.5, y: STAFF.y - 0.5, w: STAFF.w + 1, d: STAFF.d + 1, r: 0.5 }, STAFF_TOP, 1.4, P, 2, 0.3), { tone: "mid" }));
  return out.join("");
}

function post(x, y, z0, z1) {
  return S(k.slabOf({ x: x - 1.2, y: y - 1.2, w: 2.4, d: 2.4, r: 0.4 }, z0, z1 - z0, P, 2, 0.3), { tone: "mid" });
}

function tankBack() {
  const { x0, x1, y0, y1, base } = TANK;
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 1 }, 0, 3, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf({ x: x0 - 2, y: y0 - 2, w: x1 - x0 + 2, d: y1 - y0 + 4, r: 1.2 }, 0, base, P, 3, 0.5), { tone: "mid" }));
  out.push(D([[x0 + 1.5, y1 + 0.5], [x1 - 3, y1 + 0.5]].map(([x, y]) => at([x, y, base])), { size: 0.45 }));
  // back glass: faint, the screen plate against the block
  const glass = pathOf([at([x0, y0, base]), at([x1, y0, base]), at([x1, y0, TANK_TOP]), at([x0, y0, TANK_TOP])], true);
  out.push(fillPath(glass, "np-glass"));
  out.push(post(x0, y0, base, TANK_TOP));
  out.push(post(x1 - 1.2, y0, base, TANK_TOP));
  // perforated screen where the tank meets the outcrop (x = x1)
  const holes = [];
  for (let m = sandBottom(0) + 4; m < ground(0) - 2; m += 5) for (let y = y0 + 4; y <= y1 - 4; y += 5) holes.push(at([x1, y, Z(m)]));
  out.push(D(holes, { size: 0.42, tone: "lo" }));
  // fixed outer standpipe of the overflow, with its drain through the base
  out.push(S(k.cylinder(PIPE[0], PIPE[1], 4.2, base, 1.4, P, 28), { tone: "mid" }));
  return out.join("");
}

function slider() {
  // the sliding overflow tube, built at its highest position and moved down
  const out = [];
  const z0 = SLIDE_HIGH - (SLIDE_HIGH - SLIDE_LOW) - 14;
  out.push(S(k.cylinder(PIPE[0], PIPE[1], 2.1, z0, SLIDE_HIGH - z0, P, 24), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(PIPE[0], PIPE[1], 1.4, SLIDE_HIGH, P, 20), { tone: "mid" }));
  // yoke from the tube rim to the threaded rod
  out.push(S(k.slabOf({ x: PIPE[0] - 0.6, y: PIPE[1] - 2.6, w: 1.2, d: 1.2, r: 0.3 }, SLIDE_HIGH, 3, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf({ x: PIPE[0] - 0.6, y: PIPE[1] - 2.6, w: 1.2, d: 5.2, r: 0.3 }, SLIDE_HIGH + 3, 1.2, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: PIPE[0] - 0.6, y: PIPE[1] + 1.4, w: 1.2, d: 1.2, r: 0.3 }, SLIDE_HIGH, 3, P, 2), { tone: "mid", crease: "none" }));
  const rodTop = CROSS_Z + 4.5 + (SLIDE_HIGH - SLIDE_LOW);
  out.push(S(k.cylinder(PIPE[0], PIPE[1], 0.75, SLIDE_HIGH + 4.2, rodTop - SLIDE_HIGH - 4.2, P, 14), { tone: "mid", crease: "none" }));
  const threads = [];
  for (let z = SLIDE_HIGH + 6; z < rodTop - 1; z += 1.6) threads.push(k.sideArc(PIPE[0], PIPE[1], 0.75, z, P, 8));
  out.push(L(threads.join(""), { tone: "faint" }));
  return out.join("");
}

function sliderKnob() {
  const rodTop = CROSS_Z + 4.5 + (SLIDE_HIGH - SLIDE_LOW);
  const out = [];
  out.push(S(k.cylinder(PIPE[0], PIPE[1], 3.6, rodTop, 3, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(PIPE[0], PIPE[1], 3.6, rodTop, rodTop + 3, 30, P), { tone: "lo" }));
  out.push(D([at([PIPE[0], PIPE[1], rodTop + 3])], { size: 0.55, tone: "hi" }));
  return out.join("");
}

function outerPipe() {
  const z1 = SLIDE_LOW - 3;
  const out = [S(k.cylinder(PIPE[0], PIPE[1], 2.9, TANK.base + 1.4, z1 - TANK.base - 1.4, P, 28), { tone: "mid", crease: "none" })];
  out.push(S(k.cylinder(PIPE[0], PIPE[1], 3.3, z1 - 1.6, 1.6, P, 28), { tone: "mid" }));
  out.push(L([20, 50, 80].map((z) => k.sideArc(PIPE[0], PIPE[1], 2.9, z, P, 14)).join(""), { tone: "faint" }));
  return out.join("");
}

function tankFront() {
  const { x0, x1, y0, y1, base } = TANK;
  const out = [];
  out.push(post(x0, y1 - 1.2, base, TANK_TOP));
  out.push(post(x1 - 1.2, y1 - 1.2, base, TANK_TOP));
  // top frame
  out.push(S(k.slabOf({ x: x0 - 1.2, y: y0 - 1.2, w: x1 - x0 + 1.2, d: 2.4, r: 0.3 }, TANK_TOP, 1.6, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x0 - 1.2, y: y0 - 1.2, w: 2.4, d: y1 - y0 + 1.2, r: 0.3 }, TANK_TOP, 1.6, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x1 - 2.4, y: y0 - 1.2, w: 2.4, d: y1 - y0 + 1.2, r: 0.3 }, TANK_TOP, 1.6, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x0 - 1.2, y: y1 - 1.2, w: x1 - x0 + 1.2, d: 2.4, r: 0.3 }, TANK_TOP, 1.6, P, 2), { tone: "mid" }));
  // the crossbar that carries the level screw
  out.push(S(k.slabOf({ x: PIPE[0] - 2.4, y: y0 - 1.2, w: 4.8, d: y1 - y0 + 1.2, r: 0.6 }, TANK_TOP + 1.6, 2.4, P, 2, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(PIPE[0], PIPE[1], 2, TANK_TOP + 4, 1.6, P, 6), { tone: "mid" }));
  out.push(D([[PIPE[0], y0 + 1], [PIPE[0], y1 - 2]].map(([x, y]) => at([x, y, TANK_TOP + 4])), { size: 0.45 }));
  // glass edges and its clamps
  out.push(D([TANK_TOP - 6, (TANK_TOP + base) / 2, base + 6].map((z) => at([x0 - 1.2, y1, z])), { size: 0.45 }));
  return out.join("");
}

// --- Wells, piezometer, trees -------------------------------------------------------------

function deepWell() {
  const s = WELL_S;
  const out = [];
  const a = (x, m) => at([x, YF, Z(m)]);
  const w = 2.2;
  const g = ground(s), b = sandBottom(s) - 1.5;
  out.push(fillPath(pathOf([a(XW - w, b), a(XW + w, b), a(XW + w, g), a(XW - w, g)], true), "np-bore"));
  out.push(`<path class="np-col" data-part="column" d="${wellColumn(M.RECHARGE.start)}"/>`);
  out.push(L(pathOf([a(XW - w, g), a(XW - w, b), a(XW + w, b), a(XW + w, g)]), { tone: "mid" }));
  const holes = [];
  for (let m = sandBottom(s) + 2; m < sandTop(s) - 1; m += 2.6) holes.push(a(XW - w, m), a(XW + w, m));
  out.push(D(holes, { size: 0.5, tone: "mid" }));
  // cement seal through the confining clay
  out.push(L(pathOf([a(XW - w, sandTop(s)), a(XW + w, sandTop(s))]), { tone: "lo" }));
  return out.join("");
}

function deepHead() {
  const z = Z(ground(WELL_S));
  const out = [];
  out.push(S(k.cylinder(XW, YW, 3.4, z, 0.8, P, 28, 0.3), { tone: "lo" }));
  out.push(S(k.cylinder(XW, YW, 2.4, z + 0.8, COLLAR_H - 0.8 + 0.6, P, 24), { tone: "mid" }));
  out.push(L(k.ring(XW, YW, 1.3, z + COLLAR_H + 0.6, P, 16), { tone: "mid" }));
  out.push(D([0, 1, 2, 3, 4, 5].map((i) => at([XW + 2.9 * Math.cos(i * Math.PI / 3), YW + 2.9 * Math.sin(i * Math.PI / 3), z + 0.8])), { size: 0.35 }));
  return out.join("");
}

function shallowWell() {
  const s = M.SHALLOW_KM;
  const out = [];
  const a = (x, m) => at([x, YF, Z(m)]);
  const w = 3.4;
  const g = ground(s), b = clayTop(s) + 0.6;
  out.push(fillPath(pathOf([a(XS_WELL - w, b), a(XS_WELL + w, b), a(XS_WELL + w, g), a(XS_WELL - w, g)], true), "np-bore"));
  out.push(fillPath(pathOf([a(XS_WELL - w + 0.9, b), a(XS_WELL + w - 0.9, b), a(XS_WELL + w - 0.9, waterTable(s)), a(XS_WELL - w + 0.9, waterTable(s))], true), "np-wet np-wet-strong"));
  out.push(L(pathOf([a(XS_WELL - w + 0.9, waterTable(s)), a(XS_WELL + w - 0.9, waterTable(s))]), { tone: "hi" }));
  const lining = [];
  for (const side of [-1, 1]) {
    const x = XS_WELL + side * (w - 0.9);
    lining.push(pathOf([a(x, g), a(x, b)]));
    for (let m = b + 1.4; m < g - 0.6; m += 1.6) lining.push(pathOf([a(x, m), a(XS_WELL + side * w, m)]));
  }
  out.push(L(pathOf([a(XS_WELL - w, g), a(XS_WELL - w, b), a(XS_WELL + w, b), a(XS_WELL + w, g)]), { tone: "mid" }));
  out.push(L(lining.join(""), { tone: "lo" }));
  return out.join("");
}

function shallowHead() {
  const z = Z(ground(M.SHALLOW_KM));
  const x = XS_WELL, y = YS_WELL;
  const out = [];
  out.push(S(k.cylinder(x, y, 4.6, z, 3.2, P, 40, 0.4), { tone: "mid" }));
  out.push(L([z + 1.1, z + 2.2].map((h) => k.sideArc(x, y, 4.6, h, P, 20)).join(""), { tone: "faint" }));
  out.push(fillPath(k.onTop(k.circleRing(x, y, 3.3, 32), z + 3.2, P, true), "np-bore"));
  out.push(L(k.ring(x, y, 3.3, z + 3.2, P, 32), { tone: "lo" }));
  // windlass: two posts, an axle, a crank, a rope and a bucket
  const top = z + 12;
  for (const px of [x - 5.4, x + 5.4]) out.push(S(k.slabOf({ x: px - 0.7, y: y - 0.7, w: 1.4, d: 1.4, r: 0.3 }, z, top - z, P, 2), { tone: "mid" }));
  const axle = G.frameAlong([x - 5.4, y, top - 1.6], [1, 0, 0]);
  out.push(S(G.disc(-0.6, 11.4, 0.9, axle, P), { tone: "mid" }));
  out.push(S(G.disc(4.4, 6.4, 1.5, axle, P), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x + 6, y: y - 0.4, w: 0.8, d: 0.8, r: 0.2 }, top - 4.6, 3.4, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(x + 6.4, y, 0.6, top - 6.6, 2, P, 12), { tone: "mid" }));
  out.push(L(k.segment([x + 0.2, y + 1.5, top - 1.6], [x + 0.2, y + 1.5, z + 5.6], P), { tone: "lo" }));
  out.push(S(k.cylinder(x + 0.2, y + 1.5, 1.3, z + 3.6, 2, P, 16), { tone: "mid" }));
  return out.join("");
}

function piezometer() {
  const s = PIEZO_S;
  const out = [];
  const a = (x, m) => at([x, YF, Z(m)]);
  const w = 1;
  const g = ground(s), b = sandTop(s) - 0.4;
  out.push(fillPath(pathOf([a(XP - w, b), a(XP + w, b), a(XP + w, g), a(XP - w, g)], true), "np-bore"));
  out.push(`<path class="np-wet np-wet-strong" data-part="piezo-cut" d="${piezoColumns(M.RECHARGE.start).inCut}"/>`);
  out.push(L(pathOf([a(XP - w, g), a(XP - w, b), a(XP + w, b), a(XP + w, g)]), { tone: "mid" }));
  return out.join("");
}

function piezoHead() {
  const z = Z(ground(PIEZO_S));
  const out = [];
  out.push(S(k.cylinder(XP, YP, 2.2, z, 1.2, P, 20), { tone: "mid" }));
  // the glass tube: drawn as its back wall, the water column, then its front edges
  out.push(fillPath(pathOf([at([XP - 1, YP, z + 1.2]), at([XP + 1, YP, z + 1.2]), at([XP + 1, YP, PIEZO_TOP]), at([XP - 1, YP, PIEZO_TOP])], true), "np-glass"));
  out.push(`<path class="np-wet np-wet-strong" data-part="piezo-tube" d="${piezoColumns(M.RECHARGE.start).tube}"/>`);
  out.push(L(pathOf([at([XP - 1, YP, z + 1.2]), at([XP - 1, YP, PIEZO_TOP])]) + pathOf([at([XP + 1, YP, z + 1.2]), at([XP + 1, YP, PIEZO_TOP])]), { tone: "mid" }));
  out.push(S(k.cylinder(XP, YP, 1.4, PIEZO_TOP, 1.4, P, 16), { tone: "mid" }));
  // its ruler, on a bracket behind
  const rx = XP + 2.2;
  out.push(S(k.slabOf({ x: rx, y: YP - 1.5, w: 2.2, d: 1, r: 0.2 }, z + 1.2, PIEZO_TOP - z - 1.2, P, 2), { tone: "lo" }));
  const ticks = [];
  for (let m = Math.ceil(ground(PIEZO_S) / 5) * 5; Z(m) < PIEZO_TOP - 0.5; m += 5) ticks.push(k.segment([rx, YP - 0.5, Z(m)], [rx + (m % 25 === 0 ? 1.6 : 0.9), YP - 0.5, Z(m)], P));
  out.push(L(ticks.join(""), { tone: "mid" }));
  return out.join("");
}

function tree(x, y, size) {
  const z = Z(ground(sOf(x)));
  const out = [];
  out.push(S(k.cylinder(x, y, 0.7 * size, z, 4 * size, P, 12), { tone: "mid", crease: "none" }));
  out.push(S(G.sphereOf([x, y, z + 4 * size + 2.6 * size], 3.2 * size, P), { tone: "mid" }));
  return out.join("");
}

// --- Assembly -----------------------------------------------------------------------------

const start = M.state(M.RECHARGE.start);
const water0 = tankWater(M.RECHARGE.start);
const jet0 = fountain(M.RECHARGE.start);
const piezo0 = piezoColumns(M.RECHARGE.start);
const slideBy = (recharge) => [0, 0, Z(recharge) - SLIDE_HIGH];

const STYLE = `<style>
.np-fig{--np-ink:var(--anatomy-hi)}
.np-fig .np-clay{fill:var(--anatomy-shade-1)}
.np-fig .np-clay2{fill:var(--anatomy-shade-0)}
.np-fig .np-sand{fill:var(--anatomy-shade-3)}
.np-fig .np-allu{fill:var(--anatomy-shade-2)}
.np-fig .np-side{filter:brightness(.97)}
.np-fig .np-wet{fill:var(--np-ink);fill-opacity:.17}
.np-fig .np-wet-strong{fill-opacity:.24}
.np-fig .np-water{fill:var(--np-ink);fill-opacity:.17;stroke:none}
.np-fig .np-water-top{fill:var(--np-ink);fill-opacity:.07;stroke:none}
.np-fig .np-glass{fill:var(--anatomy-paper);fill-opacity:.55;stroke:none}
.np-fig .np-bore{fill:var(--anatomy-shade-0)}
.np-fig .np-col{fill:var(--anatomy-lit);fill-opacity:.38;stroke:var(--anatomy-lit);stroke-width:.8}
.np-fig .np-jet{fill:none;stroke:var(--anatomy-lit);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.np-fig .np-splash circle{fill:var(--anatomy-lit);opacity:.9}
.np-fig .np-pool{fill:var(--np-ink);fill-opacity:.28;stroke:var(--anatomy-mid);stroke-width:var(--anatomy-weight)}
.np-fig .np-glass-edge{fill:none;stroke:var(--anatomy-mid);stroke-width:var(--anatomy-weight)}
</style>`;

const trees = [
  [X0 + 14, -14, 1.7], [X0 + 32, -2, 1.4], [X0 + 225, -15, 1.4], [X0 + 290, -12, 1.6],
].sort((p, q) => k.depthOf([p[0], p[1], 0], P) - k.depthOf([q[0], q[1], 0], P));

const tankGlass = () => {
  const { x0, x1, y1, base } = TANK;
  return `<path class="np-glass-edge" d="${pathOf([at([x0, y1, base]), at([x1, y1, base])])}"/>`;
};

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  className: "np-fig",
  label:
    "Maquette d'un bloc-diagramme posé sur un banc, coupé en façade : une couche de grès perméable prise entre deux couches d'argile imperméables forme une nappe captive ; elle affleure à gauche sur une colline, où un bac vitré à niveau réglable l'alimente. À droite, sous la plaine, des alluvions portent une nappe libre et un puits maçonné peu profond. Un piézomètre et un forage profond traversent l'argile jusqu'au grès : quand le niveau de recharge est assez haut, l'eau du forage monte au-dessus du sol et jaillit.",
  body: [
    STYLE,
    bench(),
    labelPlate(),
    block(),
    piezometer(),
    deepWell(),
    shallowWell(),
    trees.filter((t) => t[1] < -10).map((t) => tree(...t)).join(""),
    piezoHead(),
    shallowHead(),
    trees.filter((t) => t[1] >= -10).map((t) => tree(...t)).join(""),
    `<path class="np-pool" data-part="pool" d="${jet0.pool}"/>`,
    deepHead(),
    `<path class="np-jet" data-part="jet" d="${jet0.jet}"/>`,
    `<g class="np-splash" data-part="splash">${jet0.splash.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.55"/>`).join("")}</g>`,
    tankBack(),
    `<g data-part="slider" transform="${k.translateAlong(P, slideBy(M.RECHARGE.start))}">${slider()}</g>`,
    outerPipe(),
    `<path class="np-water" data-part="water" d="${water0.body}"/>`,
    `<path class="np-water-top" data-part="water-top" d="${water0.top}"/>`,
    `<path class="iso-line" data-tone="hi" data-part="water-rim" d="${water0.rim}"/>`,
    tankFront(),
    `<g data-part="knob" transform="${k.translateAlong(P, slideBy(M.RECHARGE.start))}">${sliderKnob()}</g>`,
    tankGlass(),
    staff(),
  ],
});

const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${model}
const P = ${JSON.stringify(P)};
const X0 = ${X0}, X1 = ${X1}, KM = ${KM}, YF = ${YF}, YB = ${YB}, ZU = ${ZU}, STEP = ${STEP};
const XW = ${XW}, YW = ${YW}, XP = ${XP}, YP = ${YP}, PIEZO_TOP = ${PIEZO_TOP}, COLLAR_H = ${COLLAR_H};
const WELL_S = ${WELL_S}, PIEZO_S = ${PIEZO_S}, SLIDE_HIGH = ${SLIDE_HIGH};
const TANK = ${JSON.stringify(TANK)};
const XS = Array.from({ length: Math.round((X1 - X0) / STEP) + 1 }, (_, i) => X0 + i * STEP);
const sOf = (x) => (x - X0) / KM;
const Z = (m) => (m - BOTTOM) * ZU;
const F = (x, m) => iso([x, YF, Z(m)], P);
${wetFront.toString()}
${wetLeft.toString()}
${tableLine.toString()}
${tankWater.toString()}
${wellColumn.toString()}
${fountain.toString()}
${piezoColumns.toString()}
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const els = { wet: part("wet"), wetLeft: part("wet-left"), table: part("table"), water: part("water"), waterTop: part("water-top"), rim: part("water-rim"), slider: part("slider"), knob: part("knob"), column: part("column"), jet: part("jet"), pool: part("pool"), splash: part("splash"), piezoCut: part("piezo-cut"), piezoTube: part("piezo-tube") };
const out = root.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const LOW = RECHARGE.low, HIGH = RECHARGE.high;
const clampLevel = (v) => Math.min(HIGH, Math.max(LOW, v));
let level = RECHARGE.start, target = level, frame = 0, last = 0, clock = 0, visible = false, idle = 0, spokenFlow = null;
let touring = !still.matches;
const tourAt = (t) => (LOW + HIGH) / 2 + ((HIGH - LOW) / 2) * Math.cos((t / 14) * Math.PI * 2);
function draw() {
  const s = state(level);
  els.wet.setAttribute("d", wetFront(level));
  els.wetLeft.setAttribute("d", wetLeft(level));
  els.table.setAttribute("d", tableLine(level));
  const w = tankWater(level);
  els.water.setAttribute("d", w.body);
  els.waterTop.setAttribute("d", w.top);
  els.rim.setAttribute("d", w.rim);
  const shift = translateAlong(P, [0, 0, Z(level) - SLIDE_HIGH]);
  els.slider.setAttribute("transform", shift);
  els.knob.setAttribute("transform", shift);
  els.column.setAttribute("d", wellColumn(level));
  const f = fountain(level);
  els.jet.setAttribute("d", f.jet);
  els.pool.setAttribute("d", f.pool);
  els.splash.innerHTML = f.splash.map(([x, y]) => '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="0.55"/>').join("");
  const pz = piezoColumns(level);
  els.piezoCut.setAttribute("d", pz.inCut);
  els.piezoTube.setAttribute("d", pz.tube);
  const text = readout(s);
  if (out.textContent !== text) out.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(level)));
  if (spokenFlow !== s.flowing || !touring) {
    spokenFlow = s.flowing;
    stage.setAttribute("aria-valuetext", spoken(s));
  }
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; target = tourAt(clock); }
  level = calm ? target : level + (target - level) * (1 - Math.exp(-dt / 0.35));
  if (Math.abs(target - level) < 0.01) level = target;
  draw();
  const settled = !touring && level === target;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  touring = false;
  target = clampLevel(next);
  clearTimeout(idle);
  idle = setTimeout(() => { if (!still.matches) { touring = true; clock = Math.acos(Math.max(-1, Math.min(1, (level - (LOW + HIGH) / 2) / ((HIGH - LOW) / 2)))) / (Math.PI * 2) * 14; run(); } }, 4000);
  if (still.matches) { level = target; draw(); }
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
const fromPointer = (e) => {
  const box = svg.getBoundingClientRect();
  const share = Math.min(1, Math.max(0, ((e.clientY - box.top) / box.height - 0.2) / 0.55));
  return HIGH - share * (HIGH - LOW);
};
stage.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") steer(fromPointer(e)); });
stage.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") steer(fromPointer(e)); });
stage.addEventListener("keydown", (e) => {
  const big = e.shiftKey ? 5 : 1;
  let to = null;
  if (e.key === "ArrowUp" || e.key === "ArrowRight") to = target + 1 * big;
  if (e.key === "ArrowDown" || e.key === "ArrowLeft") to = target - 1 * big;
  if (e.key === "PageUp") to = target + 5;
  if (e.key === "PageDown") to = target - 5;
  if (e.key === "Home") to = LOW;
  if (e.key === "End") to = HIGH;
  if (to === null) return;
  e.preventDefault();
  steer(to);
});
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Nappe artésienne",
  hint: "Survol, toucher ou ↑ ↓ : recharge",
  readout: M.readout(start),
  keys: [
    { mark: "lit", label: "L'eau du forage profond : elle monte jusqu'au niveau piézométrique, et jaillit s'il dépasse le sol" },
    { mark: "raised", label: "Le bac de recharge : la vis règle le niveau de l'eau dans le grès qui affleure" },
    { mark: "dotted", label: "Grès perméable (pointillé) entre deux argiles imperméables litées" },
  ],
  caption:
    "Coupe d'un bassin artésien en maquette. Le grès, perméable, est pris entre deux argiles imperméables : là où il affleure, sur la colline, la pluie le recharge ; sous la plaine, l'eau y est captive et sous pression. Le niveau piézométrique baisse en ligne droite de la zone de recharge à l'exutoire (loi de Darcy, régime permanent) ; au forage, à 9 km, s'il passe au-dessus du sol, le puits jaillit, alors que le puits maçonné, qui ne touche que la nappe libre des alluvions, garde son eau 3,5 m sous le sol. Modèle simplifié : coupe de 24 km, exutoire (une vallée) à 60 m d'altitude au bout de la coupe, grès de 30 m d'épaisseur, K = 5·10⁻⁵ m/s, porosité 0,2 (l'eau y avance d'environ 20 m par an) ; débit jaillissant estimé par la formule de Thiem (rayon d'influence 500 m, forage de 10 cm), sans pertes de charge dans le tubage. Ordres de grandeur, pas un bassin réel ; échelle verticale très exagérée.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Nappe artésienne : flèches haut et bas pour régler le niveau de recharge, en mètres d'altitude" aria-valuemin="${M.RECHARGE.low}" aria-valuemax="${M.RECHARGE.high}" aria-valuenow="${M.RECHARGE.start}" aria-valuetext="${M.spoken(start)}" style="touch-action:pan-y">${svg}</div>`,
});

export function render() {
  return { plate: body, live };
}
