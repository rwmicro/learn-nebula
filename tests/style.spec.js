import { test, expect } from "@playwright/test";

// Visual regression against reviewed baselines.
//
// The baselines (tests/style.spec.js-snapshots/) are tracked, and only mean
// something when both sides are pinned:
//   - the notes: the site is built from the fixed vault in tests/fixtures/vault
//     (NOTES_LOCAL_DIR), not from pensine, which changes every day;
//   - the browser: screenshots are taken inside the Playwright image whose
//     version matches @playwright/test (scripts/visual.sh, ci.yml "visual").
// Taken anywhere else (another Chromium, the real vault), they will differ.
//
//   scripts/visual.sh                      # build the fixture site + compare
//   scripts/visual.sh --update-snapshots   # rewrite the baselines, then review the PNGs

// The service worker would serve a page from its cache between runs.
test.use({ serviceWorkers: "block" });

// A fixed clock: the home's greeting, "today" cards and streaks depend on it.
// The build gets the same one (tests/fixed-date.mjs, VISUAL_NOW in visual.sh).
const NOW = new Date("2026-10-15T10:00:00Z");

const PAGES = [
  { url: "/", name: "accueil" },
  { url: "/notes/", name: "notes" },
  { url: "/notes/social-sciences/", name: "dossier" },
  { url: "/parcours/", name: "parcours" },
  { url: "/parcours/physique-du-lycee-a-la-prepa/", name: "parcours-detail" },
  { url: "/posts/applied-sciences/mathematics/lycee/algebre/second-degre/", name: "note-maths" },
  { url: "/posts/social-sciences/history/japon/histoire-du-japon/", name: "note-histoire" },
  { url: "/themes/", name: "themes" },
  { url: "/cartes/", name: "cartes" },
  { url: "/progression/", name: "progression" },
  { url: "/defis/", name: "defis" },
  { url: "/jardin/", name: "jardin" },
  { url: "/frise/", name: "frise" },
  { url: "/compte/", name: "compte" },
  { url: "/404/", name: "404" },
];

// Right-to-left: the Arabic interface on a few pages that carry the shared
// pieces (title, list, note column), and the Frise, whose counts once stayed
// in French (lib/i18n.ts, i18nProps).
const RTL = ["accueil", "parcours", "note-histoire", "frise"];

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Lazy images and IntersectionObserver reveals: walk the page once.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
    window.scrollTo(0, 0);
  });
  // What the walk woke up (lazy images, late fonts, widgets) has to land
  // before the shot, or the page's height changes from one run to the next.
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Only images that loaded: decode() on a lazy image left off-screen never settles.
    const loaded = [...document.images].filter((img) => img.complete && img.naturalWidth);
    await Promise.race([
      Promise.all(loaded.map((img) => img.decode().catch(() => {}))),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  });
  await page.waitForTimeout(500);
}

async function shoot(page, url, file, { scheme = "light", locale, open } = {}) {
  await page.clock.setFixedTime(NOW);
  // Exercises shuffle their choices: same seed, same order on every run.
  await page.addInitScript(() => {
    let x = 42;
    Math.random = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  });
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
  if (locale) {
    await page.addInitScript((l) => localStorage.setItem("locale", l), locale);
  }
  await page.goto(url);
  await settle(page);
  if (open) {
    await open(page);
    await page.waitForTimeout(500);
  }
  // On the phone, a full-page capture briefly drops touch emulation, and the
  // page switches to (hover: hover) for good halfway through: the exercises
  // show their keyboard hints and the height changes between two shots.
  // Growing the viewport to the page ourselves keeps the phone a phone.
  const tall = !open && test.info().project.use.isMobile;
  if (tall) {
    // A sticky table column gets its own layer, whose hairlines rasterise
    // a pixel apart from one run to the next. Not scrolled sideways, a
    // static cell sits exactly where the sticky one would.
    await page.addStyleTag({ content: ".article-body table :is(th, td) { position: static !important; }" });
    const { width } = page.viewportSize();
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
  }
  await expect(page).toHaveScreenshot(file, {
    // A sheet is drawn over the viewport: that is what to compare.
    fullPage: !open && !tall,
    // Not "disabled": that jumps scroll-driven animations (the large titles
    // that fade into the top bar) to their end, as if the page were scrolled.
    animations: "allow",
    caret: "hide",
    timeout: 30_000,
    // Same image, same Chromium: a real change is never a few pixels. (The
    // 2% ratio in playwright.config.js lets a whole title vanish on a long page.)
    maxDiffPixels: 100,
    // The force graph's layout is random from run to run.
    mask: [page.locator("canvas")],
  });
}

for (const { url, name } of PAGES) {
  test(`${name} clair`, async ({ page }) => {
    await shoot(page, url, `${name}-clair.png`);
  });
  test(`${name} sombre`, async ({ page }) => {
    await shoot(page, url, `${name}-sombre.png`, { scheme: "dark" });
  });
}

for (const name of RTL) {
  const { url } = PAGES.find((p) => p.name === name);
  test(`${name} arabe`, async ({ page }) => {
    await shoot(page, url, `${name}-arabe.png`, { locale: "ar" });
  });
}

// The bottom sheets, open: they share one look (global.css, --sheet-*).
const NOTE = PAGES.find((p) => p.name === "note-maths").url;
const SHEETS = [
  {
    name: "feuille-affichage",
    url: NOTE,
    phoneOnly: true, // from 640px the note's tools are the dock, without this sheet
    open: (page) => page.locator(".na-tool[data-na-sheet]").click(),
  },
  {
    name: "feuille-sommaire",
    url: NOTE,
    phoneOnly: true,
    open: (page) => page.locator("[data-na-toc]").first().click(),
  },
];

for (const { name, url, open, phoneOnly } of SHEETS) {
  for (const scheme of ["light", "dark"]) {
    const label = scheme === "light" ? "clair" : "sombre";
    test(`${name} ${label}`, async ({ page }, info) => {
      test.skip(phoneOnly && !info.project.name.includes("Mobile"), "phones only");
      await shoot(page, url, `${name}-${label}.png`, { scheme, open });
    });
  }
}
