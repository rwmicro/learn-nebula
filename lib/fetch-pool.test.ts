import { describe, it, expect } from "vitest";
import { fetchJsonPool } from "./fetch-pool";

const res = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

describe("fetchJsonPool", () => {
  it("keeps at most `concurrency` requests in flight and keeps the order", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = (async (url: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return res(200, url);
    }) as unknown as typeof fetch;
    const seen: number[] = [];
    const out = await fetchJsonPool<string>(["a", "b", "c", "d", "e"], {
      concurrency: 2,
      fetchImpl,
      onEach: (n) => seen.push(n),
    });
    expect(out).toEqual(["a", "b", "c", "d", "e"]);
    expect(peak).toBe(2);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it("retries a 429 once, then gives up with null", async () => {
    const calls: Record<string, number> = {};
    const fetchImpl = (async (url: string) => {
      calls[url] = (calls[url] ?? 0) + 1;
      if (url === "flaky" && calls[url] === 1) return res(429, null);
      if (url === "down") return res(429, null);
      return res(200, url);
    }) as unknown as typeof fetch;
    const out = await fetchJsonPool<string>(["flaky", "down", "ok"], { fetchImpl, retryDelay: 1 });
    expect(out).toEqual(["flaky", null, "ok"]);
    expect(calls).toEqual({ flaky: 2, down: 2, ok: 1 });
  });
});
