import { describe, it, expect } from "vitest";
import { alternatives, diff, fold, isMatch } from "./typed-answer";

describe("typed answers", () => {
  it("ignores case, accents, harakat, punctuation and spacing", () => {
    expect(fold("  Élève, l’école ! ")).toBe("elevelecole");
    expect(isMatch("eleve", "Élève")).toBe(true);
    expect(isMatch("مَرْحَبًا", "مرحبا")).toBe(true);
    expect(isMatch("مرحبا", "مَرْحَبًا")).toBe(true);
    expect(isMatch("bonjour", "bonsoir")).toBe(false);
    expect(isMatch("", "x")).toBe(false);
  });

  it("accepts any listed alternative", () => {
    expect(alternatives("maison, demeure")).toEqual(["maison, demeure", "maison", "demeure"]);
    expect(isMatch("demeure", "maison, demeure")).toBe(true);
    expect(isMatch("house", "house / home")).toBe(true);
    expect(isMatch("to run", "to run (verb)")).toBe(true);
  });

  it("marks extra typed characters and missing expected ones", () => {
    const d = diff("chatt", "chat");
    expect(d.typed.map((s) => [s.text, s.ok])).toEqual([
      ["chat", true],
      ["t", false],
    ]);
    expect(d.expected.every((s) => s.ok)).toBe(true);
    const m = diff("mison", "maison");
    expect(m.expected.map((s) => [s.text, s.ok])).toEqual([
      ["m", true],
      ["a", false],
      ["ison", true],
    ]);
  });

  it("diffs against the closest alternative", () => {
    const d = diff("demere", "maison, demeure");
    expect(d.expected.map((s) => s.text).join("")).toBe("demeure");
  });
});
