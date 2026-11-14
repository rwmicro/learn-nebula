// "Traduire" in the browser (public/js/translate.js → translate-device.bundle.js),
// with a fake Gemini Nano: no real model runs in CI. The cutting into
// batches, the parsing and the progress are unit-tested
// (lib/translate-plan.test.ts); this checks what only a page can: the menu,
// the cards, stop and resume, a passage that fails, right-to-left, the copy
// kept in localStorage.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/** The smallest exported French note with a table, a few sections and no
 *  widget. */
function pickNote() {
  const root = path.join("out", "posts");
  let hit = null;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "index.html") {
        const size = fs.statSync(full).size;
        if (hit && size >= hit.size) continue;
        const html = fs.readFileSync(full, "utf8");
        if (
          /class="translate-btn"[^>]*data-source-lang="fr"|data-source-lang="fr"[^>]*class="translate-btn"/.test(html) &&
          /<td/.test(html) &&
          // Nothing that draws itself after load: the tests compare the text.
          !/data-widget|class="mermaid|data-owid/.test(html) &&
          (html.match(/<h2/g) || []).length >= 3
        )
          hit = { size, url: "/" + path.relative("out", dir).split(path.sep).join("/") + "/" };
      }
    }
  };
  try {
    walk(root);
  } catch {
    /* no export to scan */
  }
  return hit && hit.url;
}

/**
 * A LanguageModel that "translates" by upper-casing what is outside tags.
 * window.__lm: `calls` (every prompt), `delay` (ms per prompt), `fail` (a
 * string: a line holding it comes back without its tags closed, or empty),
 * `dead` (create() refuses).
 */
function fakeNano() {
  delete self.Translator;
  const lm = (window.__lm = { calls: [], delay: 0, fail: "", dead: false });
  const turn = (line) =>
    lm.fail && line.toLowerCase().includes(lm.fail.toLowerCase())
      ? ""
      : line.replace(/(<[^>]+>|&\w+;|^\[\d+\] )|([^<&]+)/g, (m, keep, text) => keep || text.toUpperCase());
  const session = () => ({
    clone: async () => session(),
    destroy() {},
    async *promptStreaming(text, { signal } = {}) {
      lm.calls.push(text);
      if (lm.delay) await new Promise((r) => setTimeout(r, lm.delay));
      if (signal && signal.aborted) throw new DOMException("stopped", "AbortError");
      yield text.split("\n").map(turn).filter(Boolean).join("\n");
    },
  });
  self.LanguageModel = {
    availability: async () => "available",
    create: async () => {
      if (lm.dead) throw new DOMException("refused", "NotAllowedError");
      return session();
    },
  };
}

const NOTE = pickNote();

