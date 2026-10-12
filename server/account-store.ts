// Reader accounts: the SQLite side. Every function takes the database handle,
// so the tests run them against an in-memory file with the same schema
// (ACCOUNT_SCHEMA, executed by db.ts's initDb). The rules themselves (days,
// streaks, what counts as a review) are in server/accounts.ts.

import type Database from "better-sqlite3";
import {
  FORMAT,
  VERSION,
  mergeValue,
  validateImport,
} from "../lib/progress-transfer.ts";
import {
  ITEM_BY_ID,
  ITEMS,
  MAX_FREEZES,
  STREAK_FREEZE,
  sanitizeLook,
  type Look,
} from "../lib/avatar.ts";
import {
  COINS,
  DAILY_MAX,
  DEFAULT_TZ,
  EMPTY_STREAK,
  MILESTONES,
  addDays,
  advanceStreak,
  dayIn,
  diffActivity,
  hashToken,
  maskEmail,
  newToken,
  reviewRefKnown,
  streakView,
  type ContentKnown,
  type Streak,
} from "./accounts.ts";
import { contentKnown } from "./content-manifest.ts";

type DB = Database.Database;

export const LOGIN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 86_400_000;
/** A session used with less than this left is pushed back to SESSION_TTL_MS. */
export const SESSION_REFRESH_MS = 15 * 86_400_000;
/** Most progress keys one account may hold (one per Anki deck, one per note
 *  with saved questions, plus a handful of singletons). */
export const MAX_KEYS_PER_USER = 3000;
/** Longest stored value for one key, JSON characters. */
export const MAX_VALUE_CHARS = 1_000_000;

