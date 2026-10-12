import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const title = "Netfilter";

const WIDTH = 600;
const HEIGHT = 350;
const AZ = 62;

// World: x along the main belt (arrival → departure), y toward the viewer, z up.
const PLATE = { x: -164, y: -138, w: 330, d: 186, r: 9 };
const PLATE_H = 10;
const FOOT_H = 5;
const BZ = 16; // belt surface
const BED = 9; // belt bed bottom

const MAIN = { x: -152, y: -10, w: 306, d: 20, r: 1.2 };
const BR_IN = { x: -70, y: -86, w: 20, d: 76, r: 1.2 };
const BR_OUT = { x: 40, y: -86, w: 20, d: 76, r: 1.2 };
const OFFICE = { x: -92, y: -128, w: 172, d: 42, r: 2 };
const OFFICE_TOP = 50;

const POST_TOP = 54;
const PARCEL = { w: 14, d: 12, h: 11 };

// Stations (centre of the belt under them).
const ST = {
  entry: [-136, 0],
  pre: [-104, 0],
  junction: [-60, 0],
  forward: [6, 0],
  post: [96, 0],
  exit: [134, 0],
  input: [-60, -50],
  output: [50, -50],
};

const BINS = {
  FORWARD: { x: -15, y: 20, w: 24, d: 21, r: 1.2 },
  INPUT: { x: -46, y: -46, w: 21, d: 21, r: 1.2 },
  OUTPUT: { x: 63, y: -77, w: 21, d: 22, r: 1.2 },
};
const BIN_H = 13;

// Pushers: a housing, a plate that moves `travel` along `axis` (sign `dir`),
// and a rod rebuilt each frame from the housing face to the plate.
const PUSHERS = {
  push: { axis: 1, dir: -1, housing: { x: -68, y: 15, w: 16, d: 14, r: 1.2 }, face: 15, plate: { x: -67, y: 6.5, w: 14, d: 3, r: 0.6 }, rod: [-61.6, -58.4], travel: 17 },
  INPUT: { axis: 0, dir: 1, housing: { x: -86, y: -46, w: 12, d: 10, r: 1.2 }, face: -74, plate: { x: -70.5, y: -46, w: 3, d: 10, r: 0.6 }, rod: [-42.6, -39.4], travel: 9 },
  FORWARD: { axis: 1, dir: 1, housing: { x: -11, y: -29, w: 12, d: 12, r: 1.2 }, face: -17, plate: { x: -10, y: -9.5, w: 10, d: 3, r: 0.6 }, rod: [-7.6, -4.4], travel: 9 },
  OUTPUT: { axis: 0, dir: 1, housing: { x: 25, y: -64, w: 12, d: 10, r: 1.2 }, face: 37, plate: { x: 39.5, y: -64, w: 3, d: 10, r: 0.6 }, rod: [-60.6, -57.4], travel: 9 },
};
const ROD_Z = [BZ + 3, BZ + 6];
const HOUSE_Z = [BZ - 3, BZ + 9];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [ST.entry[0], -18, POST_TOP + 6], [ST.exit[0], 18, POST_TOP + 6], [OFFICE.x, OFFICE.y, OFFICE_TOP + 4], [OFFICE.x + OFFICE.w, OFFICE.y, OFFICE_TOP + 4]],
  WIDTH,
  HEIGHT,
  { pad: 14, azimuth: AZ },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const dk = (x, y) => k.depthOf([x, y, 0], P);
const byDepth = (points) => [...points].sort((a, b) => dk(a[0], a[1]) - dk(b[0], b[1]));
const box = (x0, x1, y0, y1, z0, z1, steps = 2, bevel = 0) => k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0.5 }, z0, z1 - z0, P, steps, bevel);
const face = (points) => k.pathOf(points.map(at), true);

// ---------- floor layer: plate, ruler, label plate, belts ----------
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
  const strip = { x: -150, y: PLATE.y + PLATE.d - 12, w: 140, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.6, 3.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3, 0.6]), at([strip.x + strip.w - 2, strip.y + 3, 0.6])], { size: 0.45 }));
  const label = { x: 102, y: PLATE.y + PLATE.d - 20, w: 44, d: 13, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 3), { tone: "faint" }));
  for (const [i, len] of [[0, 30], [1, 22], [2, 26]]) out.push(L(k.lineOnTop([label.x + 6, label.y + 3.6 + i * 2.8], [label.x + 6 + len, label.y + 3.6 + i * 2.8], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + 3, label.y + 3, 0.8]), at([label.x + label.w - 3, label.y + label.d - 3, 0.8])], { size: 0.4 }));
  return out.join("");
}

