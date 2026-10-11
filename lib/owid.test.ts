import { describe, expect, it } from "vitest";
import { parseOwidCsv, pickSeries, sig, splitCsvLine } from "./owid";

const CSV = [
  "entity,code,year,life_expectancy,life_expectancy__annotations",
  "France,FRA,1950,66.4,",
  "France,FRA,1951,66.9,",
  'France,FRA,1952,,"note, quoted"',
  "World,OWID_WRL,1950,46.5,",
  '"Korea, South",KOR,1950,24.0,',
].join("\n");

describe("splitCsvLine", () => {
  it("keeps commas and doubled quotes inside quotes", () => {
    expect(splitCsvLine('a,"b, c","d ""e"""')).toEqual(["a", "b, c", 'd "e"']);
  });
});

describe("parseOwidCsv", () => {
  it("skips the annotation columns and keeps empty values as null", () => {
    const t = parseOwidCsv(CSV);
    expect(t.columns).toEqual(["life_expectancy"]);
    expect(t.rows).toHaveLength(5);
    expect(t.rows[2].values).toEqual([null]);
    expect(t.rows[4].entity).toBe("Korea, South");
  });
});

describe("pickSeries", () => {
  const t = parseOwidCsv(CSV);

  it("resolves French names and aggregates, in vault order", () => {
    const { series, missing } = pickSeries(t, ["Monde", "France", "Atlantide"]);
    expect(series.map((s) => s.name)).toEqual(["Monde", "France"]);
    expect(series[1].points).toEqual([
      [1950, 66.4],
      [1951, 66.9],
    ]);
    expect(missing).toEqual(["Atlantide"]);
  });

  it("filters by year", () => {
    const { series } = pickSeries(t, ["France"], { from: 1951 });
    expect(series[0].points).toEqual([[1951, 66.9]]);
  });
});

describe("sig", () => {
  it("rounds to four significant digits", () => {
    expect(sig(123456.789)).toBe(123457);
    expect(sig(0.0123456)).toBe(0.01235);
    expect(sig(66.4321)).toBe(66.43);
  });
});
