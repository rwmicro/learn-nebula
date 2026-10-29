import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PATH_FAMILIES } from "./path-family";
import { ERAGNY, paintingFor } from "./paintings";

describe("paintingFor", () => {
  it("has both image files for every family", () => {
    for (const f of PATH_FAMILIES) {
      const p = paintingFor(f);
      for (const ext of ["avif", "webp"]) expect(existsSync(`public${p.src}.${ext}`), `${f}.${ext}`).toBe(true);
      expect(p.credit).not.toBe("");
    }
  });
  it("prefers the discipline's own painting", () => {
    for (const slug of ["applied-sciences/biology/cellule", "social-sciences/economy/offre"]) {
      const p = paintingFor("vivant", slug);
      expect(p.src).not.toBe("/images/disciplines/vivant");
      for (const ext of ["avif", "webp"]) expect(existsSync(`public${p.src}.${ext}`), `${slug}.${ext}`).toBe(true);
    }
    expect(paintingFor("vivant", "applied-sciences/medicine/x").src).toBe("/images/disciplines/vivant");
  });
  it("falls back to Pissarro's garden", () => {
    expect(paintingFor(null)).toBe(ERAGNY);
    expect(paintingFor(undefined)).toBe(ERAGNY);
  });
});
