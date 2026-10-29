import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/** Exported pages whose HTML contains `needle`, as site-root URLs. */
function findPages(needle, max = 1) {
  const root = "out";
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (hits.length >= max) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "index.html") {
        if (fs.readFileSync(full, "utf8").includes(needle))
          hits.push("/" + path.relative(root, dir).split(path.sep).join("/") + "/");
      }
    }
  };
  try {
    walk(root);
  } catch {
    /* no export to scan */
  }
  return hits;
}

const findPage = (needle) => findPages(needle, 1)[0] ?? null;

test.describe("Security", () => {
  test("should not load insecure resources", async ({ page }) => {
    const insecureResources = [];

    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("http://") && !url.includes("localhost")) {
        insecureResources.push(url);
      }
    });

    await page.goto("/");
    expect(insecureResources).toHaveLength(0);
  });

  test("should ship a Content-Security-Policy meta tag", async ({ page }) => {
    await page.goto("/");
    const csp = page.locator('meta[http-equiv="Content-Security-Policy"]');
    await expect(csp).toHaveCount(1);
    const content = await csp.getAttribute("content");
    expect(content).toContain("default-src 'self'");
    expect(content).toContain("object-src 'none'");
  });

  test("should not reference a third-party CDN", async ({ page }) => {
    // Any note that renders KaTeX (math): the previous fixed slug had been
    // removed from the vault, so this points at a current math note instead.
    await page.goto(
      "/posts/applied-sciences/computer-science/software/security/cryptographie/hash-cracking/",
    );
    const html = await page.content();
    // KaTeX is self-hosted and pre-rendered; no jsdelivr/CDN scripts.
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).toContain("/katex/katex.min.css");
  });
});

test.describe("Typography", () => {
  // Tailwind's preflight resets every ul/ol to `list-style: none` with no
  // padding, which silently flattened Markdown lists in notes into a run of
  // unmarked, flush-left lines. main.css restores markers + indent inside
  // .article-body; this guards that rescue against the next preflight bump.
  test("article lists keep their bullets, numbers and indent", async ({
    page,
    request,
  }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const m = xml.match(/<loc>([^<]*\/posts\/[^<]*)<\/loc>/);
    test.skip(!m, "no note in sitemap");
    await page.goto(new URL(m[1]).pathname);

    const styles = await page.evaluate(() => {
      const body = document.querySelector(".article-body");
      if (!body) return null;
      const probe = document.createElement("div");
      probe.innerHTML =
        "<ul><li>a<ul><li>b</li></ul></li></ul>" +
        "<ol><li>c</li></ol>" +
        '<ul class="contains-task-list"><li class="task-list-item">d</li></ul>';
      body.append(probe);
      const read = (sel) => {
        const cs = getComputedStyle(probe.querySelector(sel));
        return { type: cs.listStyleType, padLeft: parseFloat(cs.paddingLeft) };
      };
      const out = {
        ul: read("ul"),
        nested: read("ul ul"),
        ol: read("ol"),
        tasks: read("ul.contains-task-list"),
      };
      probe.remove();
      return out;
    });

    expect(styles).not.toBeNull();
    expect(styles.ul.type).toBe("disc");
    expect(styles.ul.padLeft).toBeGreaterThan(0);
    expect(styles.nested.type).toBe("circle");
    expect(styles.ol.type).toBe("decimal");
    expect(styles.ol.padLeft).toBeGreaterThan(0);
    // Task lists carry their own checkbox — a bullet on top would be noise.
    expect(styles.tasks.type).toBe("none");
  });
});

test.describe("Hover previews", () => {
  // /js/popover.js: hovering an internal note link fetches the target and shows
  // its title + opening prose, so a reader can judge a [[wikilink]] without
  // leaving the page. Text is injected with textContent, never innerHTML.
  test("previews an internal note link on hover", async ({
    page,
    request,
    isMobile,
  }) => {
    // popover.js deliberately stands down where `(hover: hover)` is false: on
    // touch, a tap should just follow the link.
    test.skip(Boolean(isMobile), "pointer-only affordance");

    const xml = await (await request.get("/sitemap.xml")).text();
    const locs = [...xml.matchAll(/<loc>([^<]*\/posts\/[^<]*)<\/loc>/g)].map(
      (m) => new URL(m[1]).pathname,
    );
    test.skip(locs.length < 2, "need at least two notes");

    // Find a note that links to another note; notes with no outgoing links
    // have nothing to preview.
    let found = null;
    for (const path of locs.slice(0, 12)) {
      await page.goto(path);
      const link = page
        .locator(
          '.article-body a[href^="/posts/"], .backlinks a[href^="/posts/"]',
        )
        .first();
      if (await link.count()) {
        found = link;
        break;
      }
    }
    test.skip(!found, "no note-to-note link in the sampled notes");

    await found.scrollIntoViewIfNeeded();
    await found.hover();
    const card = page.locator(".note-popover");
    await expect(card).toBeVisible({ timeout: 5000 });
    await expect(card).not.toBeEmpty();

    // Escape dismisses it.
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
  });
});

