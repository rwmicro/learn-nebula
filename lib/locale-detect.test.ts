import { describe, it, expect } from "vitest";
import { detectLocale, isAutomatedBrowser } from "./locale-detect";
import { LOCALES, DEFAULT_LOCALE } from "./i18n";

// The <head> bootstrap inlines the function's source: run that copy too, so a
// helper or import added outside its body fails here, not in readers' browsers.
const fromSource = new Function(`return (${detectLocale.toString()})`)() as typeof detectLocale;

const CASES: [string, (string | null | undefined)[], string][] = [
  // One language per supported locale, plain and with a region.
  ["French", ["fr"], "fr"],
  ["French from Canada", ["fr-CA"], "fr"],
  ["English (US)", ["en-US", "en"], "en"],
  ["English (UK)", ["en-GB"], "en"],
  ["Spanish (Spain)", ["es-ES"], "es"],
  ["Spanish (Latin America)", ["es-419"], "es"],
  ["Mandarin, simplified", ["zh-CN"], "zh"],
  ["Mandarin, traditional with a script", ["zh-Hant-TW"], "zh"],
  ["Cantonese", ["yue-HK"], "zh"],
  ["Arabic (Morocco)", ["ar-MA"], "ar"],
  ["Egyptian Arabic", ["arz-EG"], "ar"],
  ["Indonesian", ["id-ID"], "id"],
  ["Indonesian, old Android code", ["in-ID"], "id"],
  // Case, underscores, extensions.
  ["upper case", ["EN-us"], "en"],
  ["underscore (Java/Android style)", ["es_MX"], "es"],
  ["Unicode extension", ["ar-SA-u-nu-latn"], "ar"],
  // Order of preference.
  ["first supported wins", ["de-DE", "es-ES", "en-US"], "es"],
  ["French after English", ["en-US", "fr-FR"], "en"],
  ["a listed language beats a country", ["jv-ID", "en-US"], "en"],
  // No language the site has: the country decides.
  ["Javanese in Indonesia", ["jv-ID"], "id"],
  ["Sundanese in Indonesia", ["su-ID"], "id"],
  ["Catalan in Spain", ["ca-ES"], "es"],
  ["Basque in Spain", ["eu-ES"], "es"],
  ["Breton in France", ["br-FR"], "fr"],
  ["Kabyle in Algeria", ["kab-DZ"], "ar"],
  ["Uyghur in China", ["ug-CN"], "zh"],
  ["Welsh in the UK", ["cy-GB"], "en"],
  ["Hindi in India", ["hi-IN"], "en"],
  // Nothing to go on: the default.
  ["German", ["de-DE", "de"], DEFAULT_LOCALE],
  ["Japanese", ["ja-JP"], DEFAULT_LOCALE],
  ["Dutch in Belgium (split country)", ["nl-BE"], DEFAULT_LOCALE],
  ["German in Switzerland (split country)", ["de-CH"], DEFAULT_LOCALE],
  ["English-less Canada stays a guess", ["iu-CA"], DEFAULT_LOCALE],
  ["empty list", [], DEFAULT_LOCALE],
  ["junk", ["", "*", "123", null, undefined, "x-klingon"], DEFAULT_LOCALE],
  ["junk then a language", ["*", "en"], "en"],
];

describe("detectLocale", () => {
  for (const [name, langs, want] of CASES) {
    it(`${name}: ${JSON.stringify(langs)} → ${want}`, () => {
      expect(detectLocale(langs, LOCALES, DEFAULT_LOCALE)).toBe(want);
      expect(fromSource(langs, LOCALES, DEFAULT_LOCALE)).toBe(want);
    });
  }

  it("accepts a missing list (no navigator.languages)", () => {
    expect(detectLocale(undefined, LOCALES, "fr")).toBe("fr");
    expect(detectLocale(null, LOCALES, "fr")).toBe("fr");
  });

  it("only returns a locale the site ships", () => {
    // A country's language that this build lacks falls through to the next.
    expect(detectLocale(["jv-ID", "ca-ES"], ["fr", "es"], "fr")).toBe("es");
    expect(detectLocale(["id-ID"], ["fr", "en"], "fr")).toBe("fr");
  });

  it("covers every supported locale", () => {
    const reached = new Set(CASES.map((c) => c[2]));
    for (const l of LOCALES) expect(reached.has(l)).toBe(true);
  });
});

describe("isAutomatedBrowser", () => {
  const CHROME = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  it("lets readers' browsers through", () => {
    expect(isAutomatedBrowser({ userAgent: CHROME })).toBe(false);
    expect(
      isAutomatedBrowser({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        webdriver: false,
      }),
    ).toBe(false);
  });
  it("stops crawlers and automation", () => {
    expect(isAutomatedBrowser({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" })).toBe(true);
    expect(isAutomatedBrowser({ userAgent: "Mozilla/5.0 (compatible; bingbot/2.0)" })).toBe(true);
    expect(isAutomatedBrowser({ userAgent: CHROME.replace("Chrome/", "HeadlessChrome/") })).toBe(true);
    expect(isAutomatedBrowser({ userAgent: CHROME, webdriver: true })).toBe(true);
  });
});
