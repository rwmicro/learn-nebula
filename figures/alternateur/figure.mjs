import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const title = "Alternateur";

const WIDTH = 600;
const HEIGHT = 380;
const AZ = 40;

// Banc : planche sur pieds.
const PLATE = { x: -156, y: -66, w: 302, d: 128, r: 6 };
const PLATE_H = 10;
const FOOT_H = 5;

// Rotor : axe vertical en (0, 0), aimant droit entre deux bobines d'axe y.
const AXIS_Z = 45;
const MAG = { half: 14, wide: 9, z: 40, h: 10, hubR: 5 };
const POLE = 16;
const PULLEY = { r: 9, z: 11, h: 10 };
const BELT = { z: 13.5, h: 5, t: 1.2 };

// Manivelle : roue de 36 en (-110, 0), rapport 36 / 9 = 4 (M.GEAR).
const WHEEL = { x: -110, y: 0, r: 36, z: 11, h: 10 };
const CRANK = { reach: 27, wide: 6, z: 21, h: 3, handleR: 3.1, top: 42 };

// Galvanomètre à zéro central, face avant en x = FACE.
const METER = { x: 62, y: -44, w: 24, d: 54, r: 3 };
const METER_H = 60;
const FACE = METER.x + METER.w;
const WINDOW = { y0: -38, y1: 4, z0: 24, z1: 54 };
const PIVOT = [FACE + 1, -17, 28];
const ARC_R = 20;
const SWING = (50 * Math.PI) / 180;
const LEDGE = { x: FACE, y: -42, w: 10, d: 50, r: 1.5 };
const LEDGE_H = 8;
const POSTS = { p1: [FACE + 5, -37], p2: [FACE + 5, 3] };

// Lampe sur son socle.
const LAMP_BASE = { x: 104, y: 24, w: 30, d: 30, r: 2 };
const LAMP_H = 5;
const BULB = [119, 42, 26];
const BULB_R = 7;
const LAMP_POSTS = { l1: [128, 29], l2: [109, 29] };

// Montants des bobines.
const FOOT = (sign) => ({ x: -17, y: sign > 0 ? 42 : -56, w: 34, d: 14, r: 2 });
const UPRIGHT = (sign) => ({ x: -10, y: sign > 0 ? 46 : -52, w: 20, d: 6, r: 1 });
const UPRIGHT_TOP = 62;
const TERM = (sign) => ({ a: [12, sign * 49], b: [-12, sign * 49] });

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, UPRIGHT_TOP + 4], [WHEEL.x, 0, CRANK.top + 4], [FACE, -20, METER_H + 2], [0, 56, UPRIGHT_TOP], [0, -56, UPRIGHT_TOP]],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: AZ },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// ---------- pièces qui bougent : construites ici et dans la page ----------

function magnetSvg(K, P, MAG, theta) {
  const d = [Math.sin(theta), Math.cos(theta)];
  const n = [Math.cos(theta), -Math.sin(theta)];
  const w = MAG.wide / 2;
  const half = (sign) => {
    const tip = [d[0] * MAG.half * sign, d[1] * MAG.half * sign];
    return [
      [n[0] * w, n[1] * w],
      [tip[0] + n[0] * w, tip[1] + n[1] * w],
      [tip[0] - n[0] * w, tip[1] - n[1] * w],
      [-n[0] * w, -n[1] * w],
    ];
  };
  const top = MAG.z + MAG.h;
  const pieces = [1, -1].map((sign) => {
    const poly = half(sign);
    const mid = [d[0] * MAG.half * 0.5 * sign, d[1] * MAG.half * 0.5 * sign];
    let svg = K.solidSvg(K.extrude(poly, MAG.z, MAG.h, P), { tone: sign > 0 ? "hi" : "mid", crease: sign > 0 ? "lo" : "faint" });
    if (sign > 0) {
      const f = 0.62;
      const a = [poly[0][0] + (poly[1][0] - poly[0][0]) * f, poly[0][1] + (poly[1][1] - poly[0][1]) * f];
      const b = [poly[3][0] + (poly[2][0] - poly[3][0]) * f, poly[3][1] + (poly[2][1] - poly[3][1]) * f];
      svg += K.lineSvg(K.lineOnTop(a, b, top, P), { tone: "mid" });
    }
    return { key: K.depthOf([mid[0], mid[1], MAG.z], P), svg };
  });
  pieces.sort((a, b) => a.key - b.key);
  const hub = K.solidSvg(K.cylinder(0, 0, MAG.hubR, MAG.z - 4, 4, P, 28, 0.4), { tone: "mid" });
  const nut = K.solidSvg(K.extrude(K.circleRing(0, 0, 2.6, 6), top, 2.2, P), { tone: "mid" });
  return hub + pieces.map((p) => p.svg).join("") + nut;
}

