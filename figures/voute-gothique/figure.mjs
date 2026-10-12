import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const title = "Arc-boutant";

const WIDTH = 600;
const HEIGHT = 520;
const AZ = 123;

const PLATE = { x: -84, y: -42, w: 262, d: 96, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const BED = 4;

const WALL = { x: -6, y: -15, w: 12, d: 30, r: 0.6 };
const WALL_TOP = BED + 240;
const PIER_X = 110;
const PIER_C = 130;
const PIER = { x: PIER_X, y: -15, w: 40, d: 30, r: 0.6 };
const PIER_STEPS = [
  { w: 40, z0: BED, z1: BED + 110 },
  { w: 32, z0: BED + 118, z1: BED + 190 },
  { w: 26, z0: BED + 196, z1: BED + 236 },
];
const SPRING_Z = BED + 158;
const ARCH_R = 90;
const ARCH_T = 9;
const ARCH_SPAN = 54;

const FLY_IN = [[6, BED + 192], [PIER_X, BED + 150]];
const FLY_OUT = [[6, BED + 210], [PIER_X, BED + 182]];
const FLY_BULGE = 15;
const FLY_COUNT = 9;
const FLY_D = 8;
const LIFT = 46;

const PAD_WALL = { x: -16, y: -22, w: 32, d: 44, r: 2 };
const PAD_PIER = { x: PIER_X - 6, y: -22, w: 52, d: 44, r: 2 };
const STRIP_Y = 15.5;

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [-ARCH_SPAN - 6, -6, WALL_TOP + 40],
    [8, 0, WALL_TOP + 44],
    [PIER_C, 0, BED + 236 + 74],
    [6, 8, FLY_OUT[0][1] + LIFT + 4],
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: AZ },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const XZ = (y0) => G.frameOf([0, y0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const slab = (x0, x1, y0, y1, z0, z1, steps = 2, bevel = 0) => k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0.4 }, z0, z1 - z0, P, steps, bevel);
const prismXZ = (polygon, y0, y1) => G.prismOf(XZ(y0), polygon, 0, y1 - y0, P);
const segXZ = (a, b, y) => k.segment([a[0], y, a[1]], [b[0], y, b[1]], P);

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
  const label = { x: 40, y: 22, w: 36, d: 12, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  for (const [i, len] of [[0, 26], [1, 20], [2, 23]]) out.push(L(k.lineOnTop([label.x + 4, label.y + 3.5 + i * 2.6], [label.x + 4 + len, label.y + 3.5 + i * 2.6], 0.6, P), { tone: "faint", free: true }));
  out.push(D([at([label.x + 2, label.y + 2, 0.6]), at([label.x + label.w - 2, label.y + label.d - 2, 0.6])], { size: 0.4 }));
  return out.join("");
}

