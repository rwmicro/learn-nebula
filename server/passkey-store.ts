// Passkeys: the SQLite side (schema executed by db.ts's initDb, next to
// ACCOUNT_SCHEMA). Credentials go with their account (ON DELETE CASCADE).

import type Database from "better-sqlite3";
import { toView, type CredentialRow, type PasskeyView } from "./passkeys.ts";

type DB = Database.Database;

/** Most passkeys one account may register. */
export const MAX_PASSKEYS = 20;

export const PASSKEY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    label TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);
`;

export function credentialById(db: DB, id: string): CredentialRow | null {
  if (!id || id.length > 1024) return null;
  return (db.prepare("SELECT * FROM credentials WHERE id = ?").get(id) as CredentialRow | undefined) ?? null;
}

/** Credential ids and transports of an account (the excludeCredentials list). */
export function userCredentials(db: DB, userId: number): Pick<CredentialRow, "id" | "transports">[] {
  return db.prepare("SELECT id, transports FROM credentials WHERE user_id = ?").all(userId) as Pick<
    CredentialRow,
    "id" | "transports"
  >[];
}

export function listPasskeys(db: DB, userId: number): PasskeyView[] {
  const rows = db
    .prepare("SELECT id, label, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as Pick<CredentialRow, "id" | "label" | "created_at" | "last_used_at">[];
  return rows.map(toView);
}

export function countPasskeys(db: DB, userId: number): number {
  return (db.prepare("SELECT count(*) AS n FROM credentials WHERE user_id = ?").get(userId) as { n: number }).n;
}

export function insertCredential(
  db: DB,
  c: { id: string; userId: number; publicKey: Uint8Array; counter: number; transports: string[]; label: string },
  now = Date.now(),
): boolean {
  const r = db
    .prepare(
      "INSERT OR IGNORE INTO credentials (id, user_id, public_key, counter, transports, created_at, label) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(c.id, c.userId, Buffer.from(c.publicKey), c.counter, JSON.stringify(c.transports), now, c.label.slice(0, 60));
  return r.changes > 0;
}

export function touchCredential(db: DB, id: string, counter: number, now = Date.now()): void {
  db.prepare("UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?").run(counter, now, id);
}

/** Deletes one of the account's own passkeys; false when it isn't theirs. */
export function deleteCredential(db: DB, userId: number, id: string): boolean {
  return db.prepare("DELETE FROM credentials WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}
