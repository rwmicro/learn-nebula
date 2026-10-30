import { describe, it, expect } from "vitest";
import { byProximity, disciplinesOf, longestRun, milestones, progressToNext } from "./milestones";

describe("milestones", () => {
  it("lists reached thresholds and the next one", () => {
    const rows = milestones({ read: 12, bestRun: 0, right: 600, disciplines: 3 });
    const read = rows.find((r) => r.kind === "read")!;
    expect(read.reached).toEqual([1, 10]);
    expect(read.next).toBe(50);
    expect(read.from).toBe(10);
    expect(rows.find((r) => r.kind === "right")!.next).toBeNull();
    expect(rows.find((r) => r.kind === "bestRun")!.reached).toEqual([]);
  });
  it("finds the longest run of days", () => {
    const d = (r: number) => ({ r, c: 0 });
    expect(longestRun({ "2026-01-30": d(1), "2026-01-31": d(1), "2026-02-01": d(1), "2026-02-03": d(1), "2026-02-02": d(0) })).toBe(3);
    expect(longestRun({})).toBe(0);
  });
  it("counts disciplines by their two top folders", () => {
    expect(disciplinesOf(["social-sciences/history/a", "social-sciences/history/b/c", "applied-sciences/chemistry/x", "top"])).toBe(2);
  });
  it("puts the closest open milestone first and the finished ones last", () => {
    const rows = milestones({ read: 0, bestRun: 2, right: 3, disciplines: 20 });
    expect(byProximity(rows).map((r) => r.kind)).toEqual(["bestRun", "right", "read", "disciplines"]);
    expect(progressToNext(rows.find((r) => r.kind === "right")!)).toBeCloseTo(0.3);
    expect(progressToNext(rows.find((r) => r.kind === "disciplines")!)).toBe(1);
  });
});