function belt(plan, along, legs) {
  const out = [];
  const x1 = plan.x + plan.w, y1 = plan.y + plan.d;
  for (const [x, y] of byDepth(legs)) {
    out.push(S(k.slabOf({ x: x - 2, y: y - 2, w: 4, d: 4, r: 0.6 }, 0, BED, P, 2), { tone: "lo" }));
    out.push(S(k.slabOf({ x: x - 3.5, y: y - 3.5, w: 7, d: 7, r: 1 }, 0, 1, P, 2), { tone: "lo" }));
  }
  const seam = k.sideSeam(plan, BZ - 2, P, 2);
  out.push(S(k.slabOf(plan, BED, BZ - BED, P, 2, 0.4), { tone: "mid", inner: L(seam, { tone: "faint" }) }));
  // Rollers under the belt skin: lines across the top, edge to edge.
  const lines = [];
  if (along === "x") for (let x = plan.x + 4; x < x1 - 2; x += 5) lines.push(k.lineOnTop([x, plan.y + 0.2], [x, y1 - 0.2], BZ, P));
  else for (let y = plan.y + 4; y < y1 - 2; y += 5) lines.push(k.lineOnTop([plan.x + 0.2, y], [x1 - 0.2, y], BZ, P));
  out.push(L(lines.join(""), { tone: "faint" }));
  // Roller axle ends on the near side.
  const axles = [];
  if (along === "x") for (let x = plan.x + 9; x < x1 - 4; x += 10) axles.push(at([x, y1, (BED + BZ - 2) / 2]));
  else for (let y = plan.y + 9; y < y1 - 4; y += 10) axles.push(at([x1, y, (BED + BZ - 2) / 2]));
  out.push(D(axles, { size: 0.45, tone: "lo" }));
  return out.join("");
}

const mainBelt = () => belt(MAIN, "x", [-146, -118, -84, -30, 26, 76, 116, 146].flatMap((x) => [[x, -6], [x, 6]]));
function floor() {
  return [
    base(),
    belt(BR_IN, "y", [[-66, -78], [-54, -78], [-66, -24], [-54, -24]]),
    belt(BR_OUT, "y", [[44, -78], [56, -78], [44, -24], [56, -24]]),
  ].join("");
}

// ---------- sorted layer ----------
const items = [];
const put = (key, svg, attrs = "", back = false) => items.push({ key, back, svg: `<g data-k="${key.toFixed(2)}"${attrs}>${svg}</g>` });

function post(x, y, top = POST_TOP) {
  const out = [];
  out.push(S(k.slabOf({ x: x - 3.5, y: y - 3.5, w: 7, d: 7, r: 0.8 }, 0, 1.4, P, 2, 0.3), { tone: "lo" }));
  out.push(D([at([x - 2.4, y + 2.4, 1.4]), at([x + 2.4, y + 2.4, 1.4]), at([x + 2.4, y - 2.4, 1.4])], { size: 0.35 }));
  const plan = { x: x - 2.2, y: y - 2.2, w: 4.4, d: 4.4, r: 0.5 };
  out.push(S(k.slabOf(plan, 1.4, top - 1.4, P, 2, 0.3), { tone: "mid", inner: L(k.sideSeam(plan, BZ + 2, P, 2), { tone: "faint" }) }));
  return out.join("");
}

// A portal across a belt running along x (posts at y = ±15) or along y (posts at x = cx ± 15).
function portal(cx, cy, along, kind) {
  const posts = along === "x" ? [[cx, cy - 15], [cx, cy + 15]] : [[cx - 15, cy], [cx + 15, cy]];
  const [back, front] = posts;
  put(dk(...back), post(...back), "", along === "x" || cy < -10);
  put(dk(...front), post(...front), "", cy < -10);
  const beam = along === "x" ? box(cx - 3, cx + 3, cy - 18, cy + 18, POST_TOP, POST_TOP + 5, 2, 0.4) : box(cx - 18, cx + 18, cy - 3, cy + 3, POST_TOP, POST_TOP + 5, 2, 0.4);
  const ends = along === "x" ? [[cx, cy - 15], [cx, cy + 15]] : [[cx - 15, cy], [cx + 15, cy]];
  return { beam: S(beam, { tone: "mid" }) + D(ends.map(([x, y]) => at([x, y, POST_TOP + 5])), { size: 0.45 }), front, back };
}

function door(cx) {
  const p = portal(cx, 0, "x", "door");
  // Strip curtain: six hanging strips, the arrival or departure of the machine.
  const strips = [];
  for (let i = 0; i < 6; i++) {
    const y0 = -12 + i * 4;
    strips.push(S(box(cx - 0.4, cx + 0.4, y0 + 0.2, y0 + 3.8, BZ + 1.5, POST_TOP, 2), { tone: "lo", crease: "none" }));
  }
  put(dk(cx, 0) + 0.2, strips.join(""));
  const hood = S(box(cx - 6, cx + 6, -19, 19, POST_TOP + 5, POST_TOP + 7.5, 2, 0.4), { tone: "mid" });
  put(dk(cx, 0) + 0.6, p.beam + hood + D([-14, -5, 5, 14].map((y) => at([cx + 6, y, POST_TOP + 7.5 - 1.2]).map((v) => v)), { size: 0.4, tone: "lo" }));
}

