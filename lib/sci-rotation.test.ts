import { describe, expect, it } from "vitest";
import { parseFamille, simulerParcelle } from "./sci-rotation";

describe("sci-rotation", () => {
  it("legumes raise nitrogen, demanding crops draw it", () => {
    const s = simulerParcelle([
      "legumineuses",
      "feuilles",
      "fruits",
      "racines",
    ]);
    expect(s.map((x) => x.azoteApres)).toEqual([8, 6, 4, 3]);
    expect(s.some((x) => x.repetition)).toBe(false);
  });
  it("flags repeats, short returns and shortages", () => {
    const s = simulerParcelle(["fruits", "fruits", "feuilles", "fruits"]);
    expect(s[1].repetition).toBe(true);
    expect(s[3].retourRapide).toBe(true);
    expect(s[2].carence).toBe(true);
    expect(s[3].azoteApres).toBe(0);
  });
  it("green manure is never flagged, fallow keeps the score", () => {
    const s = simulerParcelle(["engrais-vert", "engrais-vert", null]);
    expect(s[1].repetition).toBe(false);
    expect(s[2].azoteApres).toBe(10);
  });
  it("parses names", () => {
    expect(parseFamille("Légumineuses")).toBe("legumineuses");
    expect(parseFamille("solanacées")).toBe("fruits");
    expect(parseFamille("engrais vert")).toBe("engrais-vert");
    expect(parseFamille("")).toBeNull();
  });
});