test.describe("Diagrams", () => {
  // Two regressions that only show on a real page, both guarded here by
  // probing the CSS contract rather than by needing a vault note that happens
  // to contain a diagram.
  // The pre-rendered figure is an overflow-x:auto box, so it has to be
  // reachable from the keyboard — a scrollable region that isn't focusable
  // can't be scrolled without a mouse (WCAG 2.1.1; axe's
  // scrollable-region-focusable). Asserted on the real export, because the
  // attribute is written by scripts/render-mermaid.mjs, not by CSS.
  test("a pre-rendered diagram is reachable from the keyboard", async ({
    page,
    request,
  }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const notes = [...xml.matchAll(/<loc>([^<]*\/posts\/[^<]*)<\/loc>/g)].map(
      (m) => new URL(m[1]).pathname,
    );
    let found = false;
    for (const path of notes.slice(0, 40)) {
      await page.goto(path);
      const fig = page.locator("figure.mermaid-diagram").first();
      if ((await fig.count()) === 0) continue;
      found = true;
      await expect(fig).toHaveAttribute("tabindex", "0");
      break;
    }
    test.skip(!found, "no pre-rendered diagram in the first 40 notes");
  });

  test("a mermaid diagram keeps its size and its labels", async ({
    page,
    request,
  }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const m = xml.match(/<loc>([^<]*\/posts\/[^<]*)<\/loc>/);
    test.skip(!m, "no note in sitemap");
    await page.goto(new URL(m[1]).pathname);

    const probe = await page.evaluate(() => {
      const body = document.querySelector(".article-body");
      if (!body) return null;
      // Mermaid's own shape: a figure holding an svg whose node labels are
      // HTML inside <foreignObject>, sized by mermaid at 16px/24px.
      const host = document.createElement("div");
      host.innerHTML =
        '<figure class="mermaid-diagram">' +
        '<svg viewBox="0 0 1600 70" style="max-width: 1600px;" width="100%">' +
        '<foreignObject width="124" height="24">' +
        '<div style="font-size:16px;line-height:24px">' +
        '<span class="nodeLabel"><p>Collecte des sources</p></span>' +
        "</div></foreignObject></svg></figure>";
      body.append(host);
      const fig = host.querySelector(".mermaid-diagram");
      const svg = host.querySelector("svg");
      const label = host.querySelector("foreignObject p");
      const cs = getComputedStyle(label);
      const out = {
        // The article body-type rule must not reach inside the diagram: a 21px
        // label in a box mermaid measured at 16px overflows and gets clipped.
        labelFontSize: cs.fontSize,
        // A wide diagram keeps its natural width and the figure scrolls,
        // instead of being squashed to the column (a 23:1 viewBox became 28px
        // tall).
        svgWidth: Math.round(svg.getBoundingClientRect().width),
        figScrolls: fig.scrollWidth > fig.clientWidth,
        figOverflowX: getComputedStyle(fig).overflowX,
      };
      host.remove();
      return out;
    });

    expect(probe).not.toBeNull();
    expect(probe.labelFontSize).toBe("16px");
    expect(probe.svgWidth).toBe(1600);
    expect(probe.figScrolls).toBe(true);
    expect(probe.figOverflowX).toBe("auto");
  });
});

