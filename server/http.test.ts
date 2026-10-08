import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context } from "hono";

// getIp() reads env at call time through the imported `env` object; mutate the
// mock's fields per test. trustProxy defaults on, like production. vi.hoisted
// so the object exists when the hoisted vi.mock factory runs.
const { env } = vi.hoisted(() => ({ env: { trustProxy: true, clientIpHeader: "" } }));
vi.mock("./env.ts", () => ({ env }));

import { getIp } from "./http.ts";

/** Minimal Context: the request headers plus the raw socket address. */
function ctx(headers: Record<string, string>, socket = "10.0.0.1"): Context {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    req: { header: (name: string) => lower[name.toLowerCase()] },
    env: { incoming: { socket: { remoteAddress: socket } } },
  } as unknown as Context;
}

beforeEach(() => {
  env.trustProxy = true;
  env.clientIpHeader = "";
});

describe("getIp cascade (CLIENT_IP_HEADER unset)", () => {
  it("prefers CF-Connecting-IP", () => {
    expect(getIp(ctx({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
  });

  it("takes the LAST X-Forwarded-For entry, not the client-chosen first", () => {
    expect(getIp(ctx({ "x-forwarded-for": "fake, 2.2.2.2" }))).toBe("2.2.2.2");
  });
});

describe("getIp with CLIENT_IP_HEADER pinned", () => {
  beforeEach(() => {
    env.clientIpHeader = "cf-connecting-ip";
  });

  it("uses only the pinned header", () => {
    // X-Forwarded-For is ignored entirely when a header is pinned.
    expect(getIp(ctx({ "cf-connecting-ip": "3.3.3.3", "x-forwarded-for": "fake" }))).toBe("3.3.3.3");
  });

  it("falls back to the socket, never a client header, when the pinned one is absent", () => {
    expect(getIp(ctx({ "x-forwarded-for": "fake" }, "10.0.0.5"))).toBe("10.0.0.5");
  });
});

describe("getIp with proxy untrusted", () => {
  it("ignores all headers and uses the socket", () => {
    env.trustProxy = false;
    expect(getIp(ctx({ "cf-connecting-ip": "1.1.1.1" }, "10.0.0.9"))).toBe("10.0.0.9");
  });
});
