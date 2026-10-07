import { describe, it, expect } from "vitest";
import { t, getMessages, LOCALES, DEFAULT_LOCALE, disciplineKey, folderKey } from "./i18n";

describe("t (translator)", () => {
  it("resolves a nested key in the default locale", () => {
    expect(t("nav.home")).toBe("Accueil");
  });

  it("resolves a nested key in an explicit locale", () => {
    expect(t("nav.home", undefined, "en")).toBe("Home");
    expect(t("nav.home", undefined, "zh")).toBe("首页");
  });

  it("falls back to the default locale, then to the key itself", () => {
    // Unknown keys come back verbatim so a missing translation is visible, not blank.
    expect(t("does.not.exist")).toBe("does.not.exist");
    expect(t("totally-unknown", undefined, "en")).toBe("totally-unknown");
  });

  it("interpolates {vars}", () => {
    expect(t("noteActions.readingTimeFormat", { min: 7 })).toBe("7 min de lecture");
    expect(t("footer.copyright", { year: 2026, author: "X" })).toBe(
      "Copyright 2026 · X",
    );
  });

  it("leaves placeholders intact when no vars are passed", () => {
    expect(t("siblings.moreIn")).toBe("Plus dans {folder}");
  });

  it("blanks a placeholder that has no matching var rather than throwing", () => {
    expect(t("siblings.moreIn", {})).toBe("Plus dans ");
  });
});

describe("message bundles", () => {
  it("exposes a bundle for every declared locale", () => {
    for (const loc of LOCALES) {
      expect(typeof getMessages(loc)).toBe("object");
      expect(getMessages(loc).nav).toBeTruthy();
    }
  });

  it("keeps the two top-level grands thèmes translated in every locale", () => {
    // Guards the #2 fix: nav.appliedsciences / nav.socialsciences must exist
    // in all locales (HomeContent localises the folder headings via these).
    for (const loc of LOCALES) {
      expect(t("nav.appliedsciences", undefined, loc)).not.toBe("nav.appliedsciences");
      expect(t("nav.socialsciences", undefined, loc)).not.toBe("nav.socialsciences");
      expect(t("home.searchPlaceholder", undefined, loc)).not.toBe("home.searchPlaceholder");
    }
  });

  it("maps discipline folder names to their discipline.* keys", () => {
    expect(disciplineKey("Philosophy")).toBe("discipline.philosophy");
    expect(disciplineKey("Languages & Dialects")).toBe("discipline.languagesdialects");
    expect(disciplineKey("Échecs")).toBe("discipline.echecs");
    expect(disciplineKey("Nowhere")).toBeNull();
    expect(disciplineKey("")).toBeNull();
    expect(t("discipline.philosophy")).toBe("Philosophie");
  });

  it("maps breadcrumb folders to a key, top groups included", () => {
    expect(folderKey("Social Sciences")).toBe("nav.socialsciences");
    expect(folderKey("Applied Sciences")).toBe("nav.appliedsciences");
    expect(folderKey("Philosophy")).toBe("discipline.philosophy");
    expect(folderKey("Philosophes")).toBeNull();
  });

  it("defaults to French", () => {
    expect(DEFAULT_LOCALE).toBe("fr");
  });
});