function stamp(name, cx) {
  const p = portal(cx, 0, "x", "stamp");
  const housing = S(box(cx - 5.5, cx + 5.5, -5.5, 5.5, 40, POST_TOP, 2, 0.4), { tone: "mid", inner: L(k.sideSeam({ x: cx - 5.5, y: -5.5, w: 11, d: 11, r: 0.5 }, 46, P, 2), { tone: "faint" }) });
  const bracket = S(box(cx - 7, cx + 7, -7, 7, POST_TOP - 2, POST_TOP, 2), { tone: "mid" });
  // Moving head: rod, collar and the round stamp pad.
  const head = [
    S(k.cylinder(cx, 0, 1.5, 38, 16, P, 16), { tone: "mid", crease: "none" }),
    S(k.cylinder(cx, 0, 3.2, 37, 2, P, 24), { tone: "mid" }),
    S(k.cylinder(cx, 0, 5, 34, 3, P, 32, 0.3), { tone: "hi", crease: "lo" }),
    L(k.sideArc(cx, 0, 5, 35.3, P, 24), { tone: "faint" }),
  ].join("");
  put(dk(cx, 0) + 1.2, `<g data-stamp="${name}">${head}</g>`);
  put(dk(cx, 0) + 1.6, housing + bracket + p.beam);
}

function gate(chain, cx, cy, along) {
  const p = portal(cx, cy, along, "gate");
  // Barrier: rides in the posts, lifted only to let a parcel through.
  const [bx0, bx1, by0, by1] = along === "x" ? [cx - 1.6, cx + 1.6, cy - 12.8, cy + 12.8] : [cx - 12.8, cx + 12.8, cy - 1.6, cy + 1.6];
  const stripes = [];
  for (let i = -2; i <= 2; i++) {
    const t = i * 4.8;
    stripes.push(along === "x" ? k.lineOnTop([bx0, cy + t], [bx1, cy + t], BZ + 7, P) : k.lineOnTop([cx + t, by0], [cx + t, by1], BZ + 7, P));
  }
  const bar = S(box(bx0, bx1, by0, by1, BZ + 2.5, BZ + 7, 2, 0.3), { tone: "hi", crease: "lo" }) + L(stripes.join(""), { tone: "lo" });
  put(dk(cx, cy) + 0.3, `<g data-bar="${chain}">${bar}</g>`, "", cy < -10);
  put(dk(cx, cy) + 0.6, p.beam, "", cy < -10);
  // Rule tab on the near post: slides up its outer face when a DROP rule sits on this chain.
  const [fx, fy] = p.front;
  const tab = along === "x"
    ? S(box(fx - 2, fx + 2, fy + 2.2, fy + 3.2, 4, 10, 2), { tone: "hi", crease: "lo" }) + D([at([fx, fy + 3.2, 7])], { size: 0.4, tone: "hi" })
    : S(box(fx + 2.2, fx + 3.2, fy - 2, fy + 2, 4, 10, 2), { tone: "hi", crease: "lo" }) + D([at([fx + 3.2, fy, 7])], { size: 0.4, tone: "hi" });
  put(dk(fx, fy) + 0.2, `<g data-tab="${chain}">${tab}</g>`, "", cy < -10);
}

function bin(chain) {
  const b = BINS[chain];
  const t = 1.4;
  const x1 = b.x + b.w, y1 = b.y + b.d;
  const c = [b.x + b.w / 2, b.y + b.d / 2];
  const back = [
    `<path class="iso-halo" d="${k.haloOf(b, 0, 1, P)}" style="filter:blur(2px)"/>`,
    S(k.slabOf(b, 0, 1.6, P, 2, 0.3), { tone: "lo" }),
    S(box(b.x, x1, b.y, b.y + t, 1.6, BIN_H, 2), { tone: "mid" }),
    S(box(b.x, b.x + t, b.y + t, y1, 1.6, BIN_H, 2), { tone: "mid" }),
    L(k.lineOnTop([b.x + t, b.y + t + 4], [x1, b.y + t + 4], 1.6, P) + k.lineOnTop([b.x + t, b.y + t + 9], [x1, b.y + t + 9], 1.6, P) + k.lineOnTop([b.x + t, b.y + t + 14], [x1, b.y + t + 14], 1.6, P), { tone: "faint" }),
  ].join("");
  const front = [
    S(box(x1 - t, x1, b.y + t, y1, 1.6, BIN_H, 2), { tone: "mid" }),
    S(box(b.x, x1, y1 - t, y1, 1.6, BIN_H, 2, 0.2), { tone: "mid" }),
    D([at([b.x + 3, y1, BIN_H - 2.5]), at([x1 - 3, y1, BIN_H - 2.5]), at([x1, b.y + 4, BIN_H - 2.5]), at([x1, y1 - 3, BIN_H - 2.5])], { size: 0.4 }),
  ].join("");
  put(dk(...c) - 14, back, "", chain !== "FORWARD");
  put(dk(...c) + 14, front, "", chain !== "FORWARD");
}

