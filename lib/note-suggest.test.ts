import { describe, it, expect } from "vitest";
import { normalize, pathTerms, suggestNotes, type NoteIndexEntry } from "./note-suggest";

const NOTES: NoteIndexEntry[] = [
  { title: "Permaculture", href: "/posts/applied-sciences/agriculture/permaculture/" },
  { title: "Économie politique", href: "/posts/social-sciences/economics/economie-politique/" },
  { title: "Révolution française", href: "/posts/social-sciences/history/revolution-francaise/" },
  { title: "Révolution industrielle", href: "/posts/social-sciences/history/revolution-industrielle/" },
  { title: "Agroforesterie", href: "/posts/applied-sciences/agriculture/agroforesterie/" },
];

describe("normalize", () => {
  it("strips accents, case and punctuation", () => {
    expect(normalize("Économie_Politique (2e éd.)")).toBe("economie politique 2e ed");
  });
});

describe("pathTerms", () => {
  it("splits the decoded note segment from its folder, minus path noise", () => {
    expect(pathTerms("/posts/a/b/Histoire/R%C3%A9volution-Fran%C3%A7aise/")).toEqual({
      leaf: ["revolution", "francaise"],
      folder: ["histoire"],
    });
    expect(pathTerms("/posts/permaculture/index.html")).toEqual({
      leaf: ["permaculture"],
      folder: [],
    });
    expect(pathTerms("/posts/index.html").leaf).toEqual([]);
  });
});

describe("suggestNotes", () => {
  it("finds a note that moved folder by its exact slug first", () => {
    expect(suggestNotes("/posts/old/permaculture/", NOTES)[0].title).toBe("Permaculture");
  });

  it("is accent-insensitive and tolerates a one-letter typo", () => {
    const got = suggestNotes("/posts/historie/revolution-francaize/", NOTES).map((n) => n.title);
    expect(got[0]).toBe("Révolution française");
    expect(got).toContain("Révolution industrielle");
  });

  it("matches on a word prefix", () => {
    expect(suggestNotes("/agrofor", NOTES).map((n) => n.title)).toEqual(["Agroforesterie"]);
  });

  it("returns nothing for an unrelated path, and caps the list", () => {
    expect(suggestNotes("/zzz-qqq/", NOTES)).toEqual([]);
    expect(suggestNotes("/revolution/", NOTES, 1)).toHaveLength(1);
  });
});
