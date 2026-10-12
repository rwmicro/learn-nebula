// Prisms along any axis, built with the core kit only, so the page can rebuild
// the turning parts (crank, rod, cams, handwheel) every frame. Same shading
// rule as the kit's lathe prisms: four bands by facing, the brightest as top.
import { iso, pathOf, cameraOf } from "../kit/iso-kit.mjs";

const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vMul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vUnit = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
const BAND_AT = [0, 0.2, 0.42, 0.62];
const bandFor = (score) => {
  let band = 0;
  while (band < BAND_AT.length && score >= BAND_AT[band]) band++;
  return band;
};

export function viewDir(P) {
  const { sinA, cosA, sinE, cosE } = cameraOf(P);
  return [cosA * cosE, sinA * cosE, sinE];
}
export function lightDir(P) {
  const { sinA, cosA } = cameraOf(P);
  return vUnit([-sinA, cosA, 1.2]);
}

export function hull2(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// A frame: origin o, axis a, in-plane axes u and v. Polygon points are [pu, pv].
export const axisFrame = (o, a, u, v) => ({ o, a, u, v });
export const frameY = (y) => ({ o: [0, y, 0], a: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] });
const pointIn = (F, s, p) => vAdd(vAdd(vAdd(F.o, vMul(F.a, s)), vMul(F.u, p[0])), vMul(F.v, p[1]));

// A convex prism of `poly` (in the u, v plane) from s0 to s1 along F.a.
export function prismAlong(F, poly, s0, s1, P) {
  const V = viewDir(P);
  const L = lightDir(P);
  const flat = hull2(poly);
  const n = flat.length;
  const low = flat.map((p) => iso(pointIn(F, s0, p), P));
  const high = flat.map((p) => iso(pointIn(F, s1, p), P));
  let cx = 0;
  let cy = 0;
  for (const p of flat) {
    cx += p[0] / n;
    cy += p[1] / n;
  }
  const buckets = [[], [], [], [], []];
  const seen = [];
  for (let j = 0; j < n; j++) {
    const p = flat[j];
    const q = flat[(j + 1) % n];
    let nu = q[1] - p[1];
    let nv = -(q[0] - p[0]);
    if (nu * ((p[0] + q[0]) / 2 - cx) + nv * ((p[1] + q[1]) / 2 - cy) < 0) {
      nu = -nu;
      nv = -nv;
    }
    const normal = vUnit(vAdd(vMul(F.u, nu), vMul(F.v, nv)));
    const visible = vDot(normal, V) > 1e-6;
    seen.push(visible);
    if (visible) buckets[bandFor(vDot(normal, L))].push(pathOf([low[j], low[(j + 1) % n], high[(j + 1) % n], high[j]], true));
  }
  const caps = [
    [low, vMul(F.a, -1)],
    [high, F.a],
  ];
  const capSeen = caps.map(([, normal]) => vDot(normal, V) > 1e-6);
  caps.forEach(([points, normal], index) => {
    if (capSeen[index]) buckets[bandFor(vDot(normal, L))].push(pathOf(points, true));
  });
  const creases = [];
  for (let j = 0; j < n; j++) {
    const prev = (j - 1 + n) % n;
    const a0 = [flat[j][0] - flat[prev][0], flat[j][1] - flat[prev][1]];
    const b0 = [flat[(j + 1) % n][0] - flat[j][0], flat[(j + 1) % n][1] - flat[j][1]];
    const sharp = (a0[0] * b0[0] + a0[1] * b0[1]) / (Math.hypot(a0[0], a0[1]) * Math.hypot(b0[0], b0[1]) || 1) < Math.cos(0.35);
    if (sharp && seen[j] !== seen[prev]) continue;
    if (sharp && seen[j] && seen[prev]) creases.push(pathOf([low[j], high[j]]));
    caps.forEach(([points], index) => {
      if (capSeen[index] && seen[j]) creases.push(pathOf([points[j], points[(j + 1) % n]]));
    });
  }
  const outline = pathOf(hull2([...low, ...high]), true);
  return { fill: outline, outline, crease: creases.join(""), top: buckets[4].join(""), shades: buckets.slice(0, 4).map((list) => list.join("")) };
}

export const circlePoly = (cx, cy, r, steps = 40, phase = 0) =>
  Array.from({ length: steps }, (_, i) => [cx + r * Math.cos(phase + (i / steps) * Math.PI * 2), cy + r * Math.sin(phase + (i / steps) * Math.PI * 2)]);

export const discAlong = (F, cx, cy, r, s0, s1, P, steps = 40) => prismAlong(F, circlePoly(cx, cy, r, steps), s0, s1, P);

// A circle drawn on the face s of a frame, as a closed screen path.
export const circleOnFace = (F, s, cx, cy, r, P, steps = 28) => pathOf(circlePoly(cx, cy, r, steps).map((p) => iso(pointIn(F, s, p), P)), true);
export const segmentOnFace = (F, s, a, b, P) => pathOf([iso(pointIn(F, s, a), P), iso(pointIn(F, s, b), P)]);
export const pointOnFace = (F, s, p, P) => iso(pointIn(F, s, p), P);

const turnPoint = ([x, y], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
export const turnPoly = (poly, angle, [cx, cy]) => poly.map((p) => {
  const [x, y] = turnPoint(p, angle);
  return [cx + x, cy + y];
});

// Crank web with its counterweight: a boss round the pin, the hub, and a fan
// of radius `reach` opposite the pin. Angle 0 puts the pin straight up (+v).
export function webPoly(throwR, pinBoss, hubR, reach, spread) {
  const pts = [...circlePoly(0, throwR, pinBoss, 24), ...circlePoly(0, 0, hubR, 24)];
  for (let i = 0; i <= 16; i++) {
    const a = -Math.PI / 2 - spread + (2 * spread * i) / 16;
    pts.push([reach * Math.cos(a), reach * Math.sin(a)]);
  }
  return pts;
}

// Cam lobe: base circle plus a sine-squared bump of `lift` over `width` radians.
export function camPoly(base, lift, width, steps = 72) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    let d = Math.atan2(Math.sin(a), Math.cos(a));
    const u = d / width + 0.5;
    const r = base + (u > 0 && u < 1 ? lift * Math.sin(Math.PI * u) ** 2 : 0);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}