function pad(plan, centre, half, third) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, BED, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(plan, 0, BED, P, 4, 0.5), { tone: "mid" }));
  const strip = { x: plan.x + 2, y: STRIP_Y, w: plan.w - 4, d: 5, r: 0.8 };
  out.push(S(k.slabOf(strip, BED, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 2, strip.x + strip.w - 2, 2, 5, strip.y + 0.6, BED + 0.6, [1.4, 2.8], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  const marks = [centre - half, centre + half];
  out.push(L(marks.map((x) => k.lineOnTop([x, strip.y + 0.6], [x, strip.y + strip.d - 0.6], BED + 0.6, P)).join(""), { tone: "hi" }));
  if (third) {
    out.push(D([centre - third, centre + third].map((x) => at([x, strip.y + strip.d - 1.2, BED + 0.6])), { size: 0.7, tone: "hi" }));
  }
  out.push(D([at([plan.x + 3, plan.y + 3, BED]), at([plan.x + plan.w - 3, plan.y + 3, BED]), at([plan.x + 3, plan.y + plan.d - 3, BED])], { size: 0.45 }));
  return out.join("");
}

function pointer() {
  const out = [];
  const tip = [0, STRIP_Y + 5.6];
  out.push(S(k.extrude([[-4, tip[1] + 7], [4, tip[1] + 7], [0, tip[1]]], BED, 2.4, P), { tone: "hi" }));
  out.push(S(k.slabOf({ x: -4.5, y: tip[1] + 7, w: 9, d: 4, r: 0.8 }, BED, 3.6, P, 2, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(0, tip[1] + 9, 1.6, BED + 3.6, 2.4, P, 16), { tone: "mid" }));
  return out.join("");
}

function archGeometry() {
  const cx = WALL.x - ARCH_R;
  const top = Math.acos((ARCH_R - ARCH_SPAN) / ARCH_R);
  const n = 7;
  const stones = [];
  for (let i = 0; i < n; i++) {
    const a0 = (top * i) / n;
    const a1 = (top * (i + 1)) / n;
    const pt = (r, a) => [cx + r * Math.cos(a), SPRING_Z + r * Math.sin(a)];
    stones.push([pt(ARCH_R, a0), pt(ARCH_R, a1), pt(ARCH_R + ARCH_T, a1), pt(ARCH_R + ARCH_T, a0)]);
  }
  return stones;
}

function vault() {
  const out = [];
  const stones = archGeometry();
  out.push(S(prismXZ([[WALL.x - 10, SPRING_Z - 22], [WALL.x, SPRING_Z - 22], [WALL.x, SPRING_Z + ARCH_T + 4], [WALL.x - 10, SPRING_Z + 2]], -9, 9), { tone: "mid" }));
  for (const stone of stones) {
    const cut = stone.map(([x, z]) => [Math.max(x, -ARCH_SPAN - 6), z]);
    out.push(S(prismXZ(cut, -6, 6), { tone: "mid" }));
  }
  const last = stones[stones.length - 1];
  const kx = (last[1][0] + last[2][0]) / 2;
  const kz = (last[1][1] + last[2][1]) / 2;
  out.push(S(G.prismOf(G.frameOf([0, -7, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]), [[kx - 1, kz - 8], [kx + 3, kz - 8], [kx + 3, kz + 5], [kx - 1, kz + 5]], 0, 14, P), { tone: "mid" }));
  out.push(S(G.sphereOf([kx + 1, 7.6, kz - 2], 2.6, P), { tone: "mid" }));
  return out.join("");
}

function wall() {
  const out = [];
  out.push(S(k.slabOf(WALL, BED, WALL_TOP - BED, P, 2, 0.5), { tone: "mid", inner: L([40, 80, 120, 160, 200].map((z) => k.sideSeam(WALL, BED + z, P, 2)).join(""), { tone: "faint" }) }));
  const onFace = (yy, z) => [WALL.x, yy, z];
  const lancet = [];
  const w0 = -9, w1 = 9, s0 = BED + 198, s1 = BED + 222;
  lancet.push(onFace(w0, s0), onFace(w0, s1));
  for (let i = 0; i <= 8; i++) { const t = i / 8; lancet.push(onFace(w0 + (w1 - w0) * t * 0.5, s1 + 7 * Math.sin(Math.PI * t * 0.5))); }
  for (let i = 0; i <= 8; i++) { const t = i / 8; lancet.push(onFace(w1 - (w1 - w0) * (1 - t) * 0.5, s1 + 7 * Math.sin(Math.PI * (1 - t) * 0.5))); }
  lancet.push(onFace(w1, s1), onFace(w1, s0));
  out.push(L(k.pathOf(lancet.map(at), true), { tone: "lo" }));
  out.push(L(k.segment(onFace(0, s0), onFace(0, s1 + 7), P), { tone: "faint" }));
  out.push(S(slab(WALL.x - 2, WALL.x + WALL.w + 2, WALL.y - 1, WALL.y + WALL.d + 1, WALL_TOP, WALL_TOP + 5, 2, 0.4), { tone: "mid" }));
  out.push(S(slab(WALL.x + WALL.w, WALL.x + WALL.w + 4, -9, 9, FLY_IN[0][1] - 9, FLY_IN[0][1], 2, 0.3), { tone: "mid" }));
  return out.join("");
}

function roof() {
  const out = [];
  const ridge = [-ARCH_SPAN - 6, WALL_TOP + 36];
  out.push(S(prismXZ([[-ARCH_SPAN - 6, WALL_TOP + 5], [WALL.x + WALL.w + 3, WALL_TOP + 5], ridge], -16, 16), { tone: "lo" }));
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const x = ridge[0] + (WALL.x + WALL.w + 3 - ridge[0]) * t;
    const z = ridge[1] + (WALL_TOP + 5 - ridge[1]) * t;
    out.push(L(segXZ([x, z], [x, WALL_TOP + 5], 16), { tone: "faint" }));
  }
  return out.join("");
}

function aisle() {
  const out = [];
  const roofLine = [[WALL.x + WALL.w, BED + 150], [PIER_X, BED + 120]];
  out.push(S(prismXZ([roofLine[0], roofLine[1], [PIER_X, BED + 125], [WALL.x + WALL.w, BED + 155]], -15, 15), { tone: "lo" }));
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const x = roofLine[0][0] + (roofLine[1][0] - roofLine[0][0]) * t;
    const z = roofLine[0][1] + (roofLine[1][1] - roofLine[0][1]) * t + 5;
    out.push(L(k.segment([x, -15, z], [x, 15, z], P), { tone: "faint" }));
  }
  out.push(S(slab(WALL.x + WALL.w, PIER_X, -15, 15, BED, BED + 6, 2), { tone: "lo" }));
  return out.join("");
}

function flyerStones() {
  const lerp = (a, b, t) => a + (b - a) * t;
  const inner = (t) => [lerp(FLY_IN[0][0], FLY_IN[1][0], t), lerp(FLY_IN[0][1], FLY_IN[1][1], t) + FLY_BULGE * 4 * t * (1 - t)];
  const outer = (t) => [lerp(FLY_OUT[0][0], FLY_OUT[1][0], t), lerp(FLY_OUT[0][1], FLY_OUT[1][1], t)];
  const stones = [];
  for (let i = 0; i < FLY_COUNT; i++) {
    const t0 = i / FLY_COUNT;
    const t1 = (i + 1) / FLY_COUNT;
    stones.push([inner(t0), inner(t1), outer(t1), outer(t0)]);
  }
  return { stones, outer };
}

function flyer() {
  const out = [];
  const { stones, outer } = flyerStones();
  for (const stone of stones) out.push(S(prismXZ(stone, -FLY_D, FLY_D), { tone: "hi", lit: true }));
  const a = outer(0), b = outer(1);
  const n = [-(b[1] - a[1]), b[0] - a[0]];
  const len = Math.hypot(n[0], n[1]);
  const up = [n[0] / len * 3, n[1] / len * 3];
  out.push(S(prismXZ([a, b, [b[0] + up[0], b[1] + up[1]], [a[0] + up[0], a[1] + up[1]]], -FLY_D - 1, FLY_D + 1), { tone: "hi", lit: true }));
  return out.join("");
}

function pierBody() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PIER, BED, 4, P)}" style="filter:blur(3px)"/>`];
  PIER_STEPS.forEach((step, i) => {
    const x0 = PIER_X, x1 = PIER_X + step.w;
    const seams = [];
    for (let z = step.z0 + 20; z < step.z1 - 4; z += 20) seams.push(k.sideSeam({ x: x0, y: -15, w: step.w, d: 30, r: 0.4 }, z, P, 2));
    out.push(S(slab(x0, x1, -15, 15, step.z0, step.z1, 2, 0.5), { tone: "mid", inner: L(seams.join(""), { tone: "faint" }) }));
    const next = PIER_STEPS[i + 1];
    if (next) {
      out.push(S(prismXZ([[x0, step.z1], [x1, step.z1], [x0 + next.w, next.z0], [x0, next.z0]], -15, 15), { tone: "mid" }));
    }
  });
  return out.join("");
}

