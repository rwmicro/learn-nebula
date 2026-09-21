import { describe, it, expect } from "vitest";
import { relatedRoute } from "./related";

// No RAG configured in the test env, so relatedNotes() returns an empty list —
// which is exactly the case the cache headers have to distinguish, since it is
// also what the route says while the index is still embedding at startup.
const get = (url: string, headers: Record<string, string> = {}) =>
  relatedRoute.request(`/?url=${encodeURIComponent(url)}`, { headers });

describe("/api/related", () => {
  it("answers an empty list rather than an error when RAG is not ready", async () => {
    const res = await get("/posts/a/b/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ related: [] });
  });

  // Pinning "no related notes" for an hour would outlive the startup window
  // that produced it.
  it("caches an empty answer briefly, never for an hour", async () => {
    const res = await get("/posts/a/b/");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("rejects anything that is not a note URL", async () => {
    for (const bad of ["", "https://evil.example/", "/admin/", "../../etc"]) {
      const res = await get(bad);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ related: [] });
    }
  });

  // The old Cooldown(1) refused a second request inside one second, so an
  // ordinary reader opening two notes quickly — or two people behind one NAT —
  // lost the section. The quota has to let a realistic burst through.
  it("lets a fast reader through where the old per-second cooldown did not", async () => {
    const headers = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 20; i++) {
      expect((await get(`/posts/n${i}/`, headers)).status).toBe(200);
    }
  });

  it("still bounds a flood", async () => {
    const headers = { "x-forwarded-for": "203.0.113.8" };
    let limited = 0;
    for (let i = 0; i < 120; i++) {
      if ((await get(`/posts/n${i}/`, headers)).status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it("never caches a 429", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    let res = await get("/posts/x/", headers);
    for (let i = 0; i < 120 && res.status !== 429; i++) {
      res = await get(`/posts/x${i}/`, headers);
    }
    expect(res.status).toBe(429);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
