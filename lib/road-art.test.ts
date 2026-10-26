import { describe, expect, it } from "vitest";
import { ART, FAMILY_ART, artStrip, levelArt } from "./road-art";
import { PATH_FAMILIES } from "./path-family";

describe("road art", () => {
  it("has a set for every family, made of known drawings", () => {
    for (const f of PATH_FAMILIES) {
      expect(FAMILY_ART[f].length).toBeGreaterThan(2);
      for (const k of FAMILY_ART[f]) expect(ART[k]).toMatch(/^<svg viewBox="[\d. ]+">/);
    }
  });
  it("picks the level's era, then the path's subject, then the family's set", () => {
    expect(levelArt("Histoire", "Antiquité et france", "pensee")[0]).toBe("pyramid");
    expect(levelArt("Histoire", "Révolutions et industrie", "pensee")[0]).toBe("windmill");
    expect(levelArt("Indonésien", "Les sons et l'alphabet", "langues")).toContain("volcano");
    expect(levelArt("Biologie", "La cellule", "vivant")).toBe(FAMILY_ART.vivant);
    expect(levelArt("Divers", "Niveau", null)).toBe(FAMILY_ART.vivant);
    expect(levelArt("Musique", "Périodes", "arts", "Music")[0]).toBe("note");
    expect(levelArt("Philosophie", "Thomas d'Aquin (1225-1274)", "pensee", "Philosophy")).toContain("candle");
    expect(levelArt("Philosophie", "Emmanuel Kant (1724-1804)", "pensee", "Philosophy")).toContain("glasses");
    expect(levelArt("Philosophie", "Platon (-428--348)", "pensee", "Philosophy")[0]).toBe("temple");
    // An era in the path's name doesn't theme its other levels.
    expect(levelArt("Philosophie : de l'Antiquité aux modernes", "Les présocratiques", "pensee")).toBe(FAMILY_ART.pensee);
    expect(levelArt("Histoire", "WW2 et XXe siècle", "pensee")[0]).toBe("train");
    expect(levelArt("Chimie", "Composés aromatiques", "sciences")).toBe(FAMILY_ART.sciences);
  });
  it("lays a strip of up to four drawings", () => {
    const s = artStrip(["pyramid", "temple", "amphora", "palm", "scroll"]);
    expect(s.match(/<svg x=/g)).toHaveLength(4);
    expect(s).toMatch(/^<svg viewBox="0 0 390 110"/);
  });
});
