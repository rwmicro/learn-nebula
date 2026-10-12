import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";

// env.ts reads process.env once at import: set it before loading anything.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "admin-session-"));
process.env.DB_PATH = path.join(tmp, "comments.db");
process.env.COMMENTS_ADMIN_TOKEN = "secret-token";
process.env.ADMIN_EMAILS = "Owner@Example.fr";
process.env.ADMIN_SESSION_HOURS = "12";
process.env.PUBLIC_URL = "https://garden.example";

let app: Hono;
let owner = "";
let ownerOld = "";
let reader = "";

beforeAll(async () => {
  const { Hono } = await import("hono");
  const { adminRoute } = await import("./routes/admin");
  const { database } = await import("./db");
  const { upsertUser, createSession } = await import("./account-store");
  app = new Hono();
  app.route("/api/admin", adminRoute);
  const db = database();
  const o = upsertUser(db, "owner@example.fr").id;
  owner = createSession(db, o);
  ownerOld = createSession(db, o, Date.now() - 13 * 3_600_000);
  reader = createSession(db, upsertUser(db, "reader@example.fr").id);
});

const cookie = (t: string) => ({ cookie: `gk_session=${t}` });
const ORIGIN = { origin: "https://garden.example" };

describe("admin through the owner's reader session", () => {
  it("lets the owner in, with no token", async () => {
    const r = await app.request("/api/admin/me", { headers: cookie(owner) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      via: "session",
      email: "owner@example.fr",
    });
  });

  it("refuses another reader's session", async () => {
    expect(
      (await app.request("/api/admin/me", { headers: cookie(reader) })).status,
    ).toBe(401);
  });

  it("refuses a session older than ADMIN_SESSION_HOURS", async () => {
    expect(
      (await app.request("/api/admin/me", { headers: cookie(ownerOld) }))
        .status,
    ).toBe(401);
  });

  it("judges a request with a token on the token alone", async () => {
    const bad = await app.request("/api/admin/me", {
      headers: { ...cookie(owner), authorization: "Bearer wrong" },
    });
    expect(bad.status).toBe(401);
    const good = await app.request("/api/admin/me", {
      headers: { authorization: "Bearer secret-token" },
    });
    expect(await good.json()).toEqual({ via: "token" });
  });

  it("needs a same-site Origin on a mutating request", async () => {
    const put = (headers: Record<string, string>) =>
      app.request("/api/admin/blocked-words", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...cookie(owner),
          ...headers,
        },
        body: JSON.stringify({ words: ["spam"] }),
      });
    expect((await put({})).status).toBe(401);
    expect((await put({ origin: "https://evil.example" })).status).toBe(401);
    expect((await put(ORIGIN)).status).toBe(200);
  });

  it("lists every account for the owner", async () => {
    const r = await app.request("/api/admin/accounts", {
      headers: cookie(owner),
    });
    const body = (await r.json()) as {
      accounts: number;
      list: { email: string; coins: number }[];
    };
    expect(body.accounts).toBe(2);
    expect(body.list.map((a) => a.email).sort()).toEqual([
      "owner@example.fr",
      "reader@example.fr",
    ]);
    expect(body.list.every((a) => a.coins === 0)).toBe(true);
  });
});
