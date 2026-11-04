// Sign-up / sign-in by magic link and comments, end to end through the real
// routes, as they run behind Cloudflare in production: the tunnel adds
// CF-Connecting-IP, the forms carry a Turnstile token, and the server asks
// Cloudflare's siteverify about it (server/turnstile.ts).
//
// By default siteverify is played by a fake that answers like Cloudflare does
// for its documented test secret keys (1x… always passes, 2x… always fails,
// 3x… "timeout-or-duplicate"), so the suite needs no network. With
// TURNSTILE_LIVE=1 the same tests ask the real Cloudflare endpoint, still
// with the test keys: a check that the request we send is one Cloudflare
// accepts.
//
//   npx vitest run server/cloudflare-flows.test.ts
//   TURNSTILE_LIVE=1 npx vitest run server/cloudflare-flows.test.ts

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";

// env.ts reads process.env once at import: set it before loading anything.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-flows-"));
process.env.DB_PATH = path.join(tmp, "comments.db");
process.env.PUBLIC_URL = "https://garden.example";
process.env.AUTH_DEV_LOG = "true";
process.env.TRUST_PROXY = "true";
process.env.CLIENT_IP_HEADER = "";
process.env.SMTP_HOST = "";

/** Cloudflare's test keys (developers.cloudflare.com/turnstile/troubleshooting/testing). */
const PASS = "1x0000000000000000000000000000000AA";
const FAIL = "2x0000000000000000000000000000000AA";
const SPENT = "3x0000000000000000000000000000000AA";
const SITE_KEY = "1x00000000000000000000AA";
/** What the widget hands the page with a test site key. */
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const LIVE = process.env.TURNSTILE_LIVE === "1";

let app: Hono;
let env: typeof import("./env").env;
const realFetch = globalThis.fetch;
/** Every siteverify call the server made: its form fields. */
let asked: Record<string, string>[] = [];
let cloudflareDown = false;

function fakeCloudflare(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url !== SITEVERIFY) return realFetch(input, init);
  const form = Object.fromEntries(
    new URLSearchParams(String(init?.body ?? "")),
  );
  asked.push(form);
  if (LIVE) return realFetch(input, init);
  if (cloudflareDown) return Promise.reject(new TypeError("fetch failed"));
  const json = (o: object) =>
    Promise.resolve(
      new Response(JSON.stringify(o), {
        headers: { "content-type": "application/json" },
      }),
    );
  if (!form.response)
    return json({ success: false, "error-codes": ["missing-input-response"] });
  if (form.secret === PASS) return json({ success: true, "error-codes": [] });
  if (form.secret === SPENT)
    return json({ success: false, "error-codes": ["timeout-or-duplicate"] });
  if (form.secret === FAIL)
    return json({ success: false, "error-codes": ["invalid-input-response"] });
  return json({ success: false, "error-codes": ["invalid-input-secret"] });
}

beforeAll(async () => {
  const { Hono } = await import("hono");
  ({ env } = await import("./env"));
  const { authRoute } = await import("./routes/auth");
  const { meRoute } = await import("./routes/account");
  const { commentsRoute } = await import("./routes/comments");
  app = new Hono();
  app.route("/api/auth", authRoute);
  app.route("/api/me", meRoute);
  app.route("/api/comments", commentsRoute);
});

let ipCounter = 0;
/** A fresh visitor address each time (the rate limits are per IP). */
const newIp = () => `203.0.113.${++ipCounter}`;

/** A request as the Cloudflare tunnel delivers it. */
function viaCloudflare(
  ip: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "content-type": "application/json",
    origin: "https://garden.example",
    host: "garden.example",
    "cf-connecting-ip": ip,
    "x-forwarded-for": `${ip}, 172.70.1.1`,
    "x-forwarded-proto": "https",
    "cf-ray": "8f00000000000000-CDG",
    ...extra,
  };
}

const post = (url: string, body: unknown, headers: Record<string, string>) =>
  app.request(url, { method: "POST", headers, body: JSON.stringify(body) });

/** The login link AUTH_DEV_LOG prints instead of mailing it. */
function captureLinks() {
  const links: string[] = [];
  const spy = vi
    .spyOn(console, "log")
    .mockImplementation((...args: unknown[]) => {
      const m = /(https:\/\/garden\.example\/compte\/#login=[^\s]+)/.exec(
        args.join(" "),
      );
      if (m) links.push(m[1]);
    });
  return { links, restore: () => spy.mockRestore() };
}
const tokenOf = (link: string) => /#login=([^&]+)/.exec(link)![1];

