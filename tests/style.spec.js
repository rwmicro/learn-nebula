import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { PAGES } from "./config.js";

// Visual regression — LOCAL ONLY, and deliberately not part of CI.
//
// tests/style.spec.js-snapshots/ is not tracked by git. Playwright writes a
// missing baseline on the first run and reports that run as failed, so the
// second run compares against what the first one produced and passes. Green
// here means "this run matched the previous run", not "this run matched a
// reviewed reference" — which is how a whole suite can look healthy while
// asserting nothing. The guard below refuses to run rather than let that
// happen quietly.
//
// Pinning the baselines needs them generated on the same Chromium the checker
// will use, i.e. inside a fixed Playwright container image, and the vault-
// dependent post screenshots below need a fixed set of notes. Until both are
// arranged, tests/functional.spec.js and tests/a11y.spec.js are what CI runs —
// they assert behaviour and need no reference image.
test.beforeAll(({}, testInfo) => {
  // Playwright's default is "missing" — it writes what it can't find and moves
  // on, which is the trap. Only an explicit --update-snapshots gets past here.
  const mode = testInfo.config.updateSnapshots;
  if (mode === "all" || mode === "changed") return;
  const dir = path.join(
    testInfo.project.testDir,
    "style.spec.js-snapshots",
  );
  const empty = !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
  if (empty) {
    throw new Error(
      "No visual baselines in tests/style.spec.js-snapshots/ — they are not tracked " +
        "by git, so a plain run would write them and then compare this run against " +
        "itself.\nRun `pnpm exec playwright test tests/style.spec.js " +
        "--update-snapshots` once, eyeball the PNGs, and keep them for the session.",
    );
  }
});

async function discoverBlogPosts(page) {
  await page.goto("/posts/");
  await page.waitForLoadState("networkidle");
  const blogPostUrls = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/posts/"]'));
    return links
      .map((link) => link.href)
      .filter((href) => href !== window.location.href)
      .filter((href, index, self) => self.indexOf(href) === index);
  });
  return blogPostUrls;
}

function getSafeFilename(url) {
  const urlObj = new URL(url, "http://localhost");
  const filename =
    urlObj.pathname.replace(/^\//, "").replace(/\/$/, "").replace(/\//g, "-") || "homepage";
  return `${filename}.png`;
}

for (const page of PAGES) {
  test(`${page.name} visual regression`, async ({ page: playwright }) => {
    await playwright.goto(page.url);
    await playwright.waitForLoadState("networkidle");
    await playwright.waitForLoadState("load");
    // Wait for fonts to load to ensure consistent rendering
    await playwright.evaluate(() => document.fonts.ready);
    await expect(playwright).toHaveScreenshot(`${page.name}.png`, {
      fullPage: true,
      animations: "disabled",
    });
  });
}

test.describe("Blog Posts", () => {
  let blogPostUrls = [];

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    blogPostUrls = await discoverBlogPosts(page);
    await page.close();
  });

  test("recent blog posts visual regression", async ({ page }) => {
    // Sorted, not "whatever /posts/ listed first": the discovery order shifts as
    // the vault changes, and a screenshot test whose subject moves can't be a
    // regression test. Sorting at least keeps the same three notes while they
    // exist.
    const postsToTest = [...blogPostUrls].sort().slice(0, 3);
    for (const url of postsToTest) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.waitForLoadState("load");
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(getSafeFilename(url), {
        fullPage: true,
        animations: "disabled",
      });
    }
  });
});