function crankSvg(K, P, WHEEL, CRANK, phi) {
  const c = [WHEEL.x, WHEEL.y];
  const d = [Math.sin(phi), Math.cos(phi)];
  const n = [Math.cos(phi), -Math.sin(phi)];
  const w = CRANK.wide / 2;
  const h = [c[0] + d[0] * CRANK.reach, c[1] + d[1] * CRANK.reach];
  const arm = [
    [c[0] + n[0] * w, c[1] + n[1] * w],
    [h[0] + n[0] * w * 0.8, h[1] + n[1] * w * 0.8],
    [h[0] - n[0] * w * 0.8, h[1] - n[1] * w * 0.8],
    [c[0] - n[0] * w, c[1] - n[1] * w],
  ];
  const z = CRANK.z, top = z + CRANK.h;
  const armSvg = K.solidSvg(K.extrude(arm, z, CRANK.h, P, { bevel: 0.4 }), { tone: "mid" });
  const tipSvg = K.solidSvg(K.cylinder(h[0], h[1], w * 0.8, z, CRANK.h, P, 20), { tone: "mid", crease: "none" });
  const boss = K.solidSvg(K.cylinder(c[0], c[1], 6, z, CRANK.h + 2.5, P, 28, 0.4), { tone: "mid" }) + K.solidSvg(K.cylinder(c[0], c[1], 2.4, top + 2.5, 1.6, P, 16), { tone: "mid" });
  const handle =
    K.solidSvg(K.cylinder(h[0], h[1], CRANK.handleR + 0.8, top, 2, P, 20), { tone: "mid" }) +
    K.solidSvg(K.cylinder(h[0], h[1], CRANK.handleR, top + 2, CRANK.top - top - 4, P, 24), { tone: "hi", crease: "none", inner: K.lineSvg(K.sideArc(h[0], h[1], CRANK.handleR, top + 8, P, 12) + K.sideArc(h[0], h[1], CRANK.handleR, CRANK.top - 8, P, 12), { tone: "faint" }) }) +
    K.solidSvg(K.cylinder(h[0], h[1], CRANK.handleR + 0.6, CRANK.top - 2, 2, P, 20, 0.3), { tone: "hi" });
  const behind = K.depthOf([h[0], h[1], 0], P) < K.depthOf([c[0], c[1], 0], P);
  return armSvg + tipSvg + (behind ? handle + boss : boss + handle);
}

function needleD(K, P, PIVOT, ARC_R, SWING, value) {
  const a = Math.max(-1, Math.min(1, value)) * SWING;
  const s = Math.sin(a), c = Math.cos(a);
  const x = PIVOT[0] + 0.3;
  const tail = [x, PIVOT[1] + 3.5 * s, PIVOT[2] - 3.5 * c];
  const tip = [x, PIVOT[1] - (ARC_R - 1.5) * s, PIVOT[2] + (ARC_R - 1.5) * c];
  return K.segment(tail, tip, P);
}

// ---------- pièces fixes ----------

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 18))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H + 3, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "faint" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // plaque signalétique, à l'avant gauche
  const label = { x: -100, y: 40, w: 40, d: 12, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  for (const [i, len] of [[0, 30], [1, 22], [2, 26]]) out.push(L(k.lineOnTop([label.x + 5 + i * 0, label.y + 3.5 + i * 2.6], [label.x + 5 + len, label.y + 3.5 + i * 2.6], 0.6, P), { tone: "faint", free: true }));
  out.push(D([at([label.x + 2, label.y + 2, 0.6]), at([label.x + label.w - 2, label.y + label.d - 2, 0.6])], { size: 0.4 }));
  return out.join("");
}

