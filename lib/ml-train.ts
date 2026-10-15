// Pure models behind the two machine-learning widgets (public/js/sci/
// descente-gradient.js and frontiere.js): gradient descent on a linear
// regression, and the perceptron / logistic regression on 2-D points.
// No DOM here, so every number the widgets show is unit-tested
// (lib/ml-train.test.ts).

export type Pt = { x: number; y: number };

/** Small deterministic PRNG (mulberry32): same dataset on every visit. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draw (Box-Muller) from a uniform source. */
function gauss(r: () => number): number {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// ------------------------------------------------- linear regression (MSE)

/** n points around y = pente·x + ordonnee, x spread over [0, 4]. */
export function nuage(n: number, pente: number, ordonnee: number, bruit: number, seed = 7): Pt[] {
  const r = rng(seed);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const x = (4 * (i + 0.15 + 0.7 * r())) / n;
    out.push({ x, y: pente * x + ordonnee + bruit * gauss(r) });
  }
  return out;
}

/** Mean squared error of the line y = w·x + b. */
export function mse(pts: Pt[], w: number, b: number): number {
  let s = 0;
  for (const p of pts) {
    const e = w * p.x + b - p.y;
    s += e * e;
  }
  return s / pts.length;
}

/** Gradient of the MSE: ∂L/∂w = (2/n) Σ e·x, ∂L/∂b = (2/n) Σ e. */
export function gradMse(pts: Pt[], w: number, b: number): { dw: number; db: number } {
  let dw = 0;
  let db = 0;
  for (const p of pts) {
    const e = w * p.x + b - p.y;
    dw += e * p.x;
    db += e;
  }
  return { dw: (2 * dw) / pts.length, db: (2 * db) / pts.length };
}

/** One gradient-descent step with learning rate `taux`. */
export function pas(pts: Pt[], w: number, b: number, taux: number): { w: number; b: number } {
  const g = gradMse(pts, w, b);
  return { w: w - taux * g.dw, b: b - taux * g.db };
}

/**
 * The quadratic form of the MSE: L(w, b) = L* + (θ − θ*)ᵀ A (θ − θ*) with
 * A = [[E[x²], E[x]], [E[x], 1]]. Gives the exact minimum (least squares),
 * the eigen-directions of A (to draw the level sets, which are ellipses),
 * and the learning rate past which descent diverges: 2 / λmax(2A).
 */
export function forme(pts: Pt[]) {
  const n = pts.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const mx = sx / n;
  const my = sy / n;
  const mxx = sxx / n;
  const varx = mxx - mx * mx;
  const w = (sxy / n - mx * my) / varx;
  const b = my - w * mx;
  const tr = mxx + 1;
  const det = mxx - mx * mx;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc; // largest eigenvalue of A
  const l2 = tr / 2 - disc;
  // Eigenvector of A for l1: (mx, l1 − mxx), normalised (mx ≠ 0 here).
  let v1x = mx;
  let v1y = l1 - mxx;
  const nv = Math.hypot(v1x, v1y) || 1;
  v1x /= nv;
  v1y /= nv;
  return {
    w,
    b,
    min: mse(pts, w, b),
    l1,
    l2,
    v1: { x: v1x, y: v1y },
    v2: { x: -v1y, y: v1x },
    tauxMax: 1 / l1,
  };
}

/** Points (w, b) of the level set L = niveau: an ellipse around the minimum. */
export function ellipse(f: ReturnType<typeof forme>, niveau: number, k = 96): { w: number; b: number }[] {
  const d = niveau - f.min;
  if (!(d > 0)) return [];
  const r1 = Math.sqrt(d / f.l1);
  const r2 = Math.sqrt(d / f.l2);
  const out = [];
  for (let i = 0; i <= k; i++) {
    const t = (2 * Math.PI * i) / k;
    const a = r1 * Math.cos(t);
    const c = r2 * Math.sin(t);
    out.push({ w: f.w + a * f.v1.x + c * f.v2.x, b: f.b + a * f.v1.y + c * f.v2.y });
  }
  return out;
}

// ----------------------------------------------- classification in the plane

export type Ech = { x1: number; x2: number; c: 0 | 1 };
export type Poids = { w1: number; w2: number; w3: number; b: number };

