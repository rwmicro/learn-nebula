import { describe, it, expect } from "vitest";
import { tagLabel } from "./tag-label";

describe("tagLabel", () => {
  it("turns a slug-like tag into words, capitalised", () => {
    expect(tagLabel("arabe-libanais")).toBe("Arabe libanais");
    expect(tagLabel("philosophie")).toBe("Philosophie");
    expect(tagLabel("living-off-the-land")).toBe("Living off the land");
  });
  it("writes centuries in Roman capitals", () => {
    expect(tagLabel("xxe-siècle")).toBe("XXe siècle");
    expect(tagLabel("XIXe-siècle")).toBe("XIXe siècle");
  });
  it("spells acronyms in capitals", () => {
    expect(tagLabel("osint")).toBe("OSINT");
    expect(tagLabel("incident-response")).toBe("Incident response");
    expect(tagLabel("IA")).toBe("IA");
  });
  it("keeps names already written by hand", () => {
    expect(tagLabel("Kant")).toBe("Kant");
    expect(tagLabel("Seconde Guerre mondiale")).toBe("Seconde Guerre mondiale");
  });
  it("uses the spelled-out list where no rule fits", () => {
    expect(tagLabel("seconde-guerre-mondiale")).toBe("Seconde Guerre mondiale");
    expect(tagLabel("moyen-âge")).toBe("Moyen Âge");
    expect(tagLabel("lévi-strauss")).toBe("Lévi-Strauss");
  });
});