test.describe("Traduire, on the device", () => {
  test.skip(!NOTE, "no exported note to translate");
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeNano);
    await page.goto(NOTE);
  });

  // The button sits in the "Aa" panel of the reading bar, or in the display
  // sheet on a phone; both close once a language is picked.
  const button = async (page) => {
    const btn = page.locator(".translate-btn");
    await page.waitForTimeout(500); // a sheet that is closing still shows it
    if (!(await btn.isVisible()))
      await page.locator(".note-more-btn:visible, [data-na-sheet]:visible").first().click();
    return btn;
  };
  const pick = async (page, lang) => {
    await (await button(page)).click();
    await page.locator(`.translate-menu-item[data-target-lang="${lang}"]`).click();
  };
  // The note's paragraphs and headings (a chart draws itself when it
  // likes, so the whole body's text is not stable).
  const prose = (page) =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll(".article-body :is(p, h2, h3, li)"))
        .map((el) => el.textContent.replace(/\s+/g, " ").trim())
        .join("\n"),
    );
  const card = (page, state) => page.locator(`.translate-local[data-state="${state}"]`);

  test("translates the note in batches and keeps it", async ({ page }) => {
    const before = await prose(page);
    await pick(page, "en");
    await expect(card(page, "done")).toBeVisible();
    await expect(page.locator(".translate-btn")).toHaveAttribute("data-state", "translated");
    await expect(page.locator("#main")).toHaveAttribute("lang", "en");
    const after = await prose(page);
    expect(after).not.toBe(before);
    expect(after.toLowerCase()).toBe(before.toLowerCase());
    await expect(page.locator(".translate-pending, .translate-now, .translate-failed")).toHaveCount(0);
    // Fewer model calls than blocks: they go several at a time.
    const { calls, blocks } = await page.evaluate(() => ({
      calls: window.__lm.calls.length,
      blocks: window.__lm.calls.join("\n").split("\n").length,
    }));
    expect(calls).toBeLessThan(blocks);

    // The switch gives the original back without translating again.
    await card(page, "done").getByRole("button", { name: "Original" }).click();
    expect(await prose(page)).toBe(before);

    // A second visit asks the model nothing.
    await page.reload();
    await pick(page, "en");
    await expect(card(page, "done")).toBeVisible();
    expect(await page.evaluate(() => window.__lm.calls.length)).toBe(0);
  });

  test("“Arrêter” keeps what is done, “Reprendre” goes on from there", async ({ page }) => {
    await page.evaluate(() => (window.__lm.delay = 250));
    const before = await prose(page);
    await pick(page, "en");
    await expect(card(page, "running")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__lm.calls.length)).toBeGreaterThan(1);
    await card(page, "running").locator(".tl-stop").click();
    await expect(card(page, "paused")).toBeVisible();
    expect(await prose(page)).toBe(before);
    await expect(page.locator(".translate-btn")).toHaveAttribute("data-state", "idle");

    const first = await page.evaluate(() => {
      const sent = window.__lm.calls.join("\n");
      window.__lm.calls = [];
      window.__lm.delay = 0;
      return sent;
    });
    await card(page, "paused").locator(".tl-stop").click();
    await expect(card(page, "done")).toBeVisible();
    // What the first run finished is not asked again.
    const second = await page.evaluate(() => window.__lm.calls.join("\n"));
    const firstLine = first.split("\n")[0].replace(/^\[\d+\] /, "");
    expect(second).not.toContain(firstLine);
  });

  test("a passage the model can't translate says so where it is, and can be retried", async ({ page }) => {
    // The first cell of the first table body is the one that fails.
    const word = await page.evaluate(() => {
      const cell = document.querySelector(".article-body tbody td");
      const w = (cell.textContent.match(/\p{L}{4,}/u) || [""])[0];
      window.__lm.fail = w;
      return w;
    });
    test.skip(!word, "no word to fail on");
    await pick(page, "en");
    await expect(card(page, "partial")).toBeVisible();
    const notes = page.locator(".translate-failed-note");
    expect(await notes.count()).toBeGreaterThan(0);
    // Inside a table the note is a <span> in its cell, never between rows.
    expect(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll(".translate-failed-note")).every((n) =>
          n.parentElement.closest("table") ? n.localName === "span" && n.parentElement.matches("td, th") : true,
        ),
      ),
    ).toBe(true);
    await page.evaluate(() => (window.__lm.fail = ""));
    await notes.first().locator(".translate-retry").click();
    await expect(card(page, "done")).toBeVisible();
    await expect(page.locator(".translate-failed-note, .translate-failed")).toHaveCount(0);
  });

  test("a right-to-left language turns the text around, the original turns it back", async ({ page }) => {
    await pick(page, "ar");
    await expect(card(page, "done")).toBeVisible();
    await expect(page.locator(".article-body")).toHaveAttribute("dir", "rtl");
    await (await button(page)).click();
    await expect(page.locator(".translate-btn")).toHaveAttribute("data-state", "idle");
    await expect(page.locator(".article-body")).not.toHaveAttribute("dir", "rtl");
  });

  test("a model that can't start says so above the note", async ({ page }) => {
    await page.evaluate(() => (window.__lm.dead = true));
    const before = await prose(page);
    await pick(page, "en");
    await expect(card(page, "failed")).toBeVisible();
    await expect(card(page, "failed")).toHaveAttribute("role", "alert");
    expect(await prose(page)).toBe(before);
    await expect(page.locator(".translate-btn")).toHaveAttribute("data-state", "idle");
  });

  test("with nothing to translate with, the menu says so instead of listing languages", async ({ page }) => {
    await page.addInitScript(() => {
      delete self.LanguageModel;
      try {
        Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
      } catch {
        /* already absent */
      }
    });
    await page.reload();
    await (await button(page)).click();
    await expect(page.locator(".translate-menu-note")).toBeVisible();
    await expect(page.locator(".translate-menu-item:visible")).toHaveCount(0);
    await expect(page.locator(".translate-menu-empty")).toBeHidden();
  });
});