export const ACCOUNT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    timezone TEXT NOT NULL DEFAULT '${DEFAULT_TZ}',
    look TEXT,
    -- 0 until the first progress sync, which imports the device's history
    -- without paying for it (and pays the welcome bonus instead).
    imported INTEGER NOT NULL DEFAULT 0,
    last_seen INTEGER
  );
  CREATE TABLE IF NOT EXISTS login_tokens (
    hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_login_tokens_expires ON login_tokens(expires_at);
  CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  -- Append-only ledger; the balance is SUM(amount). The UNIQUE constraint is
  -- what makes paying idempotent (INSERT OR IGNORE).
  CREATE TABLE IF NOT EXISTS coin_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, kind, day, ref)
  );
  CREATE INDEX IF NOT EXISTS idx_coin_events_kind_ref ON coin_events(user_id, kind, ref);
  CREATE INDEX IF NOT EXISTS idx_coin_events_day ON coin_events(user_id, day);
  CREATE TABLE IF NOT EXISTS streaks (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current INTEGER NOT NULL DEFAULT 0,
    best INTEGER NOT NULL DEFAULT 0,
    last_day TEXT,
    freezes INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS owned_items (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );
`;

// --- login tokens, users, sessions ------------------------------------------

/** A fresh single-use login token for `email` (the raw token: it goes in the
 *  link and is never stored). Sweeps expired ones on the way. */
export function createLoginToken(db: DB, email: string, now = Date.now()): string {
  db.prepare("DELETE FROM login_tokens WHERE expires_at <= ?").run(now);
  const token = newToken();
  db.prepare("INSERT INTO login_tokens (hash, email, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    email,
    now + LOGIN_TTL_MS,
  );
  return token;
}

/** The token's e-mail if it is valid; the token is gone either way. */
export function consumeLoginToken(db: DB, token: string, now = Date.now()): string | null {
  if (!token || token.length > 200) return null;
  const row = db
    .prepare("DELETE FROM login_tokens WHERE hash = ? RETURNING email, expires_at")
    .get(hashToken(token)) as { email: string; expires_at: number } | undefined;
  return row && row.expires_at > now ? row.email : null;
}

/** The user id for `email`, creating the account on first login. */
export function upsertUser(db: DB, email: string, now = Date.now()): { id: number; created: boolean } {
  const r = db
    .prepare("INSERT INTO users (email, created_at, last_seen) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .run(email, now, now);
  const row = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number };
  return { id: row.id, created: r.changes > 0 };
}

export function createSession(db: DB, userId: number, now = Date.now()): string {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  const token = newToken();
  db.prepare("INSERT INTO sessions (hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    hashToken(token),
    userId,
    now,
    now + SESSION_TTL_MS,
  );
  return token;
}

/** The session's user, or null. `refreshed`: the expiry was just pushed back
 *  (the caller re-sends the cookie with a fresh Max-Age). */
export function sessionUser(
  db: DB,
  token: string | undefined,
  now = Date.now(),
): { userId: number; refreshed: boolean } | null {
  if (!token || token.length > 200) return null;
  const hash = hashToken(token);
  const row = db.prepare("SELECT user_id, expires_at FROM sessions WHERE hash = ?").get(hash) as
    | { user_id: number; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare("DELETE FROM sessions WHERE hash = ?").run(hash);
    return null;
  }
  let refreshed = false;
  if (row.expires_at - now < SESSION_REFRESH_MS) {
    db.prepare("UPDATE sessions SET expires_at = ? WHERE hash = ?").run(now + SESSION_TTL_MS, hash);
    refreshed = true;
  }
  // last_seen feeds the admin's "active in the last 7 days"; an hour's
  // resolution is plenty and spares a write per request.
  db.prepare("UPDATE users SET last_seen = ? WHERE id = ? AND (last_seen IS NULL OR last_seen < ?)").run(
    now,
    row.user_id,
    now - 3_600_000,
  );
  return { userId: row.user_id, refreshed };
}

export function deleteSession(db: DB, token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE hash = ?").run(hashToken(token));
}

/** Deletes the account and, by cascade, its sessions, progress, ledger,
 *  streak and items. */
export function deleteUser(db: DB, userId: number): void {
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

// --- reads --------------------------------------------------------------------

interface UserRow {
  id: number;
  email: string;
  created_at: number;
  timezone: string;
  look: string | null;
  imported: number;
}

function userRow(db: DB, userId: number): UserRow | null {
  return (
    (db
      .prepare("SELECT id, email, created_at, timezone, look, imported FROM users WHERE id = ?")
      .get(userId) as UserRow | undefined) ?? null
  );
}

export function balance(db: DB, userId: number): number {
  return (
    db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM coin_events WHERE user_id = ?").get(userId) as {
      n: number;
    }
  ).n;
}

export function getStreak(db: DB, userId: number): Streak {
  const row = db
    .prepare("SELECT current, best, last_day, freezes FROM streaks WHERE user_id = ?")
    .get(userId) as { current: number; best: number; last_day: string | null; freezes: number } | undefined;
  return row
    ? { current: row.current, best: row.best, lastDay: row.last_day, freezes: row.freezes }
    : { ...EMPTY_STREAK };
}

function saveStreak(db: DB, userId: number, s: Streak): void {
  db.prepare(
    "INSERT INTO streaks (user_id, current, best, last_day, freezes) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(user_id) DO UPDATE SET current = excluded.current, best = excluded.best, " +
      "last_day = excluded.last_day, freezes = excluded.freezes",
  ).run(userId, s.current, s.best, s.lastDay, s.freezes);
}

export function ownedItems(db: DB, userId: number): string[] {
  return (
    db.prepare("SELECT item_id FROM owned_items WHERE user_id = ? ORDER BY created_at, item_id").all(userId) as {
      item_id: string;
    }[]
  ).map((r) => r.item_id);
}

function lookOf(db: DB, user: UserRow): Look {
  let saved: unknown = null;
  try {
    saved = user.look ? JSON.parse(user.look) : null;
  } catch {
    /* fall back to the default look */
  }
  return sanitizeLook(saved, ownedItems(db, user.id), user.id);
}

function todayCoins(db: DB, userId: number, day: string): number {
  return (
    db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM coin_events WHERE user_id = ? AND day = ? AND amount > 0")
      .get(userId, day) as { n: number }
  ).n;
}

export interface MeView {
  id: number;
  email: string;
  createdAt: number;
  timezone: string;
  look: Look;
  coins: number;
  streak: Streak;
  todayCoins: number;
}

export function meView(db: DB, userId: number, now = Date.now()): MeView | null {
  const u = userRow(db, userId);
  if (!u) return null;
  const day = dayIn(u.timezone, new Date(now));
  return {
    id: u.id,
    email: maskEmail(u.email),
    createdAt: u.created_at,
    timezone: u.timezone,
    look: lookOf(db, u),
    coins: balance(db, userId),
    streak: streakView(getStreak(db, userId), day),
    todayCoins: todayCoins(db, userId, day),
  };
}

/** Save the time zone (already validated) and/or a look (sanitised here
 *  against what the user owns). */
export function updateMe(db: DB, userId: number, patch: { timezone?: string; look?: unknown }): void {
  if (patch.timezone) db.prepare("UPDATE users SET timezone = ? WHERE id = ?").run(patch.timezone, userId);
  if (patch.look !== undefined) {
    const look = sanitizeLook(patch.look, ownedItems(db, userId), userId);
    db.prepare("UPDATE users SET look = ? WHERE id = ?").run(JSON.stringify(look), userId);
  }
}

// --- progress sync and coins --------------------------------------------------

export interface Earned {
  kind: string;
  amount: number;
  ref: string;
}

export interface SyncResult {
  items: Record<string, unknown>;
  coins: number;
  streak: Streak;
  earned: Earned[];
}

/** Incoming `items` → only the valid progress, sanitised exactly as a file
 *  import is (lib/progress-transfer.ts), so any kind the front end adds to
 *  PROGRESS_KEYS syncs with no change here. */
export function cleanItems(items: unknown): Record<string, unknown> | null {
  if (!items || typeof items !== "object" || Array.isArray(items)) return null;
  const v = validateImport({ format: FORMAT, version: VERSION, exportedAt: "", items });
  if (v.ok) return v.file.items;
  return v.error === "empty" ? {} : null;
}

function award(db: DB, userId: number, day: string, kind: string, ref: string, amount: number, now: number): boolean {
  return (
    db
      .prepare(
        "INSERT OR IGNORE INTO coin_events (user_id, day, kind, ref, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(userId, day, kind, ref, amount, now).changes > 0
  );
}

function countToday(db: DB, userId: number, kind: string, day: string): number {
  return (
    db.prepare("SELECT count(*) AS n FROM coin_events WHERE user_id = ? AND kind = ? AND day = ?").get(
      userId,
      kind,
      day,
    ) as { n: number }
  ).n;
}

function payActivity(
  db: DB,
  userId: number,
  day: string,
  reads: string[],
  reviews: string[],
  now: number,
): Earned[] {
  const earned: Earned[] = [];
  const paidBefore = db.prepare("SELECT 1 FROM coin_events WHERE user_id = ? AND kind = 'read' AND ref = ? LIMIT 1");
  let n = countToday(db, userId, "read", day);
  for (const slug of new Set(reads)) {
    if (n >= DAILY_MAX.read) break;
    if (paidBefore.get(userId, slug)) continue; // a note pays once, ever
    if (award(db, userId, day, "read", slug, COINS.read, now)) {
      n++;
      earned.push({ kind: "read", amount: COINS.read, ref: slug });
    }
  }
  n = countToday(db, userId, "review", day);
  for (const ref of new Set(reviews)) {
    if (n >= DAILY_MAX.review) break;
    if (award(db, userId, day, "review", ref, COINS.review, now)) {
      n++;
      earned.push({ kind: "review", amount: COINS.review, ref });
    }
  }
  if ((reads.length || reviews.length) && award(db, userId, day, "active", "", COINS.active, now)) {
    earned.push({ kind: "active", amount: COINS.active, ref: "" });
    const { streak, milestone } = advanceStreak(getStreak(db, userId), day);
    saveStreak(db, userId, streak);
    if (milestone && award(db, userId, day, "streak", day, MILESTONES[milestone], now)) {
      earned.push({ kind: "streak", amount: MILESTONES[milestone], ref: day });
    }
  }
  return earned;
}

/**
 * Merge a device's progress into the stored copy, key by key (the same merge
 * rules as a file import), store what changed, and pay for what the merge
 * newly brought. The very first sync of an account imports the device's
 * history as is and pays only the welcome bonus. Returns everything stored,
 * so the device can adopt the merged state.
 */
export function syncProgress(
  db: DB,
  userId: number,
  incoming: Record<string, unknown>,
  now = Date.now(),
  known: ContentKnown = contentKnown(),
): SyncResult {
  return db.transaction((): SyncResult => {
    const user = userRow(db, userId);
    if (!user) throw new Error("no such user");
    const day = dayIn(user.timezone, new Date(now));
    const stored = new Map<string, unknown>();
    for (const r of db.prepare("SELECT key, value FROM progress WHERE user_id = ?").all(userId) as {
      key: string;
      value: string;
    }[]) {
      try {
        stored.set(r.key, JSON.parse(r.value));
      } catch {
        /* unreadable row: the incoming copy replaces it */
      }
    }
    const upsert = db.prepare(
      "INSERT INTO progress (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    );
    const reads: string[] = [];
    const reviews: string[] = [];
    for (const [key, value] of Object.entries(incoming)) {
      const before = stored.get(key);
      if (before === undefined && stored.size >= MAX_KEYS_PER_USER) continue;
      const after = before === undefined ? value : mergeValue(key, before, value);
      const json = JSON.stringify(after);
      if (json.length > MAX_VALUE_CHARS) continue;
      if (before !== undefined && json === JSON.stringify(before)) continue;
      upsert.run(userId, key, json, now);
      stored.set(key, after);
      const a = diffActivity(key, before, after);
      reads.push(...a.reads);
      reviews.push(...a.reviews);
    }

    let earned: Earned[];
    if (!user.imported) {
      db.prepare("UPDATE users SET imported = 1 WHERE id = ?").run(userId);
      earned = award(db, userId, day, "welcome", "", COINS.welcome, now)
        ? [{ kind: "welcome", amount: COINS.welcome, ref: "" }]
        : [];
    } else {
      // Only pay for activity on content that actually exists: a read of a real
      // note slug, a review whose key points at a real note or deck. Fabricated
      // slugs/keys still sync (they're stored above) but earn nothing. With no
      // manifest (dev, no build) `known` passes everything, so this is a no-op.
      const paidReads = reads.filter((slug) => known.hasNote(slug));
      const paidReviews = reviews.filter((ref) => reviewRefKnown(ref, known));
      earned = payActivity(db, userId, day, paidReads, paidReviews, now);
    }
    return {
      items: Object.fromEntries([...stored].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      coins: balance(db, userId),
      streak: streakView(getStreak(db, userId), day),
      earned,
    };
  })();
}

// --- account page -------------------------------------------------------------

export interface AccountView {
  coins: number;
  ledger: { day: string; kind: string; ref: string; amount: number }[];
  streak: Streak;
  owned: string[];
  look: Look;
  activity: Record<string, number>;
  stats: { notesRead: number; reviews: number; activeDays: number };
}

export function accountView(db: DB, userId: number, now = Date.now()): AccountView | null {
  const u = userRow(db, userId);
  if (!u) return null;
  const day = dayIn(u.timezone, new Date(now));
  const ledger = db
    .prepare("SELECT day, kind, ref, amount FROM coin_events WHERE user_id = ? ORDER BY id DESC LIMIT 50")
    .all(userId) as AccountView["ledger"];
  const activity: Record<string, number> = {};
  for (const r of db
    .prepare(
      "SELECT day, SUM(amount) AS n FROM coin_events WHERE user_id = ? AND amount > 0 AND day >= ? " +
        "GROUP BY day ORDER BY day",
    )
    .all(userId, addDays(day, -364)) as { day: string; n: number }[]) {
    activity[r.day] = r.n;
  }
  const count = (kind: string) =>
    (db.prepare("SELECT count(*) AS n FROM coin_events WHERE user_id = ? AND kind = ?").get(userId, kind) as {
      n: number;
    }).n;
  let notesRead = 0;
  const reading = db.prepare("SELECT value FROM progress WHERE user_id = ? AND key = 'gkReading'").get(userId) as
    | { value: string }
    | undefined;
  if (reading) {
    try {
      for (const e of Object.values(JSON.parse(reading.value) as Record<string, { r?: unknown }>))
        if (e && e.r != null) notesRead++;
    } catch {
      /* counted as 0 */
    }
  }
  return {
    coins: balance(db, userId),
    ledger,
    streak: streakView(getStreak(db, userId), day),
    owned: ownedItems(db, userId),
    look: lookOf(db, u),
    activity,
    stats: { notesRead, reviews: count("review"), activeDays: count("active") },
  };
}

// --- shop ---------------------------------------------------------------------

export interface ShopView {
  items: { id: string; slot: string; name: string; price: number; owned: boolean }[];
  freeze: { id: string; price: number; held: number; max: number };
  coins: number | null;
}

/** The catalogue; `userId` null = logged out (only the free parts are owned). */
export function shopView(db: DB, userId: number | null): ShopView {
  const owned = new Set(userId ? ownedItems(db, userId) : []);
  return {
    items: ITEMS.map((i) => ({ ...i, owned: i.price === 0 || owned.has(i.id) })),
    freeze: {
      id: STREAK_FREEZE.id,
      price: STREAK_FREEZE.price,
      held: userId ? getStreak(db, userId).freezes : 0,
      max: MAX_FREEZES,
    },
    coins: userId ? balance(db, userId) : null,
  };
}

export type BuyResult =
  | { ok: true; coins: number; owned: string[]; freezes: number }
  | { ok: false; error: "unknown" | "owned" | "max-freezes" | "insufficient" };

/** Buy one item or one streak freeze. Balance check and debit in one
 *  transaction, so two concurrent purchases can't both spend the same coins. */
export function buy(db: DB, userId: number, id: string, now = Date.now()): BuyResult {
  return db.transaction((): BuyResult => {
    const u = userRow(db, userId);
    if (!u) return { ok: false, error: "unknown" };
    const day = dayIn(u.timezone, new Date(now));
    const coins = balance(db, userId);
    if (id === STREAK_FREEZE.id) {
      const s = getStreak(db, userId);
      if (s.freezes >= MAX_FREEZES) return { ok: false, error: "max-freezes" };
      if (coins < STREAK_FREEZE.price) return { ok: false, error: "insufficient" };
      // Several freezes may be bought the same day: number the ref so the
      // ledger's UNIQUE(user, kind, day, ref) keeps them apart.
      const n = (
        db
          .prepare("SELECT count(*) AS n FROM coin_events WHERE user_id = ? AND kind = 'purchase' AND day = ? AND ref LIKE ?")
          .get(userId, day, `${STREAK_FREEZE.id}%`) as { n: number }
      ).n;
      award(db, userId, day, "purchase", n ? `${STREAK_FREEZE.id}#${n + 1}` : STREAK_FREEZE.id, -STREAK_FREEZE.price, now);
      saveStreak(db, userId, { ...s, freezes: s.freezes + 1 });
    } else {
      const item = ITEM_BY_ID.get(id);
      if (!item || item.price <= 0) return { ok: false, error: "unknown" };
      const have = db.prepare("SELECT 1 FROM owned_items WHERE user_id = ? AND item_id = ?").get(userId, id);
      if (have) return { ok: false, error: "owned" };
      if (coins < item.price) return { ok: false, error: "insufficient" };
      award(db, userId, day, "purchase", id, -item.price, now);
      db.prepare("INSERT INTO owned_items (user_id, item_id, created_at) VALUES (?, ?, ?)").run(userId, id, now);
    }
    return {
      ok: true,
      coins: balance(db, userId),
      owned: ownedItems(db, userId),
      freezes: getStreak(db, userId).freezes,
    };
  })();
}

