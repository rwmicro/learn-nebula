import { describe, expect, it } from "vitest";
import { dayIndex, duelOrder, fnv1a, parseDuo, parseHash, pointFor, rng, tally, ROUND_MS } from "./duel";

describe("duelOrder", () => {
  it("is the same for the same seed, and a permutation", () => {
    const a = duelOrder(25, 1234);
    expect(a).toEqual(duelOrder(25, 1234));
    expect(a).toHaveLength(10);
    expect(new Set(a).size).toBe(10);
    expect(a.every((i) => i >= 0 && i < 25)).toBe(true);
    expect(duelOrder(25, 1235)).not.toEqual(a);
  });
  it("plays every question of a short note", () => {
    expect(duelOrder(3, 9).sort()).toEqual([0, 1, 2]);
    expect(duelOrder(0, 9)).toEqual([]);
  });
  it("rng stays in [0, 1)", () => {
    const r = rng(0);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });
});

describe("pointFor / tally", () => {
  const ok = [false, true, false];
  it("goes to the faster right answer", () => {
    expect(pointFor(ok, { c: 1, ms: 900 }, { c: 1, ms: 1200 })).toBe("host");
    expect(pointFor(ok, { c: 1, ms: 1300 }, { c: 1, ms: 1200 })).toBe("guest");
    expect(pointFor(ok, { c: 1, ms: 50 }, { c: 1, ms: 50 })).toBe("both");
  });
  it("a fast wrong answer doesn't beat a slow right one", () => {
    expect(pointFor(ok, { c: 0, ms: 100 }, { c: 1, ms: 9000 })).toBe("guest");
    expect(pointFor(ok, { c: -1, ms: ROUND_MS }, { c: 2, ms: 10 })).toBeNull();
    expect(pointFor(ok)).toBeNull();
  });
  it("adds rounds up", () => {
    expect(
      tally([
        { ok, host: { c: 1, ms: 1 }, guest: { c: 1, ms: 2 } },
        { ok, host: { c: 1, ms: 5 }, guest: { c: 1, ms: 5 } },
        { ok, host: { c: 0, ms: 5 } },
      ]),
    ).toEqual({ host: 2, guest: 1 });
  });
});

describe("parseDuo", () => {
  it("accepts the protocol", () => {
    expect(parseDuo('{"t":"a","i":3,"c":1,"ms":1500}')).toEqual({ t: "a", i: 3, c: 1, ms: 1500 });
    expect(parseDuo('{"t":"ready","sig":"0a1b2c3d","n":12}')).toEqual({ t: "ready", sig: "0a1b2c3d", n: 12 });
    expect(parseDuo('{"t":"start","seed":4294967295,"count":10}')).not.toBeNull();
    expect(parseDuo('{"t":"mute","on":true}')).toEqual({ t: "mute", on: true });
    expect(parseDuo('{"t":"bye","extra":1}')).toEqual({ t: "bye" });
  });
  it("refuses out-of-range and unknown messages", () => {
    expect(parseDuo('{"t":"a","i":10,"c":1,"ms":1}')).toBeNull();
    expect(parseDuo('{"t":"a","i":1,"c":1.5,"ms":1}')).toBeNull();
    expect(parseDuo('{"t":"a","i":1,"c":1,"ms":-1}')).toBeNull();
    expect(parseDuo('{"t":"start","seed":1,"count":0}')).toBeNull();
    expect(parseDuo('{"t":"ready","sig":"<b>","n":1}')).toBeNull();
    expect(parseDuo('{"t":"html","x":"<img>"}')).toBeNull();
    expect(parseDuo("nope")).toBeNull();
    expect(parseDuo("x".repeat(600))).toBeNull();
  });
});

describe("parseHash", () => {
  const code = "vedvuqumnq46gl4agrlijn2w";
  it("reads the guest link and the creator's link", () => {
    expect(parseHash(`#${code}`)).toEqual({ code, key: null });
    expect(parseHash(`#${code}~${"a".repeat(32)}`)).toEqual({ code, key: "a".repeat(32) });
  });
  it("refuses anything else", () => {
    expect(parseHash("")).toBeNull();
    expect(parseHash("#short")).toBeNull();
    expect(parseHash(`#${code}~bad`)).toBeNull();
  });
});

describe("helpers", () => {
  it("fnv1a is the standard 32-bit hash", () => {
    expect(fnv1a("")).toBe("811c9dc5");
    expect(fnv1a("a")).toBe("e40c292c");
  });
  it("dayIndex is stable per day and in range", () => {
    expect(dayIndex("2026-10-19", 7)).toBe(dayIndex("2026-10-19", 7));
    expect(dayIndex("2026-10-19", 7)).toBeLessThan(7);
    expect(dayIndex("2026-10-19", 0)).toBe(0);
  });
});
