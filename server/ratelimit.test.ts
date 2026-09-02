import { describe, it, expect } from "vitest";
import { Quota, Cooldown, InFlight } from "./ratelimit";

describe("Quota", () => {
  it("caps at max per window, per key", () => {
    const q = new Quota(2, 60_000);
    expect(q.exceeded("a")).toBe(false);
    expect(q.exceeded("a")).toBe(false);
    expect(q.exceeded("a")).toBe(true); // 3rd over the cap of 2
    expect(q.exceeded("b")).toBe(false); // independent key
  });
});

describe("Cooldown", () => {
  it("blocks a second hit within the window", () => {
    const c = new Cooldown(60);
    expect(c.limited("x")).toBe(false);
    expect(c.limited("x")).toBe(true);
    expect(c.limited("y")).toBe(false);
  });
});

describe("InFlight", () => {
  it("tracks membership", () => {
    const f = new InFlight();
    expect(f.has("x")).toBe(false);
    f.add("x");
    expect(f.has("x")).toBe(true);
    f.delete("x");
    expect(f.has("x")).toBe(false);
  });
});