// Poteau de serrage : embase, tige, chapeau moleté.
function post(x, y, z, scale = 1) {
  const out = [];
  out.push(S(k.cylinder(x, y, 2.6 * scale, z, 1.2, P, 18), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, 1.4 * scale, z + 1.2, 2.4 * scale, P, 14), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(x, y, 2.3 * scale, z + 1.2 + 2.4 * scale, 2.6 * scale, P, 20, 0.3), { tone: "mid" }));
  out.push(L(k.knurl(x, y, 2.3 * scale, z + 1.2 + 2.4 * scale, z + 1.2 + 5 * scale, 14, P, 0.35), { tone: "faint" }));
  return out.join("");
}
const postTop = (x, y, z, scale = 1) => z + 1.2 + 5 * scale;

function wires() {
  const W = (points) => {
    const route = G.fillet(points, 5, 7);
    return k.wireSvg(at(route[0]), at(route[route.length - 1]), { via: route.slice(1, -1).map(at), tone: "mid", size: 1 });
  };
  const fa = TERM(1).a, fb = TERM(1).b, ba = TERM(-1).a, bb = TERM(-1).b;
  const z0 = 0.5;
  const top = (p, z) => [p[0], p[1], z];
  const out = [];
  // les deux bobines en série, sous la courroie
  out.push(W([top(bb, 6.4), [bb[0] - 2, bb[1] + 6, z0], [-26, -34, z0], [-26, 34, z0], [fb[0] - 2, fb[1] - 6, z0], top(fb, 6.4)]));
  // bobine arrière → borne 1 du voltmètre → lampe
  out.push(W([top(ba, 6.4), [ba[0] + 6, ba[1] - 4, z0], [30, -60, z0], [POSTS.p1[0], -56, z0], [POSTS.p1[0] + 6, POSTS.p1[1] - 4, z0], top(POSTS.p1, LEDGE_H + 3)]));
  out.push(W([top(POSTS.p1, LEDGE_H + 3), [FACE + 15, POSTS.p1[1], z0], [LAMP_POSTS.l1[0] + 2, -20, z0], [LAMP_POSTS.l1[0] + 1, LAMP_POSTS.l1[1] - 6, z0], top(LAMP_POSTS.l1, LAMP_H + 3)]));
  // bobine avant → borne 2 du voltmètre → lampe
  out.push(W([top(fa, 6.4), [fa[0] + 6, fa[1] + 4, z0], [40, 58, z0], [POSTS.p2[0] + 2, 26, z0], [POSTS.p2[0] + 6, POSTS.p2[1] + 6, z0], top(POSTS.p2, LEDGE_H + 3)]));
  out.push(W([top(POSTS.p2, LEDGE_H + 3), [FACE + 14, POSTS.p2[1] + 2, z0], [LAMP_POSTS.l2[0] - 1, LAMP_POSTS.l2[1] - 7, z0], top(LAMP_POSTS.l2, LAMP_H + 3)]));
  return `<g style="--anatomy-weight:1px">${out.join("")}</g>`;
}

function coilFrame(sign) {
  return G.frameOf([0, sign * POLE, AXIS_Z], [0, sign, 0], [1, 0, 0], [0, 0, 1]);
}

// Bobine : épanouissement polaire, joues, enroulement, noyau jusqu'au montant.
function coilParts(sign) {
  const F = coilFrame(sign);
  const parts = [];
  parts.push(S(G.disc(0, 2.2, 8, F, P), { tone: "mid" }));
  parts.push(S(G.disc(2.2, 4, 5.5, F, P), { tone: "mid" }));
  parts.push(S(G.disc(4, 5.6, 15.5, F, P, { bevel: 0.4 }), { tone: "mid" }));
  const windings = [];
  for (let s = 7; s < 23; s += 1.25) windings.push(G.arcOf(F, s, 13, P));
  parts.push(S(G.disc(5.6, 24.4, 13, F, P), { tone: "hi", inner: L(windings.join(""), { tone: "faint" }) }));
  parts.push(S(G.disc(24.4, 26, 15.5, F, P, { bevel: 0.4 }), { tone: "mid" }));
  parts.push(S(G.disc(26, 30, 5.5, F, P), { tone: "mid" }));
  return sign > 0 ? parts.join("") : parts.reverse().join("");
}

