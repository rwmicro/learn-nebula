import { describe, expect, it } from "vitest";
import {
  age,
  ageRapport,
  formatAns,
  ISOTOPES,
  parseIsotope,
  prng,
  restant,
  tiragesVies,
} from "./sci-decay";

describe("sci-decay", () => {
  it("half-lives", () => {
    expect(ISOTOPES.c14.demiVie).toBe(5730);
    expect(ISOTOPES.k40.demiVie).toBe(1.25e9);
    expect(ISOTOPES.u238.demiVie).toBe(4.47e9);
    expect(parseIsotope("K40")).toBe("k40");
    expect(parseIsotope("u238")).toBe("u238");
    expect(parseIsotope("")).toBe("c14");
  });
  it("t = T½·log2(N0/N)", () => {
    expect(age(0.5, 5730)).toBe(5730);
    expect(age(0.25, 5730)).toBe(11460);
    expect(age(1, 5730)).toBe(0);
    expect(age(0, 5730)).toBeNaN();
    expect(restant(5730 * 3, 5730)).toBeCloseTo(0.125, 12);
    expect(ageRapport(1, 4.47e9)).toBeCloseTo(4.47e9, 0);
    // The Earth (4,54 Ga) still holds about half of its uranium 238.
    expect(restant(4.54e9, ISOTOPES.u238.demiVie)).toBeCloseTo(0.495, 2);
  });
  it("seeded draws are deterministic and exponential", () => {
    expect(tiragesVies(5, 42)).toEqual(tiragesVies(5, 42));
    const v = tiragesVies(20000, 1);
    const half = v.filter((x) => x <= 1).length / v.length;
    expect(half).toBeGreaterThan(0.48);
    expect(half).toBeLessThan(0.52);
    const r = prng(3);
    for (let i = 0; i < 100; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it("formats ages", () => {
    expect(formatAns(11460).replace(/\s/g, " ")).toBe("11 500 ans");
    expect(formatAns(4.47e9)).toBe("4,47 milliards d'années");
    expect(formatAns(1.25e9)).toBe("1,25 milliard d'années");
  });
});