// --- admin ----------------------------------------------------------------------

/** The account behind a session, for the admin check: its e-mail and when the
 *  session was created (admin rights need a recent login). */
export function sessionAccount(
  db: DB,
  token: string | undefined,
): { email: string; createdAt: number } | null {
  if (!token || token.length > 200) return null;
  const row = db
    .prepare(
      "SELECT u.email AS email, s.created_at AS createdAt FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires_at > ?",
    )
    .get(hashToken(token), Date.now()) as { email: string; createdAt: number } | undefined;
  return row ?? null;
}

export interface AccountRow {
  id: number;
  email: string;
  createdAt: number;
  lastSeen: number | null;
  coins: number;
  /** Progress keys synced (notes read, reviews, etc. — one row per key). */
  progressKeys: number;
}

/** Every account, most recently active first, for the /admin list. */
export function accountList(db: DB, limit = 500): AccountRow[] {
  return db
    .prepare(
      `SELECT u.id AS id, u.email AS email, u.created_at AS createdAt, u.last_seen AS lastSeen,
              COALESCE((SELECT SUM(amount) FROM coin_events WHERE user_id = u.id), 0) AS coins,
              (SELECT count(*) FROM progress WHERE user_id = u.id) AS progressKeys
         FROM users u
        ORDER BY COALESCE(u.last_seen, u.created_at) DESC
        LIMIT ?`,
    )
    .all(limit) as AccountRow[];
}

/** Aggregates only — never an e-mail address. */
export function accountStats(db: DB, now = Date.now()): { accounts: number; active7d: number; coinsInCirculation: number } {
  const one = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
  return {
    accounts: one("SELECT count(*) AS n FROM users"),
    active7d: one("SELECT count(*) AS n FROM users WHERE last_seen >= ?", now - 7 * 86_400_000),
    coinsInCirculation: one("SELECT COALESCE(SUM(amount), 0) AS n FROM coin_events"),
  };
}
