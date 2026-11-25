// The site's language on a first visit follows the reader's browser/system
// (navigator.languages, the same list as Accept-Language, then the system
// locale), and a language the reader picked always wins. The rules themselves
// (variants, countries, fallback) are unit-tested in lib/locale-detect.test.ts;
// this checks the wiring in a real page: the <head> bootstrap loads the right
// bundle, public/js/i18n.js applies it, nothing gets stored behind the
// reader's back, and crawlers keep French.
import fs from "node:fs";
import { test, expect } from "@playwright/test";

const SKIP = Object.fromEntries(
  ["fr", "en", "es", "zh", "ar", "id"].map((l) => [
    l,
    JSON.parse(fs.readFileSync(`messages/${l}.json`, "utf8")).layout.skipLink,
  ]),
);

/** Playwright drives the browser, so navigator.webdriver is true and the site
 *  treats it like a crawler. Readers' browsers say false: emulate one. */
async function asReader(context, languages) {
  await context.addInitScript((langs) => {
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
    if (langs) {
      Object.defineProperty(Navigator.prototype, "languages", { get: () => langs });
      Object.defineProperty(Navigator.prototype, "language", { get: () => langs[0] });
    }
  }, languages ?? null);
}

/** Saves a language choice before the page's own scripts run, once. */
async function withSavedLocale(context, locale) {
  await context.addInitScript((l) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("locale", l);
      sessionStorage.setItem("seeded", "1");
    }
  }, locale);
}

async function expectLocale(page, locale) {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator('[data-i18n="layout.skipLink"]').first()).toHaveText(SKIP[locale]);
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
}

const storedLocale = (page) => page.evaluate(() => localStorage.getItem("locale"));

test.describe("Language from the browser and system", () => {
  // Playwright's `locale` sets navigator.language(s), Accept-Language and Intl
  // together, like a phone or computer set to that language.
  for (const [system, want] of [
    ["fr-FR", "fr"],
    ["fr-CA", "fr"],
    ["en-US", "en"],
    ["en-GB", "en"],
    ["es-MX", "es"],
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
    ["ar-EG", "ar"],
    ["id-ID", "id"],
    ["jv-ID", "id"], // Javanese: no bundle, the country speaks Indonesian
    ["ca-ES", "es"], // Catalan: no bundle, Spain
    ["de-DE", "fr"], // nothing to go on: the default
    ["ja-JP", "fr"],
  ]) {
    test.describe(`system in ${system}`, () => {
      test.use({ locale: system });
      test(`shows the site in ${want}, without storing it`, async ({ page, context }) => {
        await asReader(context);
        await page.goto("/");
        await expectLocale(page, want);
        expect(await storedLocale(page)).toBeNull();
      });
    });
  }

  test("takes the first language of the reader's list the site has", async ({ page, context }) => {
    await asReader(context, ["de-DE", "de", "es-ES", "en-US"]);
    await page.goto("/");
    await expectLocale(page, "es");
  });

  test("prefers a listed language to a country's", async ({ page, context }) => {
    await asReader(context, ["jv-ID", "en-US"]);
    await page.goto("/");
    await expectLocale(page, "en");
  });

  test("follows the system on a note page too", async ({ page, context }) => {
    await asReader(context, ["id-ID"]);
    await page.goto("/");
    const href = await page.locator('a[href^="/posts/"]').first().getAttribute("href");
    test.skip(!href, "no note in this export");
    await page.goto(href);
    await expectLocale(page, "id");
  });
});

test.describe("The reader's choice wins", () => {
  test.use({ locale: "en-US" });

  test("a saved language beats the system's", async ({ page, context }) => {
    await asReader(context);
    await withSavedLocale(context, "es");
    await page.goto("/");
    await expectLocale(page, "es");
  });

  test("a saved French beats an English system", async ({ page, context }) => {
    await asReader(context);
    await withSavedLocale(context, "fr");
    await page.goto("/");
    await expectLocale(page, "fr");
  });

  test("a saved language the site no longer has falls back to the system's", async ({ page, context }) => {
    await asReader(context);
    await withSavedLocale(context, "de");
    await page.goto("/");
    await expectLocale(page, "en");
  });

  test("picking a language stores it and keeps it over reloads", async ({ page, context }) => {
    await asReader(context);
    await page.goto("/");
    await expectLocale(page, "en");
    await page.evaluate(() => window.__i18n.setLocale("ar"));
    await expectLocale(page, "ar");
    expect(await storedLocale(page)).toBe("ar");
    await page.reload();
    await expectLocale(page, "ar");
    // Back to French by hand: stays French although the system is English.
    await page.evaluate(() => window.__i18n.setLocale("fr"));
    await page.reload();
    await expectLocale(page, "fr");
  });
});

test.describe("Crawlers and automated browsers", () => {
  test.use({ locale: "en-US" });

  test("keep the French the site is built in", async ({ page }) => {
    // No asReader(): navigator.webdriver stays true, as for headless crawlers.
    await page.goto("/");
    await expectLocale(page, "fr");
  });

  test("a search-engine user agent keeps French", async ({ browser }) => {
    const context = await browser.newContext({
      locale: "en-US",
      userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    });
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false });
    });
    const page = await context.newPage();
    await page.goto("/");
    await expectLocale(page, "fr");
    await context.close();
  });
});
