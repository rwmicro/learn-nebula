import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";

// env.ts reads process.env once at import: set it before loading anything.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "admin-console-"));
process.env.DB_PATH = path.join(tmp, "comments.db");
process.env.COMMENTS_ADMIN_TOKEN = "secret-token";
process.env.COMMENT_AUTHOR_NAME = "Martin";
delete process.env.COMMENT_WEBHOOK_URL;

let app: Hono;
let db: typeof import("./db");

beforeAll(async () => {
  const { Hono } = await import("hono");
  const { adminRoute } = await import("./routes/admin");
  db = await import("./db");
  app = new Hono();
  app.route("/api/admin", adminRoute);
});

const AUTH = { authorization: "Bearer secret-token" };
const json = (method: string, body: unknown) => ({
  method,
  headers: { ...AUTH, "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("admin console routes", () => {
  it("needs the admin gate", async () => {
    expect((await app.request("/api/admin/usage")).status).toBe(401);
    expect((await app.request("/api/admin/events")).status).toBe(401);
  });

  it("reports LLM usage per meter", async () => {
    const r = await app.request("/api/admin/usage", { headers: AUTH });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d).toHaveProperty("ask");
    expect(d).toHaveProperty("translate");
    for (const m of [d.ask, d.translate]) {
      expect(m.used === null || typeof m.used === "number").toBe(true);
    }
  });

  it("publishes an owner reply under the author's name and journals it", async () => {
    db.insertComment("notes/a", "Lou", "Une question ?", "approved");
    const parent = db.approvedForSlug("notes/a")[0];
    const r = await app.request(`/api/admin/comments/${parent.id}/reply`, json("POST", { body: "  Voilà.  " }));
    expect(r.status).toBe(201);
    const rows = db.approvedForSlug("notes/a");
    const reply = rows.find((c) => c.author === 1);
    expect(reply).toMatchObject({ name: "Martin", body: "Voilà.", reply_to: parent.id, reply_to_name: "Lou" });

    const ev = await (await app.request("/api/admin/events", { headers: AUTH })).json();
    expect(ev.events[0]).toMatchObject({ action: "comment.reply", via: "token" });
  });

  it("refuses an empty reply and a missing parent", async () => {
    expect((await app.request("/api/admin/comments/1/reply", json("POST", { body: "  " }))).status).toBe(400);
    expect((await app.request("/api/admin/comments/9999/reply", json("POST", { body: "x" }))).status).toBe(404);
    expect((await app.request("/api/admin/comments/abc/reply", json("POST", { body: "x" }))).status).toBe(400);
  });

  it("keeps ignored prerequisites on the server, deduplicated", async () => {
    const put = await app.request("/api/admin/prereq-ignored", json("PUT", { keys: ["a>b", "a>b", 3, "c>d"] }));
    expect(await put.json()).toEqual({ keys: ["a>b", "c>d"] });
    const get = await app.request("/api/admin/prereq-ignored", { headers: AUTH });
    expect(await get.json()).toEqual({ keys: ["a>b", "c>d"] });
    expect((await app.request("/api/admin/prereq-ignored", json("PUT", { keys: "x" }))).status).toBe(400);
  });

  it("says when no webhook is configured", async () => {
    const r = await app.request("/api/admin/webhook-test", { method: "POST", headers: AUTH });
    expect(r.status).toBe(503);
  });

  it("returns 30 days of activity with today's comments counted", async () => {
    const r = await app.request("/api/admin/activity", { headers: AUTH });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.days.length).toBeGreaterThanOrEqual(29);
    for (const k of ["questions", "comments", "signups", "active"]) expect(d[k]).toHaveLength(d.days.length);
    expect(d.comments.at(-1)).toBeGreaterThanOrEqual(2);
  });
});

describe("activity buckets", () => {
  it("counts each stamp on its Paris calendar day and drops the rest", async () => {
    const { bucket, lastDays } = await import("./routes/admin-console");
    const now = Date.parse("2026-10-12T10:00:00Z");
    const days = lastDays(3, now);
    expect(days).toEqual(["2026-10-10", "2026-10-11", "2026-10-12"]);
    const stamps = [
      Date.parse("2026-10-11T21:30:00Z"), // 23:30 in Paris: the 11th
      Date.parse("2026-10-11T22:30:00Z"), // 00:30 in Paris: the 12th
      Date.parse("2026-10-12T09:00:00Z"),
      Date.parse("2026-10-01T09:00:00Z"), // outside the window
    ];
    expect(bucket(days, stamps)).toEqual([0, 1, 2]);
  });
});

describe("accounts for the console", () => {
  it("sums only the last 24 h of activity coins and records active days", async () => {
    const { upsertUser, createSession, sessionUser, accountList, activeByDay } = await import("./account-store");
    const d = db.database();
    const now = Date.now();
    const id = upsertUser(d, "busy@example.fr").id;
    const ins = d.prepare(
      "INSERT INTO coin_events (user_id, day, kind, ref, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    ins.run(id, "2026-01-01", "read", "old", 500, now - 3 * 86_400_000);
    ins.run(id, "2026-01-02", "read", "a", 120, now - 3_600_000);
    ins.run(id, "2026-01-02", "purchase", "hat", -40, now - 1_800_000);
    ins.run(id, "2026-01-02", "streak", "2026-01-02", 200, now - 1_000_000);
    const row = accountList(d, 500, now).find((a) => a.id === id);
    expect(row).toMatchObject({ coins: 780, coins24h: 120 });

    // Logging in counts; a later request the same day doesn't count twice.
    const token = createSession(d, id, now);
    d.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(now - 2 * 3_600_000, id);
    sessionUser(d, token, now);
    const days = activeByDay(d, "2000-01-01");
    expect(Object.values(days).reduce((a, b) => a + b, 0)).toBe(1);
  });
});
