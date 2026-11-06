import { describe, expect, it } from "vitest";
import { LIGHT_REST, LIGHT_STEPS, backdropRefraction, lensMap, lightStep, pointerLight, specularMap, stepAngle, tiltLight } from "./liquid-glass";

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

describe("specularMap", () => {
  const w = 120;
  const h = 40;
  const m = specularMap(w, h, 20, 16, 2);
  const W = w * 2;
  const alpha = (x: number, y: number) => at(m, W, x, y)[3];

  it("is drawn at the given density", () => {
    expect(m.length).toBe(W * h * 2 * 4);
  });

  it("leaves the middle clear", () => {
    expect(alpha(W / 2, h)).toBe(0);
  });

  it("lights the rim facing the light more than the one facing away", () => {
    // Light from the top left: the top edge shines, the bottom one less.
    const top = alpha(W / 2 - 40, 1);
    const bottom = alpha(W / 2 - 40, h * 2 - 2);
    expect(top).toBeGreaterThan(150);
    expect(bottom).toBeGreaterThan(0);
    expect(top).toBeGreaterThan(bottom);
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

describe("moving light", () => {
  it("rests at the top left", () => {
    expect(tiltLight(0, 0)).toBeCloseTo(LIGHT_REST);
    expect(lightStep(tiltLight(0, 0))).toBe(lightStep(LIGHT_REST));
  });

  it("slides against the tilt", () => {
    // Tilted right: the light moves left, towards -π.
    expect(Math.cos(tiltLight(20, 0))).toBeLessThan(Math.cos(LIGHT_REST));
    // Tilted left: towards the top.
    expect(Math.cos(tiltLight(-20, 0))).toBeGreaterThan(Math.cos(LIGHT_REST));
  });

  it("leans to the pointer's side", () => {
    expect(Math.cos(pointerLight(300, 0))).toBeGreaterThan(0); // pointer right: lit from the right
    expect(Math.sin(pointerLight(0, -300))).toBeLessThan(-0.9); // pointer above: lit from above
    expect(pointerLight(0, 0)).toBe(LIGHT_REST);
  });

  it("rounds a direction to a step and back", () => {
    for (let s = 0; s < LIGHT_STEPS; s++) expect(lightStep(stepAngle(s))).toBe(s);
    expect(lightStep(-Math.PI / 2)).toBe((LIGHT_STEPS * 3) / 4);
    expect(lightStep(2 * Math.PI)).toBe(0);
  });

  it("lights the rim on the light's side", () => {
    const w = 120;
    const h = 40;
    const right = specularMap(w, h, 20, 16, 1, 0);
    const left = specularMap(w, h, 20, 16, 1, Math.PI);
    expect(at(right, w, w - 2, 20)[3]).toBeGreaterThan(at(left, w, w - 2, 20)[3]);
  });
});
