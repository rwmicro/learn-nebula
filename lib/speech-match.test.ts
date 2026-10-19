import { describe, expect, it } from "vitest";
import { editDistance, expectedForms, matchSpoken, normaliseSpoken, speechLangFor, tolerance } from "./speech-match";

describe("normaliseSpoken", () => {
  it("folds case, accents and punctuation", () => {
    expect(normaliseSpoken("¡Buenos días!")).toBe("buenos dias");
    expect(normaliseSpoken("Çok güzel.")).toBe("cok guzel");
  });
  it("drops Arabic harakat and keeps the letters", () => {
    expect(normaliseSpoken("مَرْحَبًا")).toBe("مرحبا");
  });
  it("keeps CJK", () => {
    expect(normaliseSpoken("你好！")).toBe("你好");
  });
});

describe("editDistance / tolerance", () => {
  it("counts edits", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("你好", "你们好")).toBe(1);
  });
  it("forgives nothing on short words, a little on long ones", () => {
    expect(tolerance(3)).toBe(0);
    expect(tolerance(5)).toBe(1);
    expect(tolerance(10)).toBe(2);
    expect(tolerance(40)).toBe(3);
  });
});

describe("expectedForms", () => {
  it("splits alternatives and drops glosses", () => {
    expect(expectedForms("Guten Tag (bonjour)")).toEqual(["guten tag"]);
    expect(expectedForms("hola / buenas")).toEqual(["hola", "buenas"]);
  });
});

describe("matchSpoken", () => {
  it("accepts the word, any alternative, accents aside", () => {
    expect(matchSpoken(["Danke schön"], "danke schon")).toEqual({ ok: true, heard: "Danke schön" });
    expect(matchSpoken(["thank you", "teşekkürler"], "Teşekkürler")).toMatchObject({ ok: true, heard: "teşekkürler" });
  });
  it("tolerates a near miss on a long word, not on a short one", () => {
    expect(matchSpoken(["Entschuldigun"], "Entschuldigung").ok).toBe(true);
    expect(matchSpoken(["bot"], "rot").ok).toBe(false);
  });
  it("finds the word inside a longer phrase", () => {
    expect(matchSpoken(["ja guten Tag"], "Guten Tag").ok).toBe(true);
  });
  it("ignores spacing differences", () => {
    expect(matchSpoken(["selamat pagi"], "selamatpagi").ok).toBe(true);
  });
  it("reports the closest alternative when nothing matches", () => {
    expect(matchSpoken(["house", "haus maus"], "Hund")).toMatchObject({ ok: false });
    expect(matchSpoken([], "Hund")).toEqual({ ok: false, heard: "" });
  });
});

describe("speechLangFor", () => {
  it("reads the language folder from a vault clip", () => {
    expect(speechLangFor("/vault/Social%20Sciences/Languages%20-%20Dialects/Indon%C3%A9sien/audio/x.mp3")).toBe("id-ID");
  });
  it("reads it from a note URL or a deck slug", () => {
    expect(speechLangFor("/clip.mp3", "/posts/social-sciences/languages-dialects/turc/salutations/")).toBe("tr-TR");
    expect(speechLangFor("/anki/social-sciences-languages-dialects-allemand-vocabulaire/a.mp3")).toBe("de-DE");
  });
  it("has nothing for languages without a recogniser, or outside the folder", () => {
    expect(speechLangFor("/posts/social-sciences/languages-dialects/darija/x/")).toBeNull();
    expect(speechLangFor("/posts/history/anglais/x/")).toBeNull();
    expect(speechLangFor("")).toBeNull();
  });
});