function pusher(name) {
  const p = PUSHERS[name];
  const h = p.housing;
  const hx1 = h.x + h.w, hy1 = h.y + h.d;
  const hc = [h.x + h.w / 2, h.y + h.d / 2];
  const pedestal = S(k.slabOf(k.insetPlan(h, 1.5), 0, HOUSE_Z[0], P, 2), { tone: "lo" });
  const foot = S(k.slabOf(k.insetPlan(h, -1), 0, 1.2, P, 2), { tone: "lo" });
  const body = S(k.slabOf(h, HOUSE_Z[0], HOUSE_Z[1] - HOUSE_Z[0], P, 3, 0.4), { tone: "mid", inner: L(k.sideSeam(h, HOUSE_Z[0] + 4, P, 3), { tone: "faint" }) });
  const screws = D([at([h.x + 2, h.y + 2, HOUSE_Z[1]]), at([hx1 - 2, h.y + 2, HOUSE_Z[1]]), at([h.x + 2, hy1 - 2, HOUSE_Z[1]]), at([hx1 - 2, hy1 - 2, HOUSE_Z[1]])], { size: 0.4 });
  const vent = L(k.planOutline({ x: hc[0] - 3, y: hc[1] - 1, w: 6, d: 2, r: 0.9 }, HOUSE_Z[1], P, 3), { tone: "lo" });
  const pl = p.plate;
  const plate = S(k.slabOf(pl, BZ + 0.6, 9, P, 2, 0.3), { tone: "mid" }) + D([at([pl.x + pl.w / 2, pl.y + pl.d / 2, BZ + 9.6])], { size: 0.4 });
  const plateKey = dk(pl.x + pl.w / 2, pl.y + pl.d / 2);
  const houseKey = dk(...hc);
  const rest = name === "push" ? p.plate.y + p.plate.d : p.axis === 0 ? p.plate.x : p.plate.y;
  put(Math.min(plateKey, houseKey) + (name === "push" ? 0 : 0.5) + (name === "push" ? 0 : 0), `<g data-rod="${name}">${rodSvg(p, 0)}</g><g data-plate="${name}">${plate}</g>`, "", name === "INPUT" || name === "OUTPUT");
  put(houseKey + (name === "push" ? 0 : -0.01), foot + pedestal + body + screws + vent, "", name !== "push");
  void rest;
}

// The rod between the housing face and the plate, at extension e (world units).
function rodSvg(p, e) {
  const [a, b] = p.rod;
  if (p.axis === 1) {
    const plateFace = p.dir < 0 ? p.plate.y + p.plate.d : p.plate.y;
    const y0 = Math.min(p.face, plateFace + p.dir * e), y1 = Math.max(p.face, plateFace + p.dir * e);
    return S(k.slabOf({ x: a, y: y0, w: b - a, d: y1 - y0, r: 0.6 }, ROD_Z[0], ROD_Z[1] - ROD_Z[0], P, 2), { tone: "mid", crease: "none" });
  }
  const plateFace = p.plate.x;
  const x0 = Math.min(p.face, plateFace + p.dir * e), x1 = Math.max(p.face, plateFace + p.dir * e);
  return S(k.slabOf({ x: x0, y: a, w: x1 - x0, d: b - a, r: 0.6 }, ROD_Z[0], ROD_Z[1] - ROD_Z[0], P, 2), { tone: "mid", crease: "none" });
}