test.describe("Widgets", () => {
  // public/js/widgets.js is 106 KB of builders for the 30 notes out of 721
  // that mount one. It is deliberately NOT in note.bundle.js — widgets-loader
  // fetches it only when a mount point is on the page. Both halves of that
  // contract are asserted here, because only the second one is visible when it
  // breaks: putting the library back in the bundle would keep every widget
  // working while quadrupling what every other note downloads.
  test("the library loads on a page with a widget, and only there", async ({
    page,
  }) => {
    const withWidget = findPage('data-widget="');
    test.skip(!withWidget, "no note mounts a widget in this build");

    // The original library or one of the packs (lib/widgets-extra.ts),
    // whichever the page's widgets need.
    const isWidgetCode = (u) => /\/js\/widgets(\.js|-[a-z]+\.bundle\.js)$/.test(u);
    const fetched = [];
    page.on("response", (r) => {
      if (isWidgetCode(r.url())) fetched.push(r.url());
    });

    await page.goto(withWidget);
    await page.waitForLoadState("networkidle");
    expect(fetched.length, "no widget code was fetched on a page that has one").toBeGreaterThan(0);
    // Mounted, not just downloaded: the fallback paragraph is gone.
    await expect(page.locator(".widget[data-widget] .widget-fallback")).toHaveCount(0);

    fetched.length = 0;
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(fetched, "widget code was fetched on a page with no widget").toHaveLength(0);
  });

  test("the note bundle does not carry the widget library", () => {
    const bundle = fs.readFileSync("out/js/note.bundle.js", "utf8");
    expect(bundle).toContain("widget[data-widget]"); // the loader is in it
    // The library alone is 106 KB (and each pack 50 to 80 KB), so a bundle
    // that carried one would be well past this; the margin leaves room for
    // the note enhancers themselves (selection toolbar, reading progress,
    // comments, step list… ≈ 56 KB in 10/2026, once quiz and glossary moved
    // to their own per-note bundles; ≈ 64 KB once the phone note layout,
    // note-app.js, joined them; ≈ 70 KB once on-device translation and
    // "Signaler" joined, with the diagram scripts moved out to their own
    // bundles); ≈ 76 KB once the reading bar, note-dock.js and its liquid
    // glass lens, joined them; ≈ 78 KB with the left rail's sections and
    // progress in toc.js; ≈ 83 KB with the glass selection menu and the
    // in-place device translation, the model code itself being fetched on
    // demand as translate-device.bundle.js; ≈ 86 KB with the empty
    // comments' bench drawing, lib/deco-bench.ts, and the reading paths'
    // hand-named levels).
    expect(bundle.length).toBeLessThan(88_000);
    // Those two load only where they are used (see below).
    expect(bundle).not.toContain("quiz-self-btn");
    expect(bundle).not.toContain("gloss-popover");
  });
});

test.describe("Per-note bundles", () => {
  // quiz.bundle.js / glossary.bundle.js are added by SinglePage only to notes
  // whose HTML has a `[!quiz]` card or a glossary mark.
  for (const [name, needle] of [
    ["quiz", "callout-quiz"],
    ["glossary", 'class="gloss"'],
  ]) {
    test(`${name}.bundle.js loads on a note that uses it, and only there`, async ({
      page,
    }) => {
      const withIt = findPage(needle);
      test.skip(!withIt, `no note uses ${name} in this build`);
      const fetched = [];
      page.on("response", (r) => {
        if (r.url().endsWith(`/js/${name}.bundle.js`)) fetched.push(r.url());
      });
      await page.goto(withIt);
      await page.waitForLoadState("networkidle");
      expect(fetched).toHaveLength(1);

      const without = findPages("/js/note.bundle.js", 400).find(
        (p) => !fs.readFileSync(path.join("out", p, "index.html"), "utf8").includes(needle),
      );
      test.skip(!without, "every note uses it");
      fetched.length = 0;
      await page.goto(without);
      await page.waitForLoadState("networkidle");
      expect(fetched).toHaveLength(0);
    });
  }
});

test.describe("Keyboard", () => {
  // Display maths and wide tables are `overflow-x: auto` boxes, and a scroll
  // container that can't be focused can't be scrolled without a pointer (WCAG
  // 2.1.1). public/js/scroll-focus.js measures rather than declares: a box that
  // fits gets no tab stop, and `main table` is only a scroll container inside a
  // media query, so the answer depends on the viewport.
  test("a box that scrolls is focusable, one that fits is not", async ({ page }) => {
    // Whether a box overflows depends on its content AND the viewport, so the
    // subject can't be picked from the HTML: walk candidates until one of them
    // actually scrolls at this project's width.
    const candidates = findPages("katex-display", 25).concat(findPages("<table", 25));
    test.skip(!candidates.length, "no scrollable candidate in this build");

    let boxes = [];
    for (const note of candidates) {
      await page.goto(note);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      boxes = await page.evaluate(() =>
        [...document.querySelectorAll("main pre, main table, main .katex-display")].map(
          (el) => ({
            scrolls: el.scrollWidth > el.clientWidth + 1,
            focusable: el.getAttribute("tabindex") === "0",
          }),
        ),
      );
      if (boxes.some((b) => b.scrolls)) break;
    }
    test.skip(!boxes.some((b) => b.scrolls), "nothing overflows on any candidate");

    for (const b of boxes) {
      if (b.scrolls) expect(b.focusable, "a scrolling box is not focusable").toBe(true);
    }
    // And no dead tab stops: nothing this script marked should have stopped
    // overflowing. (A <pre> may carry shiki's own tabindex, hence the marker.)
    const dead = await page.evaluate(
      () =>
        [...document.querySelectorAll("[data-scroll-focus]")].filter(
          (el) => el.scrollWidth <= el.clientWidth + 1,
        ).length,
    );
    expect(dead, "a tab stop was left on a box that no longer scrolls").toBe(0);
  });
});
