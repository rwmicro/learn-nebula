import { describe, it, expect } from "vitest";
import { getLanguageScopes, groupByFolder } from "./content";

// content/posts is fetched at build time (scripts/fetch-notes.mjs) and is NOT
// present in the unit-test CI job, so this asserts the contract in both states:
// an empty list when the vault is absent, well-formed options when it isn't.
describe("getLanguageScopes", () => {
  const scopes = getLanguageScopes();

  it("returns an array without throwing on a missing vault", () => {
    expect(Array.isArray(scopes)).toBe(true);
  });

  it("yields slug paths the server's scopePrefix() will accept", () => {
    for (const s of scopes) {
      expect(s.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/);
      expect(s.label.trim()).not.toBe("");
    }
  });

  it("has no duplicate slugs and is cached", () => {
    expect(new Set(scopes.map((s) => s.slug)).size).toBe(scopes.length);
    expect(getLanguageScopes()).toBe(scopes);
  });
});

describe("groupByFolder", () => {
  const note = (title: string) => ({ title, href: `/posts/${title}/`, discipline: "" });
  it("puts a folder's own notes first, then its sub-folders in natural order", () => {
    const groups = groupByFolder([
      { path: ["Security", "Web"], note: note("b") },
      { path: [], note: note("z") },
      { path: ["Security"], note: note("a") },
      { path: ["Algorithmique"], note: note("c") },
      { path: ["Security", "Certifications", "LFCS"], note: note("d") },
      { path: ["Security", "Web"], note: note("a2") },
    ]);
    expect(groups.map((g) => g.path.join("/"))).toEqual([
      "",
      "Algorithmique",
      "Security",
      "Security/Certifications/LFCS",
      "Security/Web",
    ]);
    expect(groups.at(-1)!.notes.map((n) => n.title)).toEqual(["a2", "b"]);
  });
});