function pinnacle() {
  const out = [];
  const top = BED + 236;
  const cx = PIER_X + 13;
  out.push(S(slab(PIER_X - 1, PIER_X + 27, -16, 16, top, top + 4, 2, 0.4), { tone: "mid" }));
  for (const [x, y] of byDepth([[cx - 9, -9], [cx + 9, -9], [cx - 9, 9], [cx + 9, 9]])) {
    out.push(S(k.slabOf({ x: x - 2.5, y: y - 2.5, w: 5, d: 5, r: 0.3 }, top + 4, 20, P, 2), { tone: "mid" }));
    out.push(S(G.solidOf([[0, 3.2], [12, 0]], G.frameOf([x, y, top + 24], [0, 0, 1], [1, 0, 0], [0, 1, 0]), P, { steps: 8 }), { tone: "mid" }));
  }
  out.push(S(k.slabOf({ x: cx - 7, y: -7, w: 14, d: 14, r: 0.4 }, top + 4, 28, P, 2, 0.4), { tone: "mid", inner: L([top + 14, top + 24].map((z) => k.sideSeam({ x: cx - 7, y: -7, w: 14, d: 14, r: 0.4 }, z, P, 2)).join(""), { tone: "faint" }) }));
  const F = G.frameOf([cx, 0, top + 32], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  out.push(S(G.solidOf([[0, 9.5], [42, 0.8]], F, P, { steps: 8 }), { tone: "mid" }));
  const crockets = [];
  for (let s = 8; s < 40; s += 7) {
    const r = 9.5 * (1 - s / 42) + 0.8 * (s / 42) + 1.2;
    for (const a of [Math.PI / 8, Math.PI / 8 + Math.PI / 4 * 1, Math.PI / 8 - Math.PI / 4]) crockets.push(at(G.pointOf(F, s, r, a + Math.PI / 4)));
  }
  out.push(D(crockets, { size: 0.7, tone: "mid" }));
  out.push(S(G.sphereOf([cx, 0, top + 32 + 44.5], 2.8, P), { tone: "mid" }));
  return out.join("");
}

const start = M.state(1);
const U = 10;
const wallPointerX = (s) => Math.min(s.wallOffset * U, 24);
const pierPointerX = (s) => PIER_C + s.pierOffset * U;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Maquette d'une travée de cathédrale gothique sur un banc d'essai : à gauche la nervure de la voûte, le mur haut et sa fenêtre, le toit ; au centre le toit du bas-côté ; au-dessus, l'arc-boutant qui relie le haut du mur à la culée de droite, coiffée d'un pinacle. Le mur et la culée reposent chacun sur une plaque graduée dont l'index montre où passe la résultante des forces. Quand on retire l'arc-boutant, l'index du mur sort de sa base.",
  body: [
    base(),
    pad(PAD_PIER, PIER_C, M.PIER.wide / 2 * U, M.PIER.wide / 6 * U),
    pad(PAD_WALL, 0, M.WALL.thick / 2 * U, 0),
    pierBody(),
    pinnacle(),
    `<g data-part="pier-pointer" transform="${k.translateAlong(P, [pierPointerX(start), 0, 0])}">${pointer()}</g>`,
    aisle(),
    `<g data-part="flyer" transform="${k.translateAlong(P, [0, 0, 0])}">${flyer()}</g>`,
    wall(),
    roof(),
    vault(),
    `<g data-part="wall-pointer" transform="${k.translateAlong(P, [wallPointerX(start), 0, 0])}">${pointer()}</g>`,
  ],
});