function office() {
  const o = OFFICE;
  const x1 = o.x + o.w, y1 = o.y + o.d;
  const out = [`<path class="iso-halo" d="${k.haloOf(o, 0, 4, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(k.insetPlan(o, -1.5), 0, 4, P, 3, 0.4), { tone: "lo" }));
  const seams = L([18, 34].map((z) => k.sideSeam(o, z, P, 3)).join(""), { tone: "faint" });
  out.push(S(k.slabOf(o, 4, OFFICE_TOP - 4, P, 3, 0.5), { tone: "mid", inner: seams }));
  out.push(S(k.slabOf(k.insetPlan(o, -1.5), OFFICE_TOP, 3, P, 3, 0.5), { tone: "mid" }));
  // Two hatches in the front face: the INPUT belt goes in, the OUTPUT belt comes out.
  for (const cx of [ST.input[0], ST.output[0]]) {
    const xa = cx - 11, xb = cx + 11, za = BZ, zb = BZ + 14;
    out.push(`<path class="iso-shade" data-shade="0" d="${face([[xa, y1, za], [xb, y1, za], [xb, y1, zb], [xa, y1, zb]])}"/>`);
    out.push(L(face([[xa, y1, za], [xb, y1, za], [xb, y1, zb], [xa, y1, zb]]), { tone: "lo" }));
    out.push(S(box(xa - 2, xb + 2, y1, y1 + 3, zb, zb + 2.5, 2, 0.3), { tone: "mid" }));
    const flaps = [];
    for (let x = xa + 3.6; x < xb - 1; x += 3.6) flaps.push(k.segment([x, y1, zb], [x, y1, za + 5], P));
    out.push(L(flaps.join(""), { tone: "lo", free: "end" }));
  }
  // Pigeonholes across the upper front: closed slots.
  const slots = [];
  for (let i = 0; i < 9; i++) {
    const xa = o.x + 34 + i * 12;
    if (Math.abs(xa + 4 - ST.input[0]) < 13 || Math.abs(xa + 4 - ST.output[0]) < 13) continue;
    slots.push(face([[xa, y1, 38], [xa + 8, y1, 38], [xa + 8, y1, 44], [xa, y1, 44]]));
  }
  out.push(L(slots.join(""), { tone: "lo" }));
  // Panel with a lamp and a knob on the left end.
  const pnl = [[o.x + 6, y1, 22], [o.x + 22, y1, 22], [o.x + 22, y1, 32], [o.x + 6, y1, 32]];
  out.push(L(face(pnl), { tone: "lo" }));
  out.push(D([at([o.x + 10, y1, 27]), at([o.x + 18, y1, 27])], { size: 0.8, tone: "mid" }));
  out.push(D([at([o.x + 3, y1, 8]), at([x1 - 3, y1, 8]), at([o.x + 3, y1, OFFICE_TOP - 4]), at([x1 - 3, y1, OFFICE_TOP - 4])], { size: 0.45 }));
  // Vents on the right end face.
  const vents = [];
  for (let i = 0; i < 4; i++) vents.push(face([[x1, o.y + 8, 12 + i * 7], [x1, y1 - 8, 12 + i * 7], [x1, y1 - 8, 14 + i * 7], [x1, o.y + 8, 14 + i * 7]]));
  out.push(L(vents.join(""), { tone: "lo" }));
  // Trays on the roof.
  for (const cx of [o.x + 30, o.x + 136]) {
    out.push(S(k.slabOf({ x: cx - 12, y: o.y + 10, w: 24, d: 20, r: 1 }, OFFICE_TOP + 3, 4, P, 2, 0.3), { tone: "mid" }));
    out.push(L(k.planOutline({ x: cx - 10, y: o.y + 12, w: 20, d: 16, r: 0.8 }, OFFICE_TOP + 7, P, 2), { tone: "faint" }));
  }
  return out.join("");
}

const parcelSvg = () => {
  const { w, d, h } = PARCEL;
  const pl = { x: -w / 2, y: -d / 2, w, d, r: 0.6 };
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(pl, BZ, 0.5, P)}" style="filter:blur(1.5px)" data-shadow/>`);
  out.push(S(k.slabOf(pl, BZ, h, P, 2, 0.4), { tone: "hi", lit: true, crease: "lo", inner: L(k.segment([1.8, d / 2, BZ + h], [1.8, d / 2, BZ], P) + k.segment([w / 2, -1, BZ + h], [w / 2, -1, BZ], P), { tone: "lo" }) }));
  out.push(L(k.lineOnTop([1.8, -d / 2], [1.8, d / 2], BZ + h, P), { tone: "lo" }));
  const label = { x: -6, y: -4.4, w: 6, d: 8.8, r: 0.4 };
  out.push(S(k.slabOf(label, BZ + h, 0.3, P, 2), { tone: "lo", crease: "none" }));
  out.push(L(k.lineOnTop([-5, -2.8], [-1.2, -2.8], BZ + h + 0.3, P) + k.lineOnTop([-5, -1.2], [-2.4, -1.2], BZ + h + 0.3, P), { tone: "mid", free: true }));
  out.push(`<g data-mark="dst" opacity="0">${L(k.ring(-3, 2.2, 1.5, BZ + h + 0.3, P, 16), { tone: "lit" })}</g>`);
  out.push(`<g data-mark="src" opacity="0">${L(k.ring(4.6, 2.8, 1.5, BZ + h, P, 16), { tone: "lit" })}</g>`);
  return out.join("");
};

put(-1e4, office(), "", true);
door(ST.entry[0]);
door(ST.exit[0]);
stamp("PREROUTING", ST.pre[0]);
stamp("POSTROUTING", ST.post[0]);
gate("FORWARD", ST.forward[0], ST.forward[1], "x");
gate("INPUT", ST.input[0], ST.input[1], "y");
gate("OUTPUT", ST.output[0], ST.output[1], "y");
for (const chain of M.FILTERABLE) bin(chain);
for (const name of Object.keys(PUSHERS)) pusher(name);
items.sort((a, b) => a.key - b.key);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Une trieuse de colis sur un banc : chaque colis est un paquet réseau. Il entre par la porte à rideau de gauche, passe sous un premier poste à tampon, arrive à un aiguillage à poussoir, puis soit monte vers le bureau du fond par une barrière, soit file tout droit par une barrière et un second poste à tampon jusqu'à la porte de droite. Le bureau renvoie aussi des colis par un second tapis et une barrière. Chaque barrière a un bac de rebut à côté : un colis refusé y tombe.",
  body: [
    floor(),
    `<g data-layer="back">${items.filter((i) => i.back).map((item) => item.svg).join("")}</g>`,
    mainBelt(),
    `<g data-layer="front">${items.filter((i) => !i.back).map((item) => item.svg).join("")}<g data-part="parcel" data-k="0" opacity="0">${parcelSvg()}</g></g>`,
  ],
});

