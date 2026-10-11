import { describe, expect, it } from "vitest";
import {
  courbe,
  etat,
  fatigueGains,
  parseIntensite,
  parseSeances,
  picIsole,
  PARAMS,
  timings,
  type Seance,
} from "./sci-fitness";

const mk = (days: number[], intensite: Seance["intensite"]): Seance[] =>
  days.map((jour) => ({ jour, intensite }));

describe("sci-fitness", () => {
  it("parses props", () => {
    expect(parseIntensite("légère")).toBe("legere");
    expect(parseIntensite("Intense")).toBe("intense");
    expect(parseIntensite("??")).toBe("moderee");
    expect(parseSeances("7, 1,4,4, 40", 21, "intense")).toEqual(
      mk([1, 4, 7], "intense"),
    );
    expect(parseSeances(undefined, 21, "intense")).toEqual([]);
  });

  it("one session: fatigue first, then above baseline, then back", () => {
    const s = mk([1], "intense");
    const { tPic, tZero } = picIsole();
    expect(tZero).toBeGreaterThan(1);
    expect(tPic).toBeGreaterThan(2.5);
    expect(tPic).toBeLessThan(5);
    expect(etat(s, 1.5).perf).toBeLessThan(100);
    expect(etat(s, 1 + tPic).perf).toBeGreaterThan(101);
    expect(etat(s, 1 + tPic).perf).toBeGreaterThan(etat(s, 1 + tPic + 1).perf);
    expect(etat(s, 30).perf).toBeCloseTo(100, 1);
    expect(etat(s, 0.5).perf).toBe(100);
  });

  it("the analytic peak matches the sampled curve", () => {
    const c = courbe(mk([1], "moderee"), 1, 15, 0.01);
    const best = c.reduce((a, b) => (b.perf > a.perf ? b : a));
    expect(best.t - 1).toBeCloseTo(picIsole().tPic, 1);
  });

  it("recent load raises the fatigue gain (Busso)", () => {
    const g = fatigueGains(mk([1, 2, 3], "intense"));
    expect(g[0]).toBe(PARAMS.kFatigue);
    expect(g[1]).toBeGreaterThan(g[0]);
    expect(g[2]).toBeGreaterThan(g[1]);
  });

  it("daily intense sessions overreach; spaced ones supercompensate", () => {
    const daily = mk([1, 2, 3, 4, 5, 6, 7, 8], "intense");
    expect(timings(daily).every((t) => t.timing === "trop-tot")).toBe(true);
    expect(etat(daily, 8).perf).toBeLessThan(80);
    const spaced = mk([1, 5, 9, 13], "intense");
    expect(timings(spaced).every((t) => t.timing === "fenetre")).toBe(true);
    const late = mk([1, 15], "intense");
    expect(timings(late)[0].timing).toBe("trop-tard");
  });
});