const model = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${model}
const P = ${JSON.stringify(P)};
const U = ${U}, LIFT = ${LIFT}, PIER_C = ${PIER_C};
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const fly = svg.querySelector('[data-part="flyer"]');
const wp = svg.querySelector('[data-part="wall-pointer"]');
const pp = svg.querySelector('[data-part="pier-pointer"]');
const out = root.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
let f = 1, target = 1, wallX = 0, pierX = 0, frame = 0, last = 0, clock = 0, touring = !still.matches, visible = false, idle = 0;
function draw() {
  const s = state(f);
  const lift = (1 - f) * LIFT;
  fly.setAttribute("transform", translateAlong(P, [0, 0, lift]));
  fly.style.opacity = String(0.25 + 0.75 * f);
  wp.setAttribute("transform", translateAlong(P, [wallX, 0, 0]));
  pp.setAttribute("transform", translateAlong(P, [pierX, 0, 0]));
  const text = readout(s);
  if (out.textContent !== text) out.textContent = text;
  stage.setAttribute("aria-checked", String(target > 0.5));
  stage.setAttribute("aria-valuetext", (f > 0.5 ? "arc-boutant en place : " : "arc-boutant retiré : ") + text);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; target = Math.floor(clock / 3.2) % 2 === 0 ? 1 : 0; }
  f = calm ? target : f + (target - f) * (1 - Math.exp(-dt / 0.45));
  if (Math.abs(target - f) < 0.002) f = target;
  const s = state(f);
  const wantW = Math.min(s.wallOffset * U, 24), wantP = PIER_C + s.pierOffset * U;
  const k2 = calm ? 1 : 1 - Math.exp(-dt / 0.3);
  wallX += (wantW - wallX) * k2; pierX += (wantP - pierX) * k2;
  draw();
  const settled = !touring && f === target && Math.abs(wantW - wallX) < 0.01 && Math.abs(wantP - pierX) < 0.01;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => { touring = false; target = next; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 4000); run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
// A mouse lifts it while it hovers; a finger or a pen taps to toggle.
stage.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") steer(0); });
stage.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") steer(1); });
stage.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") steer(target > 0.5 ? 0 : 1); });
stage.addEventListener("keydown", (e) => { if (e.key === "b" || e.key === "B" || e.key === " ") { e.preventDefault(); steer(target > 0.5 ? 0 : 1); } });
const s0 = state(1); wallX = Math.min(s0.wallOffset * U, 24); pierX = PIER_C + s0.pierOffset * U;
draw();
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Arc-boutant",
  hint: "Survol, toucher ou B : retirer l'arc-boutant",
  readout: M.readout(start),
  keys: [
    { mark: "lit", label: "L'arc-boutant : ce qui porte la poussée de la voûte vers l'extérieur" },
    { mark: "raised", label: "Index des plaques : où passe la résultante sous le mur et sous la culée" },
  ],
  caption:
    "Une travée de cathédrale en coupe. La voûte pousse le haut du mur vers l'extérieur ; l'arc-boutant reprend cette poussée et la descend dans la culée, assez lourde, avec son pinacle, pour que la résultante reste dans le tiers central de sa base (les deux points). Sans arc-boutant, la résultante sort de la base du mur et il bascule. Modèle simplifié : 130 kN de poussée par travée, mur de 1,20 m, culée de 4 m ; ordres de grandeur, pas une cathédrale précise.",
  body: `<div class="iso-stage" tabindex="0" role="switch" aria-checked="true" aria-label="Arc-boutant : B pour le retirer ou le remettre">${svg}</div>`,
});

export function render() {
  return { plate: body, live };
}
