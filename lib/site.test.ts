import { describe, it, expect, vi, afterEach } from "vitest";
import { absoluteURL, buildCSP, noteHistoryUrl, SITE_URL } from "./site";

describe("absoluteURL", () => {
  it("prefixes a root-relative path with the site origin", () => {
    expect(absoluteURL("/posts/x/")).toBe(`${SITE_URL}/posts/x/`);
  });

  it("adds the missing leading slash", () => {
    expect(absoluteURL("posts/x")).toBe(`${SITE_URL}/posts/x`);
  });

  it("passes absolute http(s) URLs through untouched", () => {
    expect(absoluteURL("https://other.example/x")).toBe("https://other.example/x");
    expect(absoluteURL("http://other.example/x")).toBe("http://other.example/x");
  });
});

describe("buildCSP", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ships the hardening directives", () => {
    const csp = buildCSP();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows the Cloudflare Analytics beacon host", () => {
    const csp = buildCSP();
    expect(csp).toContain("https://static.cloudflareinsights.com");
    expect(csp).toContain("https://cloudflareinsights.com");
  });

  it("allows the site's own WebSocket origin", () => {
    expect(buildCSP()).toContain(`connect-src 'self' ${SITE_URL.replace(/^http/, "ws")} `);
  });

  it("drops 'unsafe-eval' and adds HTTPS upgrade in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const csp = buildCSP();
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("permits dev-only 'unsafe-eval' outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(buildCSP()).toContain("'unsafe-eval'");
  });
});

describe("noteHistoryUrl", () => {
  it("points at the GitHub commits of the note's file, path-encoded", () => {
    expect(noteHistoryUrl("Applied Sciences/Permaculture")).toBe(
      "https://github.com/rwmicro/pensine/commits/main/Applied%20Sciences/Permaculture.md",
    );
  });
});
