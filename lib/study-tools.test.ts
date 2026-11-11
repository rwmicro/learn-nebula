import { describe, expect, it } from "vitest";
import {
  addCalibration,
  calibrationSummary,
  clozeOf,
  keyWords,
  parseCalibration,
  parseStudy,
  recallCoverage,
  toReread,
} from "./study-tools";

describe("self-check", () => {
  it("keeps only valid answers and lists what to read again", () => {
    const s = parseStudy(JSON.stringify({ check: { a: "sait", b: "doute", c: "non", d: "peut-être" } }));
    expect(s.check).toEqual({ a: "sait", b: "doute", c: "non" });
    expect(toReread(s, ["a", "b", "c", "d"])).toEqual(["b", "c"]);
    expect(parseStudy("not json").check).toEqual({});
  });
});

describe("free recall", () => {
  it("finds the sections a text touches, by key word or shared stem", () => {
    expect(keyWords("Les causes de la Révolution")).toEqual(["causes", "revolution"]);
    const cov = recallCoverage("La Terre est inclinée, et la révolution autour du Soleil…", [
      "L’inclinaison de l’axe",
      "Révolution et saisons",
      "Les éclipses",
      "Et",
    ]);
    expect(cov).toEqual([true, true, false, false]);
  });
});

describe("cloze", () => {
  it("blanks the highlighted words in their sentence", () => {
    expect(clozeOf("La mitochondrie produit l’ATP de la cellule.", "l’ATP")).toBe(
      "La mitochondrie produit […] de la cellule.",
    );
    expect(clozeOf("Court.", "Court.")).toBeNull();
    expect(clozeOf("Une phrase.", "absent")).toBeNull();
  });
});

describe("calibration", () => {
  it("counts right answers when sure and when hesitant", () => {
    let l = parseCalibration("[]");
    l = addCalibration(l, { sure: true, ok: true, d: "2026-11-10" });
    l = addCalibration(l, { sure: true, ok: false, d: "2026-11-10" });
    l = addCalibration(l, { sure: false, ok: true, d: "2026-11-10" });
    expect(calibrationSummary(l)).toEqual({ sure: { n: 2, ok: 1 }, unsure: { n: 1, ok: 1 } });
    expect(parseCalibration('[{"sure":1}]')).toEqual([]);
  });
});