const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${model}
const P = ${JSON.stringify(P)};
const BZ = ${BZ}, STAMP = ${34 - BZ - PARCEL.h}, ROD_Z = ${JSON.stringify(ROD_Z)};
const ST = ${JSON.stringify(ST)};
const BINS = ${JSON.stringify(BINS)};
const PUSHERS = ${JSON.stringify(PUSHERS)};
const rodSvg = ${rodSvg.toString().replace(/\bk\./g, "").replace(/\bS\(/g, "solidS(")};
const solidS = (paths, style) => solidSvg(paths, style);
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const layers = { back: svg.querySelector('[data-layer="back"]'), front: svg.querySelector('[data-layer="front"]') };
const parcel = svg.querySelector('[data-part="parcel"]');
const marks = { dst: parcel.querySelector('[data-mark="dst"]'), src: parcel.querySelector('[data-mark="src"]') };
const out = root.querySelector("[data-readout]");
const say = root.querySelector("[data-say]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const q = (sel) => svg.querySelector(sel);
const bars = { INPUT: q('[data-bar="INPUT"]'), FORWARD: q('[data-bar="FORWARD"]'), OUTPUT: q('[data-bar="OUTPUT"]') };
const tabs = { INPUT: q('[data-tab="INPUT"]'), FORWARD: q('[data-tab="FORWARD"]'), OUTPUT: q('[data-tab="OUTPUT"]') };
const heads = { PREROUTING: q('[data-stamp="PREROUTING"]'), POSTROUTING: q('[data-stamp="POSTROUTING"]') };
const rods = {}, plates = {};
for (const name in PUSHERS) { rods[name] = q('[data-rod="' + name + '"]'); plates[name] = q('[data-plate="' + name + '"]'); }
const others = {}, keys = {};
for (const name in layers) { others[name] = [...layers[name].children].filter((el) => el !== parcel); keys[name] = others[name].map((el) => Number(el.dataset.k)); }
const dk = (x, y) => depthOf([x, y, 0], P);
const binC = (c) => [BINS[c].x + BINS[c].w / 2, BINS[c].y + BINS[c].d / 2];
const STOP = { FORWARD: [ST.forward[0] - 10, 0], INPUT: [ST.input[0], ST.input[1] + 9], OUTPUT: [ST.output[0], ST.output[1] - 9] };
const SIDE = { FORWARD: [0, 1], INPUT: [1, 0], OUTPUT: [1, 0] };
const pt = (xy, z = BZ) => [xy[0], xy[1], z];

// One journey as a list of phases: moves along straight legs and holds that set targets.
function plan(j) {
  const ph = [];
  let here = null;
  const go = (to, speed = 72, ease = "both") => { const from = here; here = to; const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]); ph.push({ dur: Math.max(0.12, len / speed), from, to, ease }); };
  const hold = (dur, set = {}, text) => ph.push({ dur, set, text });
  const t = j.type;
  if (t === 3) here = pt([ST.output[0], -96]); else here = pt([ST.entry[0] - 16, 0]);
  hold(0.5, { dst: 0, src: 0 }, "colis : " + TYPES[t].name);
  for (const s of j.steps) {
    const text = stepText(s);
    if (s.chain === "PREROUTING") {
      go(pt(ST.pre));
      hold(0.25, {}, text);
      if (s.act === "dnat") { hold(0.3, { PREROUTING: 1 }); hold(0.45, { PREROUTING: 0, dst: 1 }); } else hold(0.55);
    } else if (s.chain === "ROUTE") {
      go(pt(ST.junction));
      hold(0.75, {}, text);
      if (s.to === "INPUT") { hold(0.12, { push: 1 }); go(pt([ST.junction[0], -16.5]), 36); hold(0.1, { push: 0 }); go(pt(STOP.INPUT)); }
      else go(pt(STOP.FORWARD));
    } else if (s.act === "filter") {
      const c = s.chain;
      if (c === "OUTPUT") go(pt(STOP.OUTPUT));
      hold(0.6, {}, text);
      if (s.verdict === "ACCEPT") {
        hold(0.5, { [c]: 1 });
        if (c === "INPUT") { go(pt([ST.input[0], -96])); hold(0.1, { [c]: 0 }); }
        else if (c === "OUTPUT") { go(pt([ST.output[0], 0])); hold(0.05, { [c]: 0 }); }
        else { go(pt([ST.forward[0] + 18, 0])); hold(0.01, { [c]: 0 }); }
      } else {
        const [sx, sy] = SIDE[c], b = binC(c);
        hold(0.1, { ["k" + c]: 1 });
        go([b[0] * sx + here[0] * (1 - sx), b[1] * sy + here[1] * (1 - sy), BZ + 0.4], 42);
        hold(0.01, { ["k" + c]: 0 });
        go([b[0], b[1], 1.6], 60, "in");
      }
    } else if (s.chain === "POSTROUTING") {
      go(pt(ST.post));
      hold(0.25, {}, text);
      if (s.act === "snat") { hold(0.3, { POSTROUTING: 1 }); hold(0.45, { POSTROUTING: 0, src: 1 }); } else hold(0.55);
      go(pt([ST.exit[0] + 18, 0]));
    }
  }
  hold(2.4, {}, summary(j));
  let total = 0;
  for (const p of ph) { p.t0 = total; total += p.dur; }
  return { ph, total, j };
}

