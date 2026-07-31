import { readFileSync } from "node:fs";
import { test } from "@playwright/test";
import { injectAxe, checkA11y } from "axe-playwright";

// The machine-checkable subset of WCAG 2.1 A + AA. axe catches roughly a third
// of WCAG failures automatically — a floor, not a guarantee — but it reliably
// flags contrast, missing labels, invalid ARIA and colour-only link cues.
const AXE = {
  axeOptions: {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
    },
  },
  detailedReport: true,
};

async function audit(page) {
  await injectAxe(page);
  // Throws (failing the test) if any violation is found.
  await checkA11y(page, undefined, AXE);
}

test.describe("Accessibility (axe · WCAG 2.1 A/AA)", () => {
  test("home", async ({ page }) => {
    await page.goto("/");
    await audit(page);
  });

  test("graph", async ({ page }) => {
    await page.goto("/graph/");
    await page.waitForTimeout(600); // let force-graph mount its controls
    await audit(page);
  });

  test("404", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-a11y-probe/");
    await audit(page);
  });

  test("a note page", async ({ page, request }) => {
    // Pull a current note URL from the sitemap rather than hardcoding a slug —
    // a fixed slug rots when the vault changes (see the CDN security test).
    const xml = await (await request.get("/sitemap.xml")).text();
    const m = xml.match(/<loc>([^<]*\/posts\/[^<]*)<\/loc>/);
    test.skip(!m, "no note in sitemap");
    // The sitemap uses absolute production URLs (SITE_URL); navigate by path so
    // we audit the local build, not the deployed site.
    await page.goto(new URL(m[1]).pathname);
    await audit(page);
  });

  test("a flashcard deck", async ({ page }) => {
    let decks = [];
    try {
      decks = JSON.parse(readFileSync("content/anki/manifest.json", "utf8"));
    } catch {
      /* no manifest */
    }
    test.skip(!decks.length, "no Anki decks built");
    await page.goto(`/cartes/${decks[0].slug}/`);
    await page.waitForTimeout(400);
    await audit(page);
  });
});