function stand(sign) {
  const out = [];
  const foot = FOOT(sign);
  const up = UPRIGHT(sign);
  out.push(S(k.slabOf(foot, 0, 4, P, 3, 0.5), { tone: "mid" }));
  out.push(D([[-14, foot.y + 3], [-14, foot.y + foot.d - 3], [14, foot.y + 3], [14, foot.y + foot.d - 3]].filter(([x]) => true).map(([x, y]) => at([x, y, 4])), { size: 0.45 }));
  const t = TERM(sign);
  const posts = byDepth([t.a, t.b]).map(([x, y]) => post(x, y, 4, 0.8)).join("");
  const body = S(k.slabOf(up, 4, UPRIGHT_TOP - 4, P, 2, 0.5), { tone: "mid", inner: L(k.sideSeam(up, 12, P, 2), { tone: "faint" }) });
  // écrou du noyau sur la face extérieure (visible pour le montant avant)
  const face = sign > 0 ? up.y + up.d : up.y;
  const nut = sign > 0 ? S(G.disc(0, 1.6, 4.6, G.frameOf([0, face, AXIS_Z], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P, { steps: 6 }), { tone: "mid" }) + D([at([-6.5, face, UPRIGHT_TOP - 5]), at([6.5, face, UPRIGHT_TOP - 5]), at([-6.5, face, 10]), at([6.5, face, 10])], { size: 0.45 }) : "";
  if (sign > 0) out.push(posts, body, nut);
  else out.push(body, posts);
  return out.join("");
}

function wheelBelow() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: WHEEL.x - 16, y: -16, w: 32, d: 32, r: 16 }, 0, 2, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.cylinder(WHEEL.x, WHEEL.y, 15, 0, 3, P, 40, 0.5), { tone: "mid" }));
  out.push(D([0, 1, 2, 3].map((i) => at([WHEEL.x + 11 * Math.cos(i * Math.PI / 2 + 0.4), WHEEL.y + 11 * Math.sin(i * Math.PI / 2 + 0.4), 3])), { size: 0.45 }));
  out.push(S(k.cylinder(WHEEL.x, WHEEL.y, 6.5, 3, WHEEL.z - 3, P, 28), { tone: "mid", inner: L(k.sideArc(WHEEL.x, WHEEL.y, 6.5, 7, P, 14), { tone: "faint" }) }));
  return out.join("");
}

// Courroie : deux brins droits tangents et deux arcs d'enroulement.
function beltGeometry() {
  const R = WHEEL.r + BELT.t / 2, r = PULLEY.r + BELT.t / 2;
  const dx = 0 - WHEEL.x;
  const beta = Math.asin((R - r) / dx);
  // normale du brin, côté +y et côté −y
  const side = (sgn) => {
    const ang = sgn * (Math.PI / 2 + beta);
    const nx = Math.cos(ang), ny = Math.sin(ang);
    return { a: [WHEEL.x + R * nx, WHEEL.y + R * ny], b: [r * nx, r * ny], ang, n: [nx, ny] };
  };
  return { R, r, beta, plus: side(1), minus: side(-1) };
}

function beltRun(sgn) {
  const g = beltGeometry();
  const s = sgn > 0 ? g.plus : g.minus;
  const t = BELT.t / 2;
  const poly = [
    [s.a[0] - s.n[0] * t, s.a[1] - s.n[1] * t],
    [s.b[0] - s.n[0] * t, s.b[1] - s.n[1] * t],
    [s.b[0] + s.n[0] * t, s.b[1] + s.n[1] * t],
    [s.a[0] + s.n[0] * t, s.a[1] + s.n[1] * t],
  ];
  return S(k.extrude(poly, BELT.z, BELT.h, P), { tone: "lo", crease: "faint" });
}