/** Ready-made point sets in [−1, 1]². */
export function jeu(nom: string, seed = 3): Ech[] {
  const r = rng(seed);
  const pts: Ech[] = [];
  const j = (s: number) => (r() - 0.5) * s;
  if (nom === "xor") {
    for (const [cx, cy, c] of [
      [-0.5, -0.5, 0],
      [0.5, 0.5, 0],
      [-0.5, 0.5, 1],
      [0.5, -0.5, 1],
    ] as const) {
      for (let i = 0; i < 6; i++) pts.push({ x1: cx + j(0.5), x2: cy + j(0.5), c });
    }
  } else if (nom === "melange") {
    for (let i = 0; i < 14; i++) pts.push({ x1: -0.2 + 0.35 * gauss(r), x2: -0.15 + 0.35 * gauss(r), c: 0 });
    for (let i = 0; i < 14; i++) pts.push({ x1: 0.2 + 0.35 * gauss(r), x2: 0.15 + 0.35 * gauss(r), c: 1 });
  } else {
    // Uniform in the square, split by a tilted line with a thin margin: the
    // perceptron needs a few dozen corrections to find a separating line.
    while (pts.length < 26) {
      const x1 = j(1.9);
      const x2 = j(1.9);
      const d = 0.55 * x1 - x2 + 0.2;
      if (Math.abs(d) > 0.1) pts.push({ x1, x2, c: d > 0 ? 1 : 0 });
    }
  }
  return pts.map((p) => ({ x1: clamp(p.x1), x2: clamp(p.x2), c: p.c }));
}

const clamp = (v: number) => Math.max(-0.97, Math.min(0.97, v));

/** Weighted sum w1·x1 + w2·x2 (+ w3·x1·x2 when the product feature is on) + b. */
export function score(p: Poids, x1: number, x2: number, produit: boolean): number {
  return p.w1 * x1 + p.w2 * x2 + (produit ? p.w3 * x1 * x2 : 0) + p.b;
}

export const sigmoide = (z: number) => 1 / (1 + Math.exp(-z));

/** Points misclassified by the rule "class 1 when P ≥ seuil" (score ≥ logit(seuil)). */
export function erreurs(p: Poids, pts: Ech[], produit: boolean, seuil = 0.5): number {
  const z0 = Math.log(seuil / (1 - seuil));
  let n = 0;
  for (const q of pts) if ((score(p, q.x1, q.x2, produit) >= z0 ? 1 : 0) !== q.c) n++;
  return n;
}

/**
 * One perceptron update, Rosenblatt's rule: from index `depart`, find the
 * next misclassified point (cyclically) and add ±x to the weights. Returns
 * the new weights and the point corrected, or `index: -1` when every point
 * is on its side (converged).
 */
export function perceptronPas(
  p: Poids,
  pts: Ech[],
  depart: number,
  produit: boolean,
  taux = 1,
): { poids: Poids; index: number } {
  for (let k = 0; k < pts.length; k++) {
    const i = (depart + k) % pts.length;
    const q = pts[i];
    const t = q.c === 1 ? 1 : -1;
    if (t * score(p, q.x1, q.x2, produit) <= 0) {
      return {
        poids: {
          w1: p.w1 + taux * t * q.x1,
          w2: p.w2 + taux * t * q.x2,
          w3: produit ? p.w3 + taux * t * q.x1 * q.x2 : p.w3,
          b: p.b + taux * t,
        },
        index: i,
      };
    }
  }
  return { poids: p, index: -1 };
}

/** Mean cross-entropy (log loss) of the logistic model. */
export function logLoss(p: Poids, pts: Ech[], produit: boolean): number {
  let s = 0;
  for (const q of pts) {
    const z = score(p, q.x1, q.x2, produit);
    // log(1 + e^−z) for c = 1, log(1 + e^z) for c = 0, computed stably.
    const m = q.c === 1 ? -z : z;
    s += m > 30 ? m : Math.log1p(Math.exp(m));
  }
  return s / pts.length;
}

/** One full-batch gradient step on the log loss: ∇ = mean((σ(z) − c)·x). */
export function logistiquePas(p: Poids, pts: Ech[], produit: boolean, taux: number): Poids {
  let g1 = 0;
  let g2 = 0;
  let g3 = 0;
  let gb = 0;
  for (const q of pts) {
    const e = sigmoide(score(p, q.x1, q.x2, produit)) - q.c;
    g1 += e * q.x1;
    g2 += e * q.x2;
    g3 += e * q.x1 * q.x2;
    gb += e;
  }
  const n = pts.length;
  return {
    w1: p.w1 - (taux * g1) / n,
    w2: p.w2 - (taux * g2) / n,
    w3: produit ? p.w3 - (taux * g3) / n : p.w3,
    b: p.b - (taux * gb) / n,
  };
}
