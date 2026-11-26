import { describe, expect, it } from "vitest";
import {
  MODELS,
  balance,
  collisionProb,
  curveOk,
  curvePoints,
  discreteLog,
  doubleAndAdd,
  ecAdd,
  euclidSteps,
  halfChance,
  kvBytesIfMha,
  kvBytesPerToken,
  loads,
  memoryGB,
  modInv,
  modPow,
  moeParams,
  multiples,
  onCurve,
  order,
  phi,
  pointOrder,
  powers,
  realAdd,
  routerLogits,
  rsa,
  softmax,
  squareMultiply,
  topK,
} from "./calcul";

describe("number theory", () => {
  it("extended Euclid gives Bézout coefficients", () => {
    for (const [a, b] of [
      [240, 46],
      [3120, 17],
      [17, 3120],
      [7, 1],
    ]) {
      const { g, u, v } = euclidSteps(a, b);
      expect(a * u + b * v).toBe(g);
    }
    expect(euclidSteps(240, 46).g).toBe(2);
  });
  it("inverses", () => {
    expect(modInv(17, 3120)).toBe(2753);
    expect(modInv(4, 8)).toBeNull();
  });
  it("modPow and square-and-multiply agree", () => {
    expect(modPow(65, 17, 3233)).toBe(2790n);
    const s = squareMultiply(65, 17, 3233);
    expect(s.length).toBe(5);
    expect(s[s.length - 1].value).toBe(2790n);
    expect(modPow(2, 10, 1000)).toBe(24n);
  });
  it("powers, order, discrete log", () => {
    expect(powers(3, 7)).toEqual([3, 2, 6, 4, 5, 1]);
    expect(order(3, 7)).toBe(6);
    expect(order(2, 7)).toBe(3);
    expect(order(2, 8)).toBe(0);
    expect(discreteLog(3, 5, 7)).toBe(5);
    expect(discreteLog(2, 3, 7)).toBe(-1);
    expect(phi(12)).toBe(4);
    expect(phi(23)).toBe(22);
  });
});

describe("RSA", () => {
  it("the classic p=61, q=53 example", () => {
    const r = rsa(61, 53, 17, 65);
    expect(r.ok).toBe(true);
    expect(r.n).toBe(3233);
    expect(r.phi).toBe(3120);
    expect(r.d).toBe(2753);
    expect(r.c).toBe(2790);
    expect(r.back).toBe(65);
  });
  it("refuses bad keys with a reason", () => {
    expect(rsa(61, 53, 3, 65).errors.join()).toMatch(/facteur commun/);
    expect(rsa(60, 53, 17, 65).ok).toBe(false);
    expect(rsa(61, 53, 17, 5000).errors.join()).toMatch(/entre 0/);
  });
  it("decrypts every message for a small key", () => {
    for (let m = 0; m < 143; m++) expect(rsa(11, 13, 7, m).back).toBe(m);
  });
});

describe("elliptic curves", () => {
  // y² = x³ + 2x + 2 over F_17: 18 affine points + O = 19, prime order.
  const a = 2;
  const b = 2;
  const p = 17;
  it("counts points and checks the curve", () => {
    expect(curveOk(a, b, p)).toBe(true);
    expect(curveOk(0, 0, p)).toBe(false);
    const pts = curvePoints(a, b, p);
    expect(pts.length).toBe(18);
    for (const P of pts) expect(onCurve(P, a, b, p)).toBe(true);
  });
  it("adds and doubles", () => {
    expect(ecAdd({ x: 5, y: 1 }, { x: 5, y: 1 }, a, p).R).toEqual({ x: 6, y: 3 });
    expect(ecAdd({ x: 5, y: 1 }, { x: 6, y: 3 }, a, p).R).toEqual({ x: 10, y: 6 });
    expect(ecAdd({ x: 5, y: 1 }, { x: 5, y: 16 }, a, p).R).toBeNull();
  });
  it("orders and double-and-add", () => {
    expect(pointOrder({ x: 5, y: 1 }, a, p)).toBe(19);
    const m = multiples({ x: 5, y: 1 }, 19, a, p);
    expect(m[18]).toBeNull();
    const steps = doubleAndAdd({ x: 5, y: 1 }, 13, a, p);
    expect(steps[steps.length - 1].R).toEqual(m[12]);
  });
  it("real chord rule keeps the third point on the curve", () => {
    const P = { x: -1, y: 1 };
    const Q = { x: 0, y: 1 };
    const r = realAdd(P, Q, -1)!; // y² = x³ − x + 1
    expect(r.third.y ** 2).toBeCloseTo(r.third.x ** 3 - r.third.x + 1, 9);
    expect(r.R.y).toBeCloseTo(-r.third.y, 9);
  });
});

describe("birthday bound", () => {
  it("23 people for 365 days", () => {
    expect(collisionProb(23, 365)).toBeGreaterThan(0.5);
    expect(collisionProb(22, 365)).toBeLessThan(0.5);
    expect(halfChance(365)).toBeCloseTo(22.49, 1);
    expect(collisionProb(2 ** 64, 2 ** 128)).toBeCloseTo(0.39, 2);
  });
});

describe("mixture of experts", () => {
  it("softmax and top-k", () => {
    const s = softmax([1, 2, 3]);
    expect(s.reduce((x, y) => x + y)).toBeCloseTo(1);
    const t = topK([0.1, 0.5, 0.3, 0.1], 2);
    expect(t.idx).toEqual([1, 2]);
    expect(t.w[0] + t.w[1]).toBeCloseTo(1);
  });
  it("bias balancing lowers the imbalance", () => {
    const words = Array.from({ length: 300 }, (_, i) => "mot" + i);
    const batch = words.map((w) => softmax(routerLogits(w, 16, 2.5)));
    const before = loads(batch, 2).imbalance;
    const { history } = balance(batch, 2, 60);
    expect(before).toBeGreaterThan(1.8);
    expect(history[history.length - 1]).toBeLessThan(before * 0.7);
  });
  it("DeepSeek-V3-like stack is about 671B total, 37B active", () => {
    const r = moeParams({ layers: 58, experts: 256, k: 8, shared: 1, expertM: 44.04, otherB: 14.5 });
    expect(r.totalB).toBeGreaterThan(660);
    expect(r.totalB).toBeLessThan(680);
    expect(r.activeB).toBeGreaterThan(35);
    expect(r.activeB).toBeLessThan(39);
  });
});

describe("LLM memory", () => {
  const l8 = MODELS.find((m) => m.name === "Llama 3.1 8B")!;
  const ds = MODELS.find((m) => m.name.startsWith("DeepSeek"))!;
  it("KV cache per token", () => {
    expect(kvBytesPerToken(l8)).toBe(131072); // 128 KiB
    expect(kvBytesIfMha(l8)).toBe(524288);
    expect(kvBytesPerToken(ds)).toBe(61 * 576 * 2);
  });
  it("fine-tuning budgets", () => {
    expect(memoryGB(l8, "full").total).toBeCloseTo(128, 0);
    expect(memoryGB(l8, "lora").total).toBeLessThan(18);
    expect(memoryGB(l8, "qlora").total).toBeLessThan(6);
    expect(memoryGB(l8, "inference", { bits: 16, ctx: 8192 }).kv).toBeCloseTo(1.07, 2);
  });
});
