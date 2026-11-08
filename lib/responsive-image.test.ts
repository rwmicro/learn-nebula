import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import sharp from "sharp";
import { fullWidth, srcSet } from "./responsive-image";

const ORIGINALS = [
  "/images/eragny",
  ...readdirSync("public/images/disciplines")
    .filter((f) => f.endsWith(".webp") && !/-\d+w\.webp$/.test(f))
    .map((f) => `/images/disciplines/${f.slice(0, -5)}`),
];

describe("srcSet", () => {
  it("lists the smaller copies, then the original at its own width", () => {
    expect(srcSet("/images/eragny", "avif")).toBe(
      "/images/eragny-320w.avif 320w, /images/eragny-640w.avif 640w, /images/eragny-1024w.avif 1024w, /images/eragny.avif 1200w",
    );
  });

  it("knows the real width of every picture", async () => {
    for (const src of ORIGINALS) {
      for (const ext of ["avif", "webp"]) {
        if (!existsSync(`public${src}.${ext}`)) continue;
        const { width } = await sharp(`public${src}.${ext}`).metadata();
        expect(width, `${src}.${ext}`).toBe(fullWidth(src));
      }
    }
  });
});
