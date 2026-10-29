import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  advanceStreak,
  dayIn,
  diffActivity,
  maskEmail,
  normalizeEmail,
  reviewRefKnown,
  safeNext,
  streakView,
  validTimezone,
  EMPTY_STREAK,
  type ContentKnown,
} from "./accounts";
import {
  ACCOUNT_SCHEMA,
  accountStats,
  accountView,
  buy,
  cleanItems,
  consumeLoginToken,
  createLoginToken,
  createSession,
  deleteUser,
  meView,
  sessionUser,
  syncProgress,
  updateMe,
  upsertUser,
  LOGIN_TTL_MS,
  SESSION_TTL_MS,
} from "./account-store";
import { originAllowed } from "./session";
import { loginMail } from "./mail";

describe("login mail", () => {
  it("carries the link in both parts, escaped in the HTML", () => {
    const m = loginMail("https://4d52.net/compte/#login=abc&next=%2F");
    expect(m.text).toContain("https://4d52.net/compte/#login=abc&next=%2F");
    expect(m.html).toContain("login=abc&#38;next=%2F");
    expect(m.subject).toMatch(/connexion/);
    expect(m.html).toContain('lang="fr"');
  });
  it("goes out in the reader's language, right to left in Arabic", () => {
    const en = loginMail("https://4d52.net/compte/#login=abc", "en");
    expect(en.subject).toBe("Your sign-in link for Garden of Knowledge");
    expect(en.text).toContain("Valid for 15 minutes");
    const ar = loginMail("https://4d52.net/compte/#login=abc", "ar");
    expect(ar.html).toContain('dir="rtl"');
  });
});

describe("days", () => {
  it("computes the calendar day in the reader's time zone", () => {
    const t = new Date("2026-10-07T23:30:00Z");
    expect(dayIn("Europe/Paris", t)).toBe("2026-10-08");
    expect(dayIn("America/New_York", t)).toBe("2026-10-07");
    expect(dayIn("Not/AZone", t)).toBe("2026-10-08"); // falls back to Paris
  });
  it("validates time zones", () => {
    expect(validTimezone("Europe/Paris")).toBe("Europe/Paris");
    expect(validTimezone("Nope/Nowhere")).toBeNull();
    expect(validTimezone(42)).toBeNull();
  });
});

describe("streaks", () => {
  it("counts consecutive days and reports milestones", () => {
    let s = EMPTY_STREAK;
    let m: number | null = null;
    for (let d = 1; d <= 7; d++) ({ streak: s, milestone: m } = advanceStreak(s, `2026-01-0${d}`));
    expect(s.current).toBe(7);
    expect(m).toBe(7);
    // Same day again changes nothing.
    expect(advanceStreak(s, "2026-01-07").streak).toBe(s);
  });
  it("bridges missed days with freezes, else restarts", () => {
    const s = { current: 5, best: 5, lastDay: "2026-01-05", freezes: 1 };
    const bridged = advanceStreak(s, "2026-01-07").streak; // one day missed
    expect(bridged).toMatchObject({ current: 6, freezes: 0 });
    const broken = advanceStreak(s, "2026-01-08").streak; // two missed, one freeze
    expect(broken).toMatchObject({ current: 1, best: 5, freezes: 1 });
  });
  it("shows a lapsed run as 0 without consuming anything", () => {
    const s = { current: 4, best: 4, lastDay: "2026-01-05", freezes: 0 };
    expect(streakView(s, "2026-01-06").current).toBe(4);
    expect(streakView(s, "2026-01-07").current).toBe(0);
    expect(streakView({ ...s, freezes: 1 }, "2026-01-07").current).toBe(4);
  });
});