const smooth = (u) => u * u * (3 - 2 * u);
function stateAt(pl, time) {
  const st = { pos: pl.ph[0].from || null, set: {}, text: "", inBin: null };
  let pos = null;
  for (const p of pl.ph) {
    if (time < p.t0) break;
    const u = Math.min(1, (time - p.t0) / p.dur);
    if (p.set) Object.assign(st.set, p.set);
    if (p.text) st.text = p.text;
    if (p.from) {
      const e = p.ease === "in" ? u * u : smooth(u);
      pos = p.from.map((v, i) => v + (p.to[i] - v) * e);
      if (p.ease === "in" || p.to[2] < BZ) st.inBin = true;
    }
  }
  st.pos = pos || pl.ph.find((p) => p.from).from;
  return st;
}

const alphaAt = ([x, y]) => {
  let a = 1;
  if (x < ST.entry[0] + 4) a = Math.min(a, (x - ST.entry[0] + 16) / 20);
  if (x > ST.exit[0]) a = Math.min(a, (ST.exit[0] + 18 - x) / 18);
  if (y < -80) a = Math.min(a, (y + 96) / 16);
  return Math.max(0, Math.min(1, a));
};

const TOUR = [[0, null], [1, null], [2, null], [3, null], [0, "INPUT"], [2, "FORWARD"], [3, "OUTPUT"]];
let type = 0, drop = null, pl = plan(journey(0, null)), time = 0, tourAt = 0;
let touring = !still.matches, visible = false, frame = 0, last = 0, idle = 0, done = false, said = "";
const ease = { INPUT: 0, FORWARD: 0, OUTPUT: 0, PREROUTING: 0, POSTROUTING: 0, push: 0, kINPUT: 0, kFORWARD: 0, kOUTPUT: 0 };
const tab = { INPUT: 0, FORWARD: 0, OUTPUT: 0 };
const rodE = {};

function start(t, d) {
  type = t; drop = d; pl = plan(journey(t, d)); time = still.matches ? pl.total : 0; done = false;
  announce("colis " + TYPES[t].name + (d ? ", règle DROP sur " + d : ", aucune règle DROP"));
}
function announce(text) { if (say && text !== said) { said = text; say.textContent = text; } }