beforeEach(() => {
  asked = [];
  cloudflareDown = false;
  vi.stubGlobal("fetch", vi.fn(fakeCloudflare));
  env.turnstileSecret = PASS;
  env.turnstileSiteKey = SITE_KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sign-up and sign-in behind Cloudflare", () => {
  it("hands the Turnstile site key to the login form", async () => {
    const r = await app.request("/api/auth/config", {
      headers: viaCloudflare(newIp()),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      enabled: true,
      turnstileSiteKey: SITE_KEY,
    });
  });

  it("shows no widget (and asks no token) when Turnstile is not configured", async () => {
    env.turnstileSecret = "";
    const config = await (
      await app.request("/api/auth/config", { headers: viaCloudflare(newIp()) })
    ).json();
    expect(config.turnstileSiteKey).toBeUndefined();
    const log = captureLinks();
    const r = await post(
      "/api/auth/request",
      { email: "no-widget@example.fr" },
      viaCloudflare(newIp()),
    );
    log.restore();
    expect(r.status).toBe(200);
    expect(asked).toHaveLength(0);
  });

  it("refuses a login request without a Turnstile token, without asking Cloudflare", async () => {
    const r = await post(
      "/api/auth/request",
      { email: "a@example.fr" },
      viaCloudflare(newIp()),
    );
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "turnstile" });
    expect(asked).toHaveLength(0);
  });

  it("refuses the request when Cloudflare says the visitor failed the challenge", async () => {
    env.turnstileSecret = FAIL;
    const r = await post(
      "/api/auth/request",
      { email: "b@example.fr", turnstileToken: TOKEN },
      viaCloudflare(newIp()),
    );
    expect(r.status).toBe(403);
    expect(asked).toHaveLength(1);
  });

  it("refuses a token Cloudflare already saw (a replayed form)", async () => {
    env.turnstileSecret = SPENT;
    const r = await post(
      "/api/auth/request",
      { email: "c@example.fr", turnstileToken: TOKEN },
      viaCloudflare(newIp()),
    );
    expect(r.status).toBe(403);
  });

  it.skipIf(LIVE)(
    "fails closed when Cloudflare cannot be reached",
    async () => {
      cloudflareDown = true;
      const r = await post(
        "/api/auth/request",
        { email: "d@example.fr", turnstileToken: TOKEN },
        viaCloudflare(newIp()),
      );
      expect(r.status).toBe(403);
    },
  );

  it("refuses a login form posted from another site", async () => {
    const r = await post(
      "/api/auth/request",
      { email: "e@example.fr", turnstileToken: TOKEN },
      viaCloudflare(newIp(), { origin: "https://evil.example" }),
    );
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "bad-origin" });
  });

  it("signs a new reader up and in: token, link, session cookie, /api/me, logout", async () => {
    const ip = newIp();
    const log = captureLinks();
    const r = await post(
      "/api/auth/request",
      {
        email: "  New.Reader@Example.FR ",
        turnstileToken: TOKEN,
        next: "/progression/",
      },
      viaCloudflare(ip),
    );
    log.restore();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });

    // Cloudflare was asked about this token, for the visitor's own address
    // (CF-Connecting-IP), not the tunnel's.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({
      secret: PASS,
      response: TOKEN,
      remoteip: ip,
    });

    // The link goes to the static account page, the token in the fragment.
    expect(log.links).toHaveLength(1);
    expect(log.links[0]).toMatch(
      /^https:\/\/garden\.example\/compte\/#login=[A-Za-z0-9_-]+&next=%2Fprogression%2F$/,
    );

    const v = await post(
      "/api/auth/verify",
      { token: tokenOf(log.links[0]) },
      viaCloudflare(ip),
    );
    expect(v.status).toBe(200);
    const setCookie = v.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^gk_session=[^;]+/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const cookie = setCookie.split(";")[0];

    const me = await (
      await app.request("/api/me", { headers: viaCloudflare(ip, { cookie }) })
    ).json();
    expect(me.user).toMatchObject({
      email: expect.stringMatching(/^n.*@example\.fr$/),
    });

    // A link opens once.
    const again = await post(
      "/api/auth/verify",
      { token: tokenOf(log.links[0]) },
      viaCloudflare(ip),
    );
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: "expired" });

    const out = await app.request("/api/auth/logout", {
      method: "POST",
      headers: viaCloudflare(ip, { cookie }),
    });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/gk_session=;/);
    const after = await (
      await app.request("/api/me", { headers: viaCloudflare(ip, { cookie }) })
    ).json();
    expect(after.user).toBeNull();
  });

  it("signs the same reader in again on the same account", async () => {
    const ip = newIp();
    const ids: number[] = [];
    for (let i = 0; i < 2; i++) {
      const log = captureLinks();
      await post(
        "/api/auth/request",
        { email: "twice@example.fr", turnstileToken: TOKEN },
        viaCloudflare(ip),
      );
      log.restore();
      const v = await post(
        "/api/auth/verify",
        { token: tokenOf(log.links[0]) },
        viaCloudflare(ip),
      );
      const cookie = (v.headers.get("set-cookie") ?? "").split(";")[0];
      ids.push(
        (
          await (
            await app.request("/api/me", {
              headers: viaCloudflare(ip, { cookie }),
            })
          ).json()
        ).user.id,
      );
    }
    expect(ids[0]).toBe(ids[1]);
  });

  it("limits the links sent to one address, whatever the visitor's IP", async () => {
    const log = captureLinks();
    const codes: number[] = [];
    for (let i = 0; i < 4; i++)
      codes.push(
        (
          await post(
            "/api/auth/request",
            { email: "spam@example.fr", turnstileToken: TOKEN },
            viaCloudflare(newIp()),
          )
        ).status,
      );
    log.restore();
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it("refuses an invalid address before asking Cloudflare", async () => {
    const r = await post(
      "/api/auth/request",
      { email: "not an address", turnstileToken: TOKEN },
      viaCloudflare(newIp()),
    );
    expect(r.status).toBe(400);
    expect(asked).toHaveLength(0);
  });
});