describe("diffActivity", () => {
  it("finds notes newly marked read", () => {
    const before = { a: { p: 1000, t: 1, r: 1 }, b: { p: 500, t: 1 } };
    const after = { a: { p: 1000, t: 2, r: 1 }, b: { p: 1000, t: 2, r: 2 }, c: { p: 1000, t: 2, r: 2 } };
    expect(diffActivity("gkReading", before, after).reads.sort()).toEqual(["b", "c"]);
  });
  it("finds reviewed cards and newly correct questions", () => {
    const card = { ef: 2.5, iv: 1, reps: 1, due: "2026-01-02" };
    const before = { v: 1, cards: { x: card, y: card }, newDay: "", newCount: 0 };
    const after = { ...before, cards: { x: card, y: { ...card, reps: 2, due: "2026-01-08" }, z: card } };
    expect(diffActivity("srs:deck1", before, after).reviews.sort()).toEqual(["srs:deck1#y", "srs:deck1#z"]);
    const q0 = { ...before, cards: {}, items: {}, ok: { q1: "2026-01-01" } };
    const q1 = { ...q0, ok: { q1: "2026-01-01", q2: "2026-01-03" } };
    expect(diffActivity("srs:note:a/b", q0, q1).reviews).toEqual(["srs:note:a/b#q2"]);
  });
  it("pays nothing for other kinds", () => {
    expect(diffActivity("gkKnown", undefined, { a: { t: 1 } })).toEqual({ reads: [], reviews: [] });
  });
});

describe("helpers", () => {
  it("masks and normalises e-mails", () => {
    expect(maskEmail("marie@gmail.com")).toBe("ma•••@gmail.com");
    expect(maskEmail("jo@x.fr")).toBe("j•••@x.fr");
    expect(normalizeEmail("  Marie@Gmail.COM ")).toBe("marie@gmail.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("a b@c.fr")).toBeNull();
    expect(normalizeEmail("a(x(y)z)@c.fr")).toBeNull();
    expect(normalizeEmail("a\\b@c.fr")).toBeNull();
  });
  it("keeps only same-site redirect paths", () => {
    expect(safeNext("/posts/a/")).toBe("/posts/a/");
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/\\evil.com")).toBeNull();
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("/a\r\nSet-Cookie: x")).toBeNull();
  });
  it("checks the Origin against the site or the request's host", () => {
    expect(originAllowed("https://4d52.net", "internal:8085", "https://4d52.net")).toBe(true);
    expect(originAllowed("http://localhost:8085", "localhost:8085", "https://4d52.net")).toBe(true);
    expect(originAllowed("https://evil.com", "localhost:8085", "https://4d52.net")).toBe(false);
    expect(originAllowed(undefined, "localhost:8085", "https://4d52.net")).toBe(false);
    expect(originAllowed("null", "localhost:8085", "https://4d52.net")).toBe(false);
  });
});

describe("reviewRefKnown", () => {
  const known: ContentKnown = { hasNote: (s) => s === "a/b", hasDeck: (s) => s === "deck1", available: true };
  it("pays only reviews whose key points at a real note or deck", () => {
    expect(reviewRefKnown("srs:note:a/b#q2", known)).toBe(true);
    expect(reviewRefKnown("srs:deck1#c3", known)).toBe(true);
    expect(reviewRefKnown("srs:note:ghost#q2", known)).toBe(false);
    expect(reviewRefKnown("srs:ghostdeck#c3", known)).toBe(false);
    expect(reviewRefKnown("weird#x", known)).toBe(false);
  });
});

// --- database -----------------------------------------------------------------

let db: Database.Database;
const T0 = Date.parse("2026-10-07T10:00:00Z");
const DAY = 86_400_000;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(ACCOUNT_SCHEMA);
});

const reading = (slugs: string[], t = 100) =>
  Object.fromEntries(slugs.map((s) => [s, { p: 1000, t, r: t }]));

describe("login tokens and sessions", () => {
  it("are single use and expire", () => {
    const tok = createLoginToken(db, "a@b.fr", T0);
    expect(consumeLoginToken(db, tok, T0 + 1000)).toBe("a@b.fr");
    expect(consumeLoginToken(db, tok, T0 + 2000)).toBeNull();
    const old = createLoginToken(db, "a@b.fr", T0);
    expect(consumeLoginToken(db, old, T0 + LOGIN_TTL_MS + 1)).toBeNull();
  });
  it("stores only hashes", () => {
    const tok = createLoginToken(db, "a@b.fr", T0);
    const { id } = upsertUser(db, "a@b.fr", T0);
    const sess = createSession(db, id, T0);
    const dump = JSON.stringify([db.prepare("SELECT * FROM login_tokens").all(), db.prepare("SELECT * FROM sessions").all()]);
    expect(dump).not.toContain(tok);
    expect(dump).not.toContain(sess);
  });
  it("slide when past half their life and die when expired", () => {
    const { id } = upsertUser(db, "a@b.fr", T0);
    const sess = createSession(db, id, T0);
    expect(sessionUser(db, sess, T0 + DAY)).toEqual({ userId: id, refreshed: false });
    expect(sessionUser(db, sess, T0 + 20 * DAY)).toEqual({ userId: id, refreshed: true });
    // Refreshed at day 20 → valid until day 50; used (and refreshed) at 45.
    expect(sessionUser(db, sess, T0 + 45 * DAY)?.userId).toBe(id);
    expect(sessionUser(db, sess, T0 + 45 * DAY + SESSION_TTL_MS + 1)).toBeNull();
    expect(sessionUser(db, "garbage", T0)).toBeNull();
  });
  it("upserts users by e-mail", () => {
    const a = upsertUser(db, "a@b.fr", T0);
    const b = upsertUser(db, "a@b.fr", T0);
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
  });
});