function draw(calm, dt) {
  const st = stateAt(pl, time);
  const f = (cur, want, tau) => (calm ? want : cur + (want - cur) * (1 - Math.exp(-dt / tau)));
  let moving = false;
  for (const key in ease) {
    const want = st.set[key] || 0;
    const tau = key === "PREROUTING" || key === "POSTROUTING" ? 0.07 : 0.14;
    ease[key] = f(ease[key], want, tau);
    if (Math.abs(ease[key] - want) < 0.002) ease[key] = want; else moving = true;
  }
  for (const c in tab) {
    const want = drop === c ? 1 : 0;
    tab[c] = f(tab[c], want, 0.25);
    if (Math.abs(tab[c] - want) < 0.002) tab[c] = want; else moving = true;
    tabs[c].setAttribute("transform", translateAlong(P, [0, 0, tab[c] * 36]));
  }
  for (const c in bars) bars[c].setAttribute("transform", translateAlong(P, [0, 0, ease[c] * 20]));
  for (const c in heads) heads[c].setAttribute("transform", translateAlong(P, [0, 0, -ease[c] * STAMP]));
  for (const name in PUSHERS) {
    const p = PUSHERS[name];
    const e = (name === "push" ? ease.push : ease["k" + name]) * p.travel;
    const v = [0, 0, 0]; v[p.axis] = p.dir * e;
    plates[name].setAttribute("transform", translateAlong(P, v));
    const r = Math.round(e * 10) / 10;
    if (rodE[name] !== r) { rodE[name] = r; rods[name].innerHTML = rodSvg(p, r); }
  }
  const [x, y, z] = st.pos;
  parcel.setAttribute("transform", translateAlong(P, [x, y, z - BZ]));
  parcel.setAttribute("opacity", alphaAt(st.pos).toFixed(3));
  marks.dst.setAttribute("opacity", st.set.dst ? "1" : "0");
  marks.src.setAttribute("opacity", st.set.src ? "1" : "0");
  // Painter's slot: the parcel goes before the first item nearer than it.
  let key = dk(x, y);
  if (st.inBin) { for (const c in BINS) { const b = binC(c); if (Math.hypot(b[0] - x, b[1] - y) < 26 && z < BZ + 1) key = dk(b[0], b[1]); } }
  const zone = y < -16 ? "back" : "front";
  const layer = layers[zone];
  let i = 0;
  while (i < keys[zone].length && keys[zone][i] <= key) i++;
  const next = others[zone][i] || null;
  if (parcel.parentNode !== layer || parcel.nextSibling !== next) layer.insertBefore(parcel, next);
  const text = st.text;
  if (out.textContent !== text) out.textContent = text;
  if (time >= pl.total && !done) { done = true; announce(summary(pl.j)); }
  return moving;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (!calm) time = Math.min(pl.total, time + dt);
  if (touring && time >= pl.total) { tourAt = (tourAt + 1) % TOUR.length; start(...TOUR[tourAt]); }
  const moving = draw(calm, dt);
  const settled = !touring && time >= pl.total && !moving;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (t, d) => {
  touring = false;
  start(t, d);
  clearTimeout(idle);
  idle = setTimeout(() => { if (still.matches) return; touring = true; run(); }, 9000);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);

const GATES = { INPUT: [ST.input[0], ST.input[1], 30], FORWARD: [ST.forward[0], 0, 30], OUTPUT: [ST.output[0], ST.output[1], 30] };
stage.addEventListener("click", (e) => {
  const box = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const sx = ((e.clientX - box.left) / box.width) * vb.width, sy = ((e.clientY - box.top) / box.height) * vb.height;
  let hit = null, best = 34;
  for (const c in GATES) { const [gx, gy] = iso(GATES[c], P); const dist = Math.hypot(gx - sx, gy - sy); if (dist < best) { best = dist; hit = c; } }
  if (hit) steer(hit === "OUTPUT" ? 3 : hit === "INPUT" ? 0 : (type === 1 || type === 2 ? type : 1), drop === hit ? null : hit);
  else steer((type + 1) % 4, drop);
});
const CYCLE = [null, "INPUT", "FORWARD", "OUTPUT"];
stage.addEventListener("keydown", (e) => {
  if (e.key >= "1" && e.key <= "4") { e.preventDefault(); steer(Number(e.key) - 1, drop); }
  else if (e.key === "d" || e.key === "D") { e.preventDefault(); steer(type, CYCLE[(CYCLE.indexOf(drop) + 1) % CYCLE.length]); }
  else if (e.key === " " || e.key === "Enter") { e.preventDefault(); steer(type, drop); }
});
if (still.matches) { touring = false; time = pl.total; }
draw(true, 1 / 60);
`;

const start0 = M.journey(0, null);
const body = k.plateHtml({
  fig: "Fig 1",
  title: "Netfilter",
  hint: "Clic ou 1–4 · D : DROP",
  readout: M.summary(start0),
  keys: [
    { mark: "lit", label: "Le colis : un paquet IP en transit" },
    { mark: "raised", label: "Postes à tampon : nat PREROUTING (DNAT, avant l'aiguillage) et nat POSTROUTING (SNAT/MASQUERADE, avant la porte de sortie)" },
    { mark: "raised", label: "Barrières : filter INPUT (vers le bureau, le processus local), FORWARD (traversée) et OUTPUT (émis par le bureau) ; curseur levé sur le poste = règle DROP, le colis tombe au bac" },
    { mark: "flat", label: "Aiguillage à poussoir : la décision de routage (adresse locale → INPUT, sinon FORWARD)" },
  ],
  caption:
    "Les cinq crochets de Netfilter vus comme une trieuse. Un paquet reçu passe par PREROUTING, puis la décision de routage l'envoie vers INPUT s'il est destiné à la machine, ou vers FORWARD puis POSTROUTING s'il la traverse ; un paquet émis par un processus local part par OUTPUT puis POSTROUTING. Le DNAT se fait en PREROUTING, donc avant le routage : un colis redirigé vers 192.168.1.20 est aiguillé vers FORWARD. Tables : filter a INPUT, FORWARD et OUTPUT ; nat a PREROUTING, OUTPUT et POSTROUTING (et INPUT depuis Linux 2.6.36) ; mangle a les cinq. À un même crochet, l'ordre suit les priorités du noyau : raw −300, mangle −150, nat DNAT −100, filter 0, nat SNAT +100. Simplifications : une seule règle DROP à la fois, politique ACCEPT ailleurs, mangle et raw non montrés, les portes valent pour n'importe quelle interface (le colis du LAN entre en réalité par eth1), et nat n'est consulté que pour le premier paquet d'une connexion. Adresses d'exemple (RFC 5737).",
  body: `<style>.nf-stage{position:relative;overflow:hidden;touch-action:pan-y}.nf-stage:focus{outline:none}.nf-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}@media (max-width:520px){.nf-stage svg{width:116%;margin:-3% -8% -1%}}</style><div class="iso-stage nf-stage" tabindex="0" role="group" aria-label="Trieuse Netfilter : touches 1 à 4 pour le type de colis, D pour poser la règle DROP sur INPUT, FORWARD ou OUTPUT, Espace pour relancer">${svg}<span data-say aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"></span></div>`,
});

export function render() {
  return { plate: body, live };
}
