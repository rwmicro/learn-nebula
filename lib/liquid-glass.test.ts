import { describe, expect, it } from "vitest";
import { backdropRefraction, lensMap } from "./liquid-glass";

const at = (m: Uint8ClampedArray, w: number, x: number, y: number) => {
  const i = (y * w + x) * 4;
  return [m[i], m[i + 1], m[i + 2], m[i + 3]];
};

describe("lensMap", () => {
  const w = 120;
  const h = 40;
  const m = lensMap(w, h, 20, 12);

  it("leaves the middle alone", () => {
    expect(at(m, w, 60, 20)).toEqual([128, 128, 128, 255]);
  });

  it("points inward along the rim", () => {
    expect(at(m, w, 0, 20)[0]).toBeGreaterThan(200); // left edge: shift right
    expect(at(m, w, w - 1, 20)[0]).toBeLessThan(56); // right edge: shift left
    expect(at(m, w, 60, 0)[1]).toBeGreaterThan(200); // top: shift down
    expect(at(m, w, 60, h - 1)[1]).toBeLessThan(56); // bottom: shift up
    expect(at(m, w, 60, 0)[0]).toBe(128); // no sideways shift mid-edge
  });

  it("is mirror-symmetric", () => {
    for (const [x, y] of [[3, 5], [17, 2], [40, 9]]) {
      const [r, g] = at(m, w, x, y);
      const [r2, g2] = at(m, w, w - 1 - x, h - 1 - y);
      expect(r + r2).toBe(256);
      expect(g + g2).toBe(256);
    }
  });

  it("handles odd sizes and a radius larger than the shape", () => {
    const o = lensMap(7, 5, 50, 2);
    expect(o.length).toBe(7 * 5 * 4);
    expect(at(o, 7, 3, 2)).toEqual([128, 128, 128, 255]);
  });
});

describe("backdropRefraction", () => {
  const nav = (ua: string, brands?: string[]) =>
    ({ userAgent: ua, ...(brands ? { userAgentData: { brands: brands.map((brand) => ({ brand })) } } : {}) }) as unknown as Navigator;

  it("is Chromium only", () => {
    expect(backdropRefraction(nav("x", ["Chromium", "Google Chrome"]))).toBe(true);
    expect(backdropRefraction(nav("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36"))).toBe(true);
    expect(backdropRefraction(nav("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"))).toBe(false);
    expect(backdropRefraction(nav("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/131.0 Mobile/15E148 Safari/604.1"))).toBe(false);
    expect(backdropRefraction(nav("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"))).toBe(false);
    expect(backdropRefraction(undefined)).toBe(false);
  });
});