function beltWrap(cx, cy, r, from, to) {
  const outer = [], inner = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    outer.push([cx + (r + BELT.t / 2) * Math.cos(a), cy + (r + BELT.t / 2) * Math.sin(a)]);
    inner.push([cx + (r - BELT.t / 2) * Math.cos(a), cy + (r - BELT.t / 2) * Math.sin(a)]);
  }
  return S(k.extrude([...outer, ...inner.reverse()], BELT.z, BELT.h, P, { convex: false }), { tone: "lo", crease: "faint" });
}

function wheel() {
  const out = [];
  const g = beltGeometry();
  out.push(beltWrap(WHEEL.x, WHEEL.y, WHEEL.r, g.plus.ang, 2 * Math.PI + g.minus.ang));
  const disc = k.cylinder(WHEEL.x, WHEEL.y, WHEEL.r, WHEEL.z, WHEEL.h, P, 72, 0.8);
  out.push(S(disc, { tone: "mid", inner: L(k.sideArc(WHEEL.x, WHEEL.y, WHEEL.r, BELT.z, P, 40) + k.sideArc(WHEEL.x, WHEEL.y, WHEEL.r, BELT.z + BELT.h, P, 40), { tone: "faint" }) }));
  const top = WHEEL.z + WHEEL.h;
  out.push(L(k.ring(WHEEL.x, WHEEL.y, WHEEL.r - 4, top, P, 72), { tone: "lo" }));
  out.push(L(k.ring(WHEEL.x, WHEEL.y, 11, top, P, 40), { tone: "faint" }));
  const spokes = Array.from({ length: 5 }, (_, i) => (i * 2 * Math.PI) / 5 + 0.3);
  out.push(D(spokes.map((a) => at([WHEEL.x + 23 * Math.cos(a), WHEEL.y + 23 * Math.sin(a), top])), { size: 0.5 }));
  return out.join("");
}

function rotorBelow() {
  const out = [];
  const g = beltGeometry();
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: -14, y: -14, w: 28, d: 28, r: 14 }, 0, 2, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.cylinder(0, 0, 12, 0, 3, P, 40, 0.5), { tone: "mid" }));
  out.push(D([0, 1, 2].map((i) => at([9 * Math.cos(i * 2.094 + 0.5), 9 * Math.sin(i * 2.094 + 0.5), 3])), { size: 0.45 }));
  out.push(S(k.cylinder(0, 0, 6.5, 3, PULLEY.z - 3, P, 28), { tone: "mid" }));
  out.push(beltWrap(0, 0, PULLEY.r, g.minus.ang, g.plus.ang));
  out.push(S(k.cylinder(0, 0, PULLEY.r, PULLEY.z, PULLEY.h, P, 40, 0.4), { tone: "mid", inner: L(k.sideArc(0, 0, PULLEY.r, BELT.z, P, 20) + k.sideArc(0, 0, PULLEY.r, BELT.z + BELT.h, P, 20), { tone: "faint" }) }));
  out.push(S(k.cylinder(0, 0, 2, PULLEY.z + PULLEY.h, MAG.z - 2 - PULLEY.z - PULLEY.h, P, 16), { tone: "mid", crease: "none" }));
  return out.join("");
}

