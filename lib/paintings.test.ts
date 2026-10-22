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
  it("falls back to Pissarro's garden", () => {
    expect(paintingFor(null)).toBe(ERAGNY);
    expect(paintingFor(undefined)).toBe(ERAGNY);
  });
});