describe("sync and coins", () => {
  it("imports the first sync for free, with a welcome bonus", () => {
    const { id } = upsertUser(db, "a@b.fr", T0);
    const big = cleanItems({ gkReading: reading(Array.from({ length: 300 }, (_, i) => `n${i}`)) })!;
    const r = syncProgress(db, id, big, T0);
    expect(r.earned).toEqual([{ kind: "welcome", amount: 50, ref: "" }]);
    expect(r.coins).toBe(50);
    expect(Object.keys(r.items.gkReading as object)).toHaveLength(300);
    // Syncing the same thing again pays nothing.
    expect(syncProgress(db, id, big, T0 + 1000).earned).toEqual([]);
  });

  it("pays a new read note once, plus the active day, and starts the streak", () => {
    const { id } = upsertUser(db, "a@b.fr", T0);
    syncProgress(db, id, {}, T0);
    const r = syncProgress(db, id, cleanItems({ gkReading: reading(["x"]) })!, T0 + 1000);
    expect(r.earned).toEqual([
      { kind: "read", amount: 5, ref: "x" },
      { kind: "active", amount: 10, ref: "" },
    ]);
    expect(r.coins).toBe(65);
    expect(r.streak).toMatchObject({ current: 1, best: 1, lastDay: "2026-10-07" });

    // The entry loses `r` (a newer visit from another device), then regains
    // it on a later day: the note never pays twice.
    syncProgress(db, id, { gkReading: { x: { p: 10, t: 200 } } }, T0 + DAY);
    const again = syncProgress(db, id, { gkReading: { x: { p: 1000, t: 300, r: 300 } } }, T0 + DAY + 1000);
    expect(again.earned.map((e) => e.kind)).toEqual(["active"]);
    expect(again.streak.current).toBe(2);
  });

  it("caps reads and reviews per day", () => {
    const { id } = upsertUser(db, "a@b.fr", T0);
    syncProgress(db, id, {}, T0);
    const r = syncProgress(db, id, cleanItems({ gkReading: reading(Array.from({ length: 15 }, (_, i) => `n${i}`)) })!, T0);
    expect(r.earned.filter((e) => e.kind === "read")).toHaveLength(10);
    const card = { ef: 2.5, iv: 1, reps: 1, due: "2026-10-08" };
    const cards = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`c${i}`, card]));
    const r2 = syncProgress(db, id, cleanItems({ "srs:deck": { v: 1, cards, newDay: "", newCount: 0 } })!, T0);
    expect(r2.earned.filter((e) => e.kind === "review")).toHaveLength(50);
    expect(r2.earned.some((e) => e.kind === "active")).toBe(false); // already paid today
    // The five held-back notes pay the next day.
    const r3 = syncProgress(db, id, cleanItems({ gkReading: reading(["n0", "late"], 500) })!, T0 + DAY);
    expect(r3.earned.filter((e) => e.kind === "read").map((e) => e.ref)).toEqual(["late"]);
  });

  it("pays only for content in the manifest, when one is loaded", () => {
    const { id } = upsertUser(db, "a@b.fr", T0);
    const known: ContentKnown = {
      hasNote: (s) => s === "real-note",
      hasDeck: (s) => s === "real-deck",
      available: true,
    };
    syncProgress(db, id, {}, T0, known); // first sync: welcome only, imported = 1

    // Fabricated note slugs and a fabricated SRS key earn nothing (they still
    // sync — they're just not paid).
    const fake = syncProgress(
      db,
      id,
      cleanItems({
        gkReading: reading(["ghost-1", "ghost-2"]),
        "srs:note:does-not-exist": { ok: { q1: "2026-10-07" } },
      })!,
      T0 + 1000,
      known,
    );
    expect(fake.earned).toEqual([]);
    expect(fake.coins).toBe(50);

    // A real note read and a review under a real deck do pay (plus the active day).
    const card = { ef: 2.5, iv: 1, reps: 1, due: "2026-10-08" };
    const good = syncProgress(
      db,
      id,
      cleanItems({
        gkReading: reading(["real-note"]),
        "srs:real-deck": { v: 1, cards: { c1: card }, newDay: "", newCount: 0 },
      })!,
      T0 + 2000,
      known,
    );
    expect(good.earned.filter((e) => e.kind === "read").map((e) => e.ref)).toEqual(["real-note"]);
    expect(good.earned.some((e) => e.kind === "review")).toBe(true);
    expect(good.earned.some((e) => e.kind === "active")).toBe(true);
  });

  it("pays the 7-day milestone", () => {
    const { id } = upsertUser(db, "a@b.fr", T0);
    syncProgress(db, id, {}, T0);
    let last;
    for (let d = 0; d < 7; d++) last = syncProgress(db, id, cleanItems({ gkReading: reading([`d${d}`], 100 + d) })!, T0 + d * DAY);
    expect(last!.streak.current).toBe(7);
    expect(last!.earned).toContainEqual({ kind: "streak", amount: 50, ref: "2026-10-13" });
  });

  it("drops invalid keys and values", () => {
    expect(cleanItems({ theme: "dark", gkReading: { a: { p: "x" } } })).toEqual({});
    expect(cleanItems([])).toBeNull();
  });
});