function meter() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(METER, 0, 2, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.slabOf(METER, 0, METER_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(METER, 6, P, 4) + k.sideSeam(METER, METER_H - 6, P, 4), { tone: "faint" }) }));
  // poignée de transport sur le dessus
  for (const y of [METER.y + 12, METER.y + METER.d - 12]) out.push(S(k.slabOf({ x: METER.x + 9, y: y - 2, w: 6, d: 4, r: 1 }, METER_H, 5, P, 2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: METER.x + 9, y: METER.y + 10, w: 6, d: METER.d - 20, r: 1.6 }, METER_H + 5, 2.4, P, 3, 0.4), { tone: "mid" }));
  out.push(D([at([METER.x + 4, METER.y + 4, METER_H]), at([METER.x + 4, METER.y + METER.d - 4, METER_H]), at([METER.x + METER.w - 4, METER.y + 4, METER_H]), at([METER.x + METER.w - 4, METER.y + METER.d - 4, METER_H])], { size: 0.45 }));
  // cadran
  const bezel = { x: FACE, y: WINDOW.y0 - 2.2, w: 0.6, d: WINDOW.y1 - WINDOW.y0 + 4.4, r: 1.2 };
  out.push(S(k.slabOf(bezel, WINDOW.z0 - 2.2, WINDOW.z1 - WINDOW.z0 + 4.4, P, 3), { tone: "mid" }));
  const win = { x: FACE + 0.6, y: WINDOW.y0, w: 0.4, d: WINDOW.y1 - WINDOW.y0, r: 0.4 };
  out.push(S(k.slabOf(win, WINDOW.z0, WINDOW.z1 - WINDOW.z0, P, 2), { tone: "lo", crease: "faint" }));
  const x = FACE + 1;
  const arcPts = [];
  for (let i = 0; i <= 40; i++) {
    const a = -SWING + (2 * SWING * i) / 40;
    arcPts.push(at([x, PIVOT[1] - ARC_R * Math.sin(a), PIVOT[2] + ARC_R * Math.cos(a)]));
  }
  out.push(L(k.pathOf(arcPts), { tone: "mid" }));
  const minor = [], major = [];
  for (let i = -15; i <= 15; i++) {
    const a = (SWING * i) / 15;
    const big = i % 5 === 0;
    const r0 = ARC_R - (big ? 3.4 : 1.8);
    const seg = k.segment([x, PIVOT[1] - r0 * Math.sin(a), PIVOT[2] + r0 * Math.cos(a)], [x, PIVOT[1] - ARC_R * Math.sin(a), PIVOT[2] + ARC_R * Math.cos(a)], P);
    if (i === 0) out.push(L(seg, { tone: "hi" }));
    else (big ? major : minor).push(seg);
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  // vis de réglage du zéro, sous le cadran
  out.push(L(k.sideRing([x, PIVOT[1], WINDOW.z0 - 7], 2.4, "x", P, 20), { tone: "mid" }));
  out.push(L(k.segment([x, PIVOT[1] - 2.4, WINDOW.z0 - 7], [x, PIVOT[1] + 2.4, WINDOW.z0 - 7], P), { tone: "lo" }));
  out.push(D([at([x, WINDOW.y0 + 2, WINDOW.z1 - 2]), at([x, WINDOW.y1 - 2, WINDOW.z1 - 2]), at([x, WINDOW.y0 + 2, WINDOW.z0 + 2]), at([x, WINDOW.y1 - 2, WINDOW.z0 + 2])], { size: 0.4 }));
  // tablette des bornes
  out.push(S(k.slabOf(LEDGE, 0, LEDGE_H, P, 2, 0.5), { tone: "mid" }));
  for (const [px, py] of byDepth([POSTS.p1, POSTS.p2])) out.push(post(px, py, LEDGE_H));
  return out.join("");
}

function lamp() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(LAMP_BASE, 0, 2, P)}" style="filter:blur(3px)"/>`);
  out.push(S(k.slabOf(LAMP_BASE, 0, LAMP_H, P, 3, 0.6), { tone: "mid" }));
  for (const [px, py] of byDepth([LAMP_POSTS.l1, LAMP_POSTS.l2])) out.push(post(px, py, LAMP_H, 0.85));
  const [bx, by] = BULB;
  out.push(S(k.cylinder(bx, by, 6.5, LAMP_H, 9, P, 32, 0.4), { tone: "mid", inner: L(k.sideArc(bx, by, 6.5, LAMP_H + 4, P, 16), { tone: "faint" }) }));
  out.push(S(k.cylinder(bx, by, 4.4, LAMP_H + 9, 4, P, 24), { tone: "mid", crease: "none", inner: L(k.sideArc(bx, by, 4.4, LAMP_H + 10.4, P, 12) + k.sideArc(bx, by, 4.4, LAMP_H + 11.8, P, 12), { tone: "faint" }) }));
  out.push(S(G.sphereOf([bx, by, BULB[2]], BULB_R, P), { tone: "mid" }));
  const c = at([bx, by, BULB[2]]);
  // filament : deux montants et la spirale, vus à travers le verre
  out.push(L(k.segment([bx - 1.6, by, BULB[2] - 3.4], [bx - 1.6, by, BULB[2] + 0.6], P) + k.segment([bx + 1.6, by, BULB[2] - 3.4], [bx + 1.6, by, BULB[2] + 0.6], P) + k.segment([bx - 1.6, by, BULB[2] + 0.6], [bx + 1.6, by, BULB[2] + 0.6], P), { tone: "faint" }));
  return { svg: out.join(""), centre: c };
}

