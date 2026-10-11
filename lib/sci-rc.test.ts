import { describe, expect, it } from "vitest";
import {
  courant,
  formatDuree,
  tau,
  tempsFraction,
  uC,
  uniteTemps,
} from "./sci-rc";

describe("sci-rc", () => {
  it("τ = RC", () => {
    expect(tau(1000, 100)).toBeCloseTo(0.1, 12);
    expect(tau(10_000, 1)).toBeCloseTo(0.01, 12);
  });
  it("63 % at τ while charging, 37 % while discharging", () => {
    expect(uC("charge", 10, 0.1, 0.1)).toBeCloseTo(6.3212, 4);
    expect(uC("decharge", 10, 0.1, 0.1)).toBeCloseTo(3.6788, 4);
    expect(uC("charge", 5, 0, 1)).toBe(0);
    expect(uC("decharge", 5, 0, 1)).toBe(5);
    expect(uC("charge", 1, 5, 1)).toBeGreaterThan(0.993);
  });
  it("99 % after τ·ln 100 ≈ 4,6 τ", () => {
    expect(tempsFraction(0.99, 1)).toBeCloseTo(4.605, 3);
    expect(uC("charge", 1, tempsFraction(0.99, 2), 2)).toBeCloseTo(0.99, 10);
  });
  it("current starts at E/R and changes sign on discharge", () => {
    expect(courant("charge", 12, 1000, 0, 1)).toBeCloseTo(0.012, 12);
    expect(courant("decharge", 12, 1000, 0, 1)).toBeCloseTo(-0.012, 12);
  });
  it("formats durations", () => {
    expect(formatDuree(0.1)).toBe("100 ms");
    expect(formatDuree(2.5)).toBe("2,5 s");
    expect(formatDuree(5e-5)).toBe("50 µs");
    expect(formatDuree(150)).toBe("2 min 30 s");
    expect(uniteTemps(0.5).unite).toBe("ms");
  });
});
