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