// ---------- assemblage ----------

const START_RPM = 240;
const START_THETA = (60 * Math.PI) / 180;
const startValue = M.emfAt(START_RPM, START_THETA) / M.SCALE_V;
const startGlow = Math.min(1, (M.emfAt(START_RPM, START_THETA) / M.LAMP_V) ** 2);
const lampParts = lamp();
const scale = Math.hypot(...k.axisVector(P, [1, 0, 0]));
const GLOW_R = BULB_R * scale * 2.6;
const glow = `<defs><radialGradient id="alt-glow-g"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.95"/><stop offset="0.28" stop-color="#ffb53d" stop-opacity="0.55"/><stop offset="1" stop-color="#ff9f1a" stop-opacity="0"/></radialGradient></defs><circle data-part="glow" cx="${lampParts.centre[0].toFixed(1)}" cy="${lampParts.centre[1].toFixed(1)}" r="${GLOW_R.toFixed(1)}" fill="url(#alt-glow-g)" opacity="${(0.85 * startGlow).toFixed(3)}" style="pointer-events:none"/>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Alternateur de démonstration sur une planche : à gauche, une roue à manivelle entraîne par une courroie une petite poulie quatre fois plus petite ; sur son axe vertical tourne un aimant droit, entre deux bobines montées sur noyaux de fer. Les bobines, reliées en série, alimentent une petite lampe et un voltmètre à zéro central. Quand l'aimant tourne, le flux dans les bobines varie, l'aiguille oscille d'un côté puis de l'autre (courant alternatif) et la lampe s'allume d'autant plus que l'on tourne vite.",
  body: [
    base(),
    wires(),
    stand(-1),
    coilParts(-1),
    beltRun(-1),
    wheelBelow(),
    wheel(),
    `<g data-part="crank">${crankSvg(k, P, WHEEL, CRANK, START_THETA / M.GEAR)}</g>`,
    rotorBelow(),
    `<g data-part="magnet">${magnetSvg(k, P, MAG, START_THETA)}</g>`,
    beltRun(1),
    coilParts(1),
    stand(1),
    meter(),
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="" d="${needleD(k, P, PIVOT, ARC_R, SWING, startValue)}" style="stroke-width:1.1"/>`,
    D([at(PIVOT)], { size: 1.3, tone: "hi" }),
    lampParts.svg,
    glow,
  ],
});

