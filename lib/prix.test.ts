import { describe, expect, it } from "vitest";
import { FRANCS_PER_EURO, IPC_LAST, formatEuros, parsePrix, toEuros } from "./prix";

describe("parsePrix", () => {
  it("reads old francs, thousand separators and the year", () => {
    expect(parsePrix("prix: 1 380 000 francs 1954")).toEqual({
      amount: 1380000,
      unit: "AF",
      year: 1954,
      label: "1 380 000 francs",
    });
  });

  it("takes a bare « francs » as new francs from 1960", () => {
    expect(parsePrix("prix: 12,50 francs 1975")?.unit).toBe("NF");
    expect(parsePrix("prix: 12,50 francs 1975")?.amount).toBe(12.5);
  });

  it("refuses currencies that did not exist that year", () => {
    expect(parsePrix("prix: 10 AF 1970")).toBeNull();
    expect(parsePrix("prix: 10 euros 1990")).toBeNull();
    expect(parsePrix("prix: 10 NF 2010")).toBeNull();
  });

  it("ignores code that is not a price", () => {
    expect(parsePrix("const prix = 3")).toBeNull();
    expect(parsePrix("prix: 10 dollars 1990")).toBeNull();
    expect(parsePrix("prix: 10 euros 1800")).toBeNull();
  });
});

describe("toEuros", () => {
  it("divides old francs by 100 then by the euro rate", () => {
    const same = toEuros(655957, "AF", 1958, 1958);
    expect(same).toBeCloseTo(655957 / 100 / FRANCS_PER_EURO, 6);
    expect(same).toBeCloseTo(1000, 6);
  });

  it("is the identity for euros of the target year", () => {
    expect(toEuros(42, "EUR", IPC_LAST)).toBeCloseTo(42, 9);
  });

  it("gives about 9,47 € for 300 francs of 1950 in 2025 euros", () => {
    expect(toEuros(300, "AF", 1950, 2025)).toBeGreaterThan(9);
    expect(toEuros(300, "AF", 1950, 2025)).toBeLessThan(10);
  });
});

describe("formatEuros", () => {
  it("keeps cents under 100 € and drops them above", () => {
    expect(formatEuros(9.4712).replace(/\s/g, " ")).toBe("9,47 €");
    expect(formatEuros(33713.4).replace(/\s/g, " ")).toBe("33 713 €");
  });
});