describe("shop, look and account", () => {
  it("buys items and freezes against the balance", () => {
    const { id } = upsertUser(db, "a@b.fr", T0);
    syncProgress(db, id, {}, T0); // 50 coins
    expect(buy(db, id, "hat-beret", T0)).toEqual({ ok: false, error: "insufficient" });
    expect(buy(db, id, "nope", T0)).toEqual({ ok: false, error: "unknown" });
    expect(buy(db, id, "body-leaf", T0)).toEqual({ ok: false, error: "unknown" }); // free
    db.prepare("INSERT INTO coin_events (user_id, day, kind, ref, amount, created_at) VALUES (?, '2026-10-07', 'test', '', 400, 0)").run(id);
    const r = buy(db, id, "hat-beret", T0);
    expect(r).toEqual({ ok: true, coins: 370, owned: ["hat-beret"], freezes: 0 });
    expect(buy(db, id, "hat-beret", T0)).toEqual({ ok: false, error: "owned" });
    expect(buy(db, id, "streak-freeze", T0)).toMatchObject({ ok: true, coins: 270, freezes: 1 });
    expect(buy(db, id, "streak-freeze", T0)).toMatchObject({ ok: true, coins: 170, freezes: 2 });
    expect(buy(db, id, "streak-freeze", T0)).toEqual({ ok: false, error: "max-freezes" });

    updateMe(db, id, { look: { hat: "hat-beret", body: "body-ink" }, timezone: "America/New_York" });
    const me = meView(db, id, T0)!;
    expect(me.look.hat).toBe("hat-beret");
    expect(me.look.body).not.toBe("body-ink"); // not owned
    expect(me.timezone).toBe("America/New_York");
    expect(me.email).toBe("a•••@b.fr");

    const acc = accountView(db, id, T0)!;
    expect(acc.coins).toBe(170);
    expect(acc.ledger[0]).toMatchObject({ kind: "purchase", amount: -100 });
    expect(acc.activity["2026-10-07"]).toBe(450);
  });

  it("deleting the user removes everything and stats stay aggregate", () => {
    const { id } = upsertUser(db, "a@b.fr", T0);
    createSession(db, id, T0);
    syncProgress(db, id, cleanItems({ gkReading: reading(["x"]) })!, T0);
    expect(accountStats(db, T0)).toEqual({ accounts: 1, active7d: 1, coinsInCirculation: 50 });
    deleteUser(db, id);
    for (const t of ["sessions", "progress", "coin_events", "streaks", "owned_items"]) {
      expect((db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n).toBe(0);
    }
  });
});