const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${model}
const P = ${JSON.stringify(P)};
const MAG = ${JSON.stringify(MAG)}, WHEEL = ${JSON.stringify(WHEEL)}, CRANK = ${JSON.stringify(CRANK)};
const PIVOT = ${JSON.stringify(PIVOT)}, ARC_R = ${ARC_R}, SWING = ${SWING};
const magnetSvg = ${magnetSvg.toString()};
const crankSvg = ${crankSvg.toString()};
const needleD = ${needleD.toString()};
const stage = root.querySelector(".iso-stage");
const svgEl = stage.querySelector("svg");
const magnetEl = svgEl.querySelector('[data-part="magnet"]');
const crankEl = svgEl.querySelector('[data-part="crank"]');
const needleEl = svgEl.querySelector('[data-part="needle"]');
const glowEl = svgEl.querySelector('[data-part="glow"]');
const out = root.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TOUR = [[0, 60], [5, 240], [10, RPM_MAX], [15, 0]];
const TOUR_LEN = 18;
let rpm = ${START_RPM}, target = ${START_RPM}, theta = ${START_THETA}, heat = ${startGlow};
let frame = 0, last = 0, clock = 0, touring = !still.matches, visible = false, idle = 0;
const tourAt = (t) => { const u = t % TOUR_LEN; let v = TOUR[0][1]; for (const [s, r] of TOUR) if (u >= s) v = r; return v; };
function describe() {
  const text = target < 0.5 ? "manivelle arrêtée" : Math.round(target) + " tours par minute pour l'aimant, " + hertzOf(target).toFixed(1).replace(".", ",") + " hertz, tension crête " + peakOf(target).toFixed(2).replace(".", ",") + " volt";
  stage.setAttribute("aria-valuenow", String(Math.round(target)));
  stage.setAttribute("aria-valuetext", text);
}
function draw() {
  const calm = still.matches;
  const shown = calm ? (rpm > 0.5 ? Math.PI / 2 : 0) : theta;
  const e = emfAt(rpm, shown);
  magnetEl.innerHTML = magnetSvg(K, P, MAG, shown);
  crankEl.innerHTML = crankSvg(K, P, WHEEL, CRANK, shown / GEAR);
  needleEl.setAttribute("d", needleD(K, P, PIVOT, ARC_R, SWING, e / SCALE_V));
  glowEl.setAttribute("opacity", (0.85 * Math.min(1, calm ? (peakOf(rpm) / LAMP_V) ** 2 / 2 : heat)).toFixed(3));
  const text = readout(rpm);
  if (out.textContent !== text) out.textContent = text;
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; const next = tourAt(clock); if (next !== target) { target = next; describe(); } }
  rpm = calm ? target : rpm + (target - rpm) * (1 - Math.exp(-dt / 0.9));
  if (Math.abs(target - rpm) < 0.2) rpm = target;
  theta = (theta + omegaOf(rpm) * dt) % (Math.PI * 4 * GEAR);
  const e = emfAt(rpm, theta);
  heat += ((e / LAMP_V) ** 2 - heat) * (1 - Math.exp(-dt / 0.05));
  draw();
  const settled = calm || (!touring && rpm === 0 && target === 0 && heat < 0.002);
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  touring = false;
  const v = clampTo(next, 0, RPM_MAX);
  if (v !== target) { target = v; describe(); }
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 4000);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
const fromPointer = (event) => {
  const box = svgEl.getBoundingClientRect();
  const share = clampTo(((event.clientX - box.left) / box.width - 0.15) / 0.7, 0, 1);
  steer(Math.round(share * RPM_MAX / 10) * 10);
};
stage.addEventListener("pointermove", (event) => { if (event.pointerType === "mouse") fromPointer(event); });
stage.addEventListener("pointerdown", fromPointer);
stage.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 120 : 40;
  const from = touring ? Math.round(rpm / 10) * 10 : target;
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = from + step;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = from - step;
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = RPM_MAX;
  if (event.key === " " || event.key === "Enter") to = from > 0 ? 0 : 240;
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
if (still.matches) touring = false;
describe();
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Alternateur",
  hint: "Survol, toucher ou ← → : vitesse",
  readout: M.readout(START_RPM),
  keys: [
    { mark: "lit", label: "L'aiguille du voltmètre : la tension induite e = N·B·S·ω·sin(ωt), qui change de signe deux fois par tour" },
    { mark: "raised", label: "L'aimant tournant entre les deux bobines, la roue à manivelle et sa courroie (rapport 1:4)" },
  ],
  caption:
    "Quand l'aimant tourne, le flux à travers les bobines vaut Φ = N·B·S·cos(ωt) ; sa variation induit e = −dΦ/dt = N·B·S·ω·sin(ωt) (Faraday). Tourner plus vite augmente à la fois la fréquence et l'amplitude, et la lampe brille davantage. Modèle de paillasse supposé : deux bobines de 250 spires en série (N = 500), B ≈ 0,1 T, S = 10 cm², roue de manivelle quatre fois plus grande que la poulie de l'aimant ; ampoule de 2,5 V, voltmètre gradué de −3 à +3 V. Aiguille sans inertie et résistance des bobines négligée.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Alternateur : flèches pour régler la vitesse de la manivelle, Début pour l'arrêter" aria-valuemin="0" aria-valuemax="${M.RPM_MAX}" aria-valuenow="${START_RPM}" style="touch-action:pan-y">${svg}</div>`,
});

export function render() {
  return { plate: body, live };
}
