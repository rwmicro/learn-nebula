import { describe, expect, it } from "vitest";
import {
  ellipse,
  erreurs,
  forme,
  gradMse,
  jeu,
  logistiquePas,
  logLoss,
  mse,
  nuage,
  pas,
  perceptronPas,
  type Poids,
} from "./ml-train";

const pts = nuage(20, 0.8, 1, 0.5);

describe("ml-train: gradient descent on a line", () => {
  it("the dataset is deterministic and spans [0, 4]", () => {
    expect(nuage(20, 0.8, 1, 0.5)).toEqual(pts);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(4);
    }
  });
  it("the gradient matches finite differences", () => {
    const g = gradMse(pts, -0.5, 3);
    const h = 1e-6;
    expect(g.dw).toBeCloseTo((mse(pts, -0.5 + h, 3) - mse(pts, -0.5 - h, 3)) / (2 * h), 5);
    expect(g.db).toBeCloseTo((mse(pts, -0.5, 3 + h) - mse(pts, -0.5, 3 - h)) / (2 * h), 5);
  });
  it("the least-squares minimum has a zero gradient", () => {
    const f = forme(pts);
    const g = gradMse(pts, f.w, f.b);
    expect(Math.abs(g.dw)).toBeLessThan(1e-10);
    expect(Math.abs(g.db)).toBeLessThan(1e-10);
    expect(f.w).toBeCloseTo(0.8, 0);
  });
  it("converges below the critical rate and diverges above it", () => {
    const f = forme(pts);
    let a = { w: -1, b: 4 };
    for (let i = 0; i < 400; i++) a = pas(pts, a.w, a.b, 0.9 * f.tauxMax);
    expect(mse(pts, a.w, a.b) - f.min).toBeLessThan(1e-6);
    let d = { w: -1, b: 4 };
    for (let i = 0; i < 60; i++) d = pas(pts, d.w, d.b, 1.1 * f.tauxMax);
    expect(mse(pts, d.w, d.b)).toBeGreaterThan(100);
  });
  it("level sets lie exactly on the requested loss", () => {
    const f = forme(pts);
    for (const q of ellipse(f, f.min + 2, 12)) expect(mse(pts, q.w, q.b)).toBeCloseTo(f.min + 2, 9);
  });
});

describe("ml-train: perceptron and logistic regression", () => {
  const zero: Poids = { w1: 0, w2: 0, w3: 0, b: 0 };

  function perceptron(nom: string, produit: boolean, max = 2000) {
    const data = jeu(nom);
    let p = zero;
    let i = 0;
    for (let k = 0; k < max; k++) {
      const r = perceptronPas(p, data, i, produit);
      if (r.index < 0) return { p, ok: true, data };
      p = r.poids;
      i = r.index + 1;
    }
    return { p, ok: false, data };
  }

  it("the perceptron converges on separable points", () => {
    const r = perceptron("separables", false);
    expect(r.ok).toBe(true);
    expect(erreurs(r.p, r.data, false)).toBe(0);
  });
  it("never converges on XOR with a straight line, but does with x1·x2", () => {
    expect(perceptron("xor", false).ok).toBe(false);
    const r = perceptron("xor", true, 20000);
    expect(r.ok).toBe(true);
  });
  it("logistic regression lowers the log loss and stays near chance on XOR", () => {
    const sep = jeu("separables");
    let p = zero;
    const l0 = logLoss(p, sep, false);
    for (let i = 0; i < 300; i++) p = logistiquePas(p, sep, false, 2);
    expect(logLoss(p, sep, false)).toBeLessThan(l0 / 3);
    expect(erreurs(p, sep, false)).toBe(0);

    const xor = jeu("xor");
    let q = zero;
    for (let i = 0; i < 300; i++) q = logistiquePas(q, xor, false, 2);
    expect(erreurs(q, xor, false)).toBeGreaterThanOrEqual(8);
    let s = zero;
    for (let i = 0; i < 2000; i++) s = logistiquePas(s, xor, true, 4);
    expect(erreurs(s, xor, true)).toBe(0);
  });
});
