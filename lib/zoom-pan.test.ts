import { describe, it, expect } from "vitest";
import { centreOn, clampView, fitScale, fits, openingScale, reveal, zoomAt, MAX_SCALE } from "./zoom-pan";

const box = { vw: 400, vh: 300, cw: 800, ch: 300 };

describe("zoom-pan", () => {
  it("knows when the content fits", () => {
    expect(fits({ vw: 400, vh: 300, cw: 380, ch: 300 })).toBe(true);
    expect(fits(box)).toBe(false);
    expect(fitScale(box)).toBe(0.5);
  });
  it("clamps scale and keeps the content over the viewport", () => {
    expect(clampView({ s: 0.1, x: 0, y: 0 }, box).s).toBe(0.5);
    expect(clampView({ s: 9, x: 0, y: 0 }, box).s).toBe(MAX_SCALE);
    // At scale 1 the 800px content can pan between -400 and 0.
    expect(clampView({ s: 1, x: 50, y: 0 }, box).x).toBe(0);
    expect(clampView({ s: 1, x: -900, y: 0 }, box).x).toBe(-400);
    // At fit it is centred vertically (150px tall in a 300px viewport).
    expect(clampView({ s: 0.5, x: 0, y: 0 }, box)).toEqual({ s: 0.5, x: 0, y: 75 });
  });
  it("zooms around the pointer", () => {
    const v = zoomAt({ s: 1, x: -200, y: 0 }, 2, 200, 150, box);
    // The content point under (200, 150) was (400, 150); it stays there.
    expect(v.s).toBe(2);
    expect((200 - v.x) / v.s).toBeCloseTo(400);
    expect((150 - v.y) / v.s).toBeCloseTo(150);
  });
  it("centres on a point and pans a rectangle into view", () => {
    expect(centreOn(600, 150, 1, box)).toEqual({ s: 1, x: -400, y: 0 });
    const v = reveal({ s: 1, x: 0, y: 0 }, { x: 500, y: 10, w: 100, h: 40 }, box, 10);
    expect(v.x).toBe(-210);
  });

  it("opens at the full width when that is a modest zoom-out", () => {
    expect(openingScale({ vw: 1200, vh: 700, cw: 1600, ch: 3000 })).toBeCloseTo(0.75);
    expect(openingScale({ vw: 1200, vh: 700, cw: 3600, ch: 900 })).toBe(1);
    expect(openingScale({ vw: 1200, vh: 700, cw: 800, ch: 3000 })).toBe(1);
  });
});
