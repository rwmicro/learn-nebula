// Web Push subscriptions: the SQLite side (schema executed by db.ts's initDb).
// One row per browser endpoint, always a signed-in reader's: the reminder
// counts their synced cards, and deleting the account takes the row with it.

import type Database from "better-sqlite3";
import type { Schedule } from "./push.ts";

type DB = Database.Database;

/** Most browsers one account may subscribe. */
export const MAX_PUSH_PER_USER = 10;

export const PUSH_SCHEMA = `
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    hour INTEGER NOT NULL,
    tz TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'fr',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_sent_at INTEGER,
    failures INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
`;

export interface PushRow {
  endpoint: string;
  user_id: number;
  p256dh: string;
  auth: string;
  hour: number;
  tz: string;
  locale: string;
  created_at: number;
  updated_at: number;
  last_sent_at: number | null;
  failures: number;
}

export function scheduleOf(r: PushRow): Schedule {
  return { hour: r.hour, tz: r.tz, lastSentAt: r.last_sent_at, updatedAt: r.updated_at };
}

/** Subscribe or change the hour. An endpoint moves to whoever subscribes it
 *  last (one browser, one reader signed in). False when the account is full. */
export function upsertSubscription(
  db: DB,
  s: { endpoint: string; userId: number; p256dh: string; auth: string; hour: number; tz: string; locale: string },
  now = Date.now(),
): boolean {
  const n = (
    db
      .prepare("SELECT count(*) AS n FROM push_subscriptions WHERE user_id = ? AND endpoint != ?")
      .get(s.userId, s.endpoint) as { n: number }
  ).n;
  if (n >= MAX_PUSH_PER_USER) return false;
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, hour, tz, locale, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
       auth = excluded.auth, hour = excluded.hour, tz = excluded.tz, locale = excluded.locale,
       updated_at = excluded.updated_at, failures = 0`,
  ).run(s.endpoint, s.userId, s.p256dh, s.auth, s.hour, s.tz, s.locale, now, now);
  return true;
}

export function deleteSubscription(db: DB, endpoint: string, userId?: number): void {
  if (userId == null) db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  else db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").run(endpoint, userId);
}

/** The reader's subscription for this endpoint (the hour shown in /compte). */
export function subscriptionFor(db: DB, endpoint: string, userId: number): { hour: number } | null {
  return (
    (db.prepare("SELECT hour FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").get(endpoint, userId) as
      | { hour: number }
      | undefined) ?? null
  );
}

export function allSubscriptions(db: DB): PushRow[] {
  return db.prepare("SELECT * FROM push_subscriptions").all() as PushRow[];
}

export function markSent(db: DB, endpoint: string, now = Date.now()): void {
  db.prepare("UPDATE push_subscriptions SET last_sent_at = ?, failures = 0 WHERE endpoint = ?").run(now, endpoint);
}

/** Counts a failed send; returns the new count. */
export function markFailed(db: DB, endpoint: string): number {
  const r = db
    .prepare("UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = ? RETURNING failures")
    .get(endpoint) as { failures: number } | undefined;
  return r?.failures ?? 0;
}

/** The reader's synced deck progress (`srs:*`, the probe key aside). */
export function deckValues(db: DB, userId: number): string[] {
  return (
    db
      .prepare("SELECT value FROM progress WHERE user_id = ? AND key LIKE 'srs:%' AND key != 'srs:probe'")
      .all(userId) as { value: string }[]
  ).map((r) => r.value);
}
