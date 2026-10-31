import { existsSync, readFileSync } from "node:fs";
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

async function audit(page, context) {
  await injectAxe(page);
  // Throws (failing the test) if any violation is found.
  await checkA11y(page, context, AXE);
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
    // The note enhancers load afterInteractive, after the load event, and one
    // of them (scroll-focus.js) gives wide tables their tab stop: audit the
    // page once they have run, or axe races them on a cold start.
    await page
      .waitForFunction(
        () =>
          !!document.querySelector("[data-scroll-focus]") ||
          !document.querySelector("main table, main .katex-display"),
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
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
    // Everything the site itself draws on this page is audited. The one
    // exclusion is div.card, which holds a card's HTML verbatim from the .apkg
    // plus the deck's own stylesheet, injected as-is by
    // components/review/Flashcards.tsx. Those colours are the deck author's, chosen
    // against Anki's rendering, and several fail AA here. They are fixed per
    // deck in scripts/anki-css-overrides/, and the next test audits the card
    // body of every deck that has one; the rest stay out of scope here.
    //
    // Narrow on purpose: it excludes the card body only, so the study
    // controls, the header, the nav and the size switcher around it are all
    // still checked. Verified in both directions — a violation planted outside
    // .card still fails this test.
    await audit(page, { exclude: [[".card"]] });
  });

  // A deck with a CSS override in scripts/anki-css-overrides/ has had its
  // colours fixed on purpose, so its card body is audited too: the override
  // must actually clear AA against the deck's real stylesheet.
  test("a flashcard deck with a contrast override, card included", async ({
    page,
  }) => {
    let decks = [];
    try {
      decks = JSON.parse(readFileSync("content/anki/manifest.json", "utf8"));
    } catch {
      /* no manifest */
    }
    const fixed = decks.filter((d) =>
      existsSync(`scripts/anki-css-overrides/${d.slug}.css`),
    );
    test.skip(!fixed.length, "no overridden deck built");
    for (const d of fixed) {
      await page.goto(`/cartes/${d.slug}/`);
      await page.waitForSelector(".card");
      await audit(page);
      // Back of the card as well: flip and audit again.
      await page.locator(".card").click();
      await page.waitForTimeout(200);
      await checkA11y(page, undefined, AXE);
    }
  });
});
