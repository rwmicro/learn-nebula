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
    await page.goto("/posts/fundamental-theorem-of-calculus/");
    const html = await page.content();
    // KaTeX is self-hosted and pre-rendered; no jsdelivr/CDN scripts.
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).toContain("/katex/katex.min.css");
  });
});
