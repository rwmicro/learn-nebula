import { test, expect } from "@playwright/test";

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
