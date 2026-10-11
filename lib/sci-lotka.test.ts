import { describe, expect, it } from "vitest";
import {
  equilibre,
  integrer,
  invariant,
  periode,
  periodeLineaire,
} from "./sci-lotka";

const p = { alpha: 1.1, beta: 0.4, delta: 0.1, gamma: 0.4 };

describe("sci-lotka", () => {
  it("equilibrium γ/δ, α/β is a fixed point", () => {
    const e = equilibre(p);
    expect(e.x).toBeCloseTo(4, 12);
    expect(e.y).toBeCloseTo(2.75, 12);
    const r = integrer(p, e.x, e.y, 10, 0.01);
    expect(r.x[r.x.length - 1]).toBeCloseTo(4, 8);
  });
  it("RK4 keeps the invariant (closed orbits)", () => {
    const r = integrer(p, 10, 10, 60, 0.01);
    const v0 = invariant(p, r.x[0], r.y[0]);
    const vEnd = invariant(p, r.x[r.x.length - 1], r.y[r.y.length - 1]);
    expect(Math.abs(vEnd - v0) / Math.abs(v0)).toBeLessThan(1e-4);
    expect(Math.min(...r.x)).toBeGreaterThan(0);
  });
  it("small orbits have the linear period 2π/√(αγ)", () => {
    const r = integrer(p, 4.05, 2.75, 80, 0.005);
    expect(periode(r.t, r.x)).toBeCloseTo(periodeLineaire(p), 1);
  });
});