describe("comments behind Cloudflare", () => {
  const slug = "applied-sciences/echecs/ouvertures/ouvertures";
  const comment = (body: string, extra: object = {}) => ({
    slug,
    name: "Lecteur",
    body,
    ...extra,
  });

  it("publishes a comment whose Turnstile token Cloudflare accepts", async () => {
    const ip = newIp();
    const r = await post(
      "/api/comments",
      comment("Merci pour la partie de Morphy !", { turnstileToken: TOKEN }),
      viaCloudflare(ip),
    );
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true, status: "approved" });
    expect(asked[0]).toMatchObject({
      secret: PASS,
      response: TOKEN,
      remoteip: ip,
    });

    const list = await (await app.request(`/api/comments?slug=${slug}`)).json();
    expect(list.comments.map((c: { body: string }) => c.body)).toContain(
      "Merci pour la partie de Morphy !",
    );
  });

  it("refuses a comment without a token, and keeps nothing", async () => {
    const r = await post(
      "/api/comments",
      comment("Sans jeton"),
      viaCloudflare(newIp()),
    );
    expect(r.status).toBe(403);
    const list = await (await app.request(`/api/comments?slug=${slug}`)).json();
    expect(list.comments.map((c: { body: string }) => c.body)).not.toContain(
      "Sans jeton",
    );
  });

  it("refuses a comment when Cloudflare says the challenge failed", async () => {
    env.turnstileSecret = FAIL;
    const r = await post(
      "/api/comments",
      comment("Robot", { turnstileToken: TOKEN }),
      viaCloudflare(newIp()),
    );
    expect(r.status).toBe(403);
  });

  it("holds comments for moderation when Turnstile is not configured", async () => {
    env.turnstileSecret = "";
    const r = await post(
      "/api/comments",
      comment("En attente"),
      viaCloudflare(newIp()),
    );
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true, status: "pending" });
    const list = await (await app.request(`/api/comments?slug=${slug}`)).json();
    expect(list.comments.map((c: { body: string }) => c.body)).not.toContain(
      "En attente",
    );
  });

  it("rate-limits per visitor (CF-Connecting-IP), not per tunnel", async () => {
    const ip = newIp();
    const first = await post(
      "/api/comments",
      comment("Un", { turnstileToken: TOKEN }),
      viaCloudflare(ip),
    );
    const second = await post(
      "/api/comments",
      comment("Deux", { turnstileToken: TOKEN }),
      viaCloudflare(ip),
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    // Another visitor through the same Cloudflare edge is not held back.
    const other = await post(
      "/api/comments",
      comment("Trois", { turnstileToken: TOKEN }),
      viaCloudflare(newIp()),
    );
    expect(other.status).toBe(201);
  });

  it("can't dodge the limit with a forged X-Forwarded-For", async () => {
    const ip = newIp();
    await post(
      "/api/comments",
      comment("Premier", { turnstileToken: TOKEN }),
      viaCloudflare(ip),
    );
    const forged = await post(
      "/api/comments",
      comment("Second", { turnstileToken: TOKEN }),
      viaCloudflare(ip, { "x-forwarded-for": "198.51.100.77, 172.70.1.1" }),
    );
    expect(forged.status).toBe(429);
  });

  it("refuses a like posted from another site", async () => {
    const r = await post(
      "/api/comments/like",
      { id: 1, voter: "abcdefghijklmnop1234", on: true },
      viaCloudflare(newIp(), { origin: "https://evil.example" }),
    );
    expect(r.status).toBe(403);
  });

  it("strips invisible bidi characters from a comment", async () => {
    const r = await post(
      "/api/comments",
      comment("Bon‮jour", { turnstileToken: TOKEN }),
      viaCloudflare(newIp()),
    );
    expect(r.status).toBe(201);
    const list = await (await app.request(`/api/comments?slug=${slug}`)).json();
    expect(list.comments.map((c: { body: string }) => c.body)).toContain(
      "Bonjour",
    );
  });
});
