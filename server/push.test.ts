import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { dueCount, hourIn, parseSubscription, reminderPayload, shouldSend, validHour } from "./push";
import { ACCOUNT_SCHEMA, deleteUser, upsertUser } from "./account-store";
import {
  PUSH_SCHEMA,
  allSubscriptions,
  deckValues,
  markFailed,
  markSent,
  scheduleOf,
  subscriptionFor,
  upsertSubscription,
} from "./push-store";

const H = 3_600_000;
// 2026-10-19 06:00 UTC = 08:00 in Paris (CEST).
const T = Date.parse("2026-10-19T06:00:00Z");

describe("hourIn", () => {
  it("is the local hour", () => {
    expect(hourIn("Europe/Paris", new Date(T))).toBe(8);
    expect(hourIn("UTC", new Date(T))).toBe(6);
    expect(hourIn("Nowhere/Bogus", new Date(T))).toBe(6);
  });
});

describe("shouldSend", () => {
  const base = { hour: 8, tz: "Europe/Paris", lastSentAt: null, updatedAt: T - 3 * 24 * H };
  it("waits for the chosen local hour", () => {
    expect(shouldSend(base, T - H)).toBe(false);
    expect(shouldSend(base, T)).toBe(true);
    expect(shouldSend(base, T + 10 * H)).toBe(true);
  });
  it("sends once a local day", () => {
    expect(shouldSend({ ...base, lastSentAt: T }, T + 2 * H)).toBe(false);
    // Yesterday's send doesn't count.
    expect(shouldSend({ ...base, lastSentAt: T - 24 * H }, T)).toBe(true);
  });
  it("doesn't fire at once when the hour was already past when chosen", () => {
    expect(shouldSend({ ...base, updatedAt: T + 2 * H }, T + 3 * H)).toBe(false);
    expect(shouldSend({ ...base, updatedAt: T + 2 * H }, T + 24 * H)).toBe(true);
    // Chosen earlier the same day, before the hour: today counts.
    expect(shouldSend({ ...base, updatedAt: T - 2 * H }, T)).toBe(true);
  });
  it("uses the reader's day, not UTC's", () => {
    // 23:30 UTC on the 18th is already the 19th, 01:30, in Paris.
    const late = Date.parse("2026-10-18T23:30:00Z");
    const s = { hour: 1, tz: "Europe/Paris", lastSentAt: Date.parse("2026-10-18T05:00:00Z"), updatedAt: 0 };
    expect(shouldSend(s, late)).toBe(true);
  });
});

describe("dueCount", () => {
  const deck = (cards: Record<string, { due: string; sus?: 1 }>) =>
    JSON.stringify({
      v: 1,
      newDay: "",
      newCount: 0,
      cards: Object.fromEntries(
        Object.entries(cards).map(([k, c]) => [k, { s: 1, d: 5, iv: 1, reps: 1, lapses: 0, last: "2026-10-01", ...c }]),
      ),
    });
  it("counts due and overdue cards, not suspended or future ones", () => {
    const v = [
      deck({ a: { due: "2026-10-19" }, b: { due: "2026-10-01" }, c: { due: "2026-10-20" }, d: { due: "2026-10-10", sus: 1 } }),
      deck({ e: { due: "2026-10-18" } }),
    ];
    expect(dueCount(v, "2026-10-19")).toBe(3);
  });
  it("is null without any deck, 0 with nothing due", () => {
    expect(dueCount([], "2026-10-19")).toBeNull();
    expect(dueCount([deck({ a: { due: "2026-12-01" } })], "2026-10-19")).toBe(0);
    expect(dueCount(["garbage"], "2026-10-19")).toBe(0);
  });
});

describe("reminderPayload", () => {
  it("says how many cards wait, in the reader's language", () => {
    const p = reminderPayload(12, "fr", "https://x.net");
    expect(p.web_push).toBe(8030);
    expect(p.notification.body).toContain("12");
    expect(p.notification.navigate).toBe("https://x.net/cartes/");
    expect(p.app_badge).toBe(12);
    expect(reminderPayload(1, "en", "https://x.net").notification.body).toContain("1");
  });
  it("falls back to a generic line", () => {
    const p = reminderPayload(null, "fr", "https://x.net");
    expect(p.notification.body).not.toMatch(/\d/);
    expect(p.app_badge).toBeUndefined();
  });
});

describe("input checks", () => {
  it("validHour", () => {
    expect(validHour(0)).toBe(0);
    expect(validHour(23)).toBe(23);
    expect(validHour(24)).toBeNull();
    expect(validHour("8")).toBeNull();
    expect(validHour(7.5)).toBeNull();
  });
  it("parseSubscription accepts only known push services", () => {
    const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys })).not.toBeNull();
    expect(parseSubscription({ endpoint: "https://web.push.apple.com/QG", keys })).not.toBeNull();
    expect(parseSubscription({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x", keys })).not.toBeNull();
    expect(parseSubscription({ endpoint: "https://evil.example/fcm.googleapis.com", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com.evil.example/x", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "http://fcm.googleapis.com/x", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com:444/x", keys })).toBeNull();
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a b", auth: "x" } })).toBeNull();
  });
});

describe("push store", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(ACCOUNT_SCHEMA);
    db.exec(PUSH_SCHEMA);
  });
  const sub = (userId: number, hour = 8) => ({
    endpoint: "https://fcm.googleapis.com/fcm/send/1",
    userId,
    p256dh: "k",
    auth: "a",
    hour,
    tz: "Europe/Paris",
    locale: "fr",
  });
  it("upserts per endpoint and resets the failures", () => {
    const a = upsertUser(db, "a@b.fr").id;
    upsertSubscription(db, sub(a), 100);
    markFailed(db, sub(a).endpoint);
    markSent(db, sub(a).endpoint, 150);
    upsertSubscription(db, sub(a, 19), 200);
    const [row] = allSubscriptions(db);
    expect(row.hour).toBe(19);
    expect(row.failures).toBe(0);
    expect(row.created_at).toBe(100);
    expect(scheduleOf(row)).toEqual({ hour: 19, tz: "Europe/Paris", lastSentAt: 150, updatedAt: 200 });
    expect(subscriptionFor(db, sub(a).endpoint, a)).toEqual({ hour: 19 });
  });
  it("goes with the account; reads only deck progress", () => {
    const a = upsertUser(db, "a@b.fr").id;
    upsertSubscription(db, sub(a));
    const ins = db.prepare("INSERT INTO progress (user_id, key, value, updated_at) VALUES (?, ?, ?, 0)");
    ins.run(a, "srs:deck-1", "D1");
    ins.run(a, "srs:note:x", "N1");
    ins.run(a, "srs:probe", "P");
    ins.run(a, "gkReading", "R");
    expect(deckValues(db, a).sort()).toEqual(["D1", "N1"]);
    deleteUser(db, a);
    expect(allSubscriptions(db)).toEqual([]);
  });
});
