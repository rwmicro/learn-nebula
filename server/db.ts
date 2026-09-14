// Comments store: the D1 database becomes a local SQLite file (better-sqlite3),
// persisted on a mounted volume. Same schema (schema/comments.sql) and same
// access patterns as the Cloudflare version — just synchronous.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env.ts";

export interface CommentRow {
  id: number;
  slug?: string;
  name: string | null;
  body: string;
  created_at: number;
}

let db: Database.Database | null = null;

/** Open (creating the file + schema if needed). Called once at startup. */
export function initDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
  db = new Database(env.dbPath);
  db.pragma("journal_mode = WAL"); // better concurrency for reads during writes
  const schemaPath = path.join(process.cwd(), "schema", "comments.sql");
  const schema = fs.existsSync(schemaPath)
    ? fs.readFileSync(schemaPath, "utf8")
    : DEFAULT_SCHEMA;
  db.exec(schema);
  // Questions log: self-hosted-only (no Cloudflare/D1 legacy to mirror), so it
  // isn't in schema/comments.sql — created here instead.
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      scope TEXT,
      locale TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at DESC);
  `);
  return db;
}

function get(): Database.Database {
  return db ?? initDb();
}

const PAGE_LIMIT = 100;

export function approvedForSlug(slug: string): CommentRow[] {
  return get()
    .prepare(
      "SELECT id, name, body, created_at FROM comments " +
        "WHERE slug = ? AND status = 'approved' ORDER BY created_at ASC LIMIT ?",
    )
    .all(slug, PAGE_LIMIT) as CommentRow[];
}

export function pending(): CommentRow[] {
  return get()
    .prepare(
      "SELECT id, slug, name, body, created_at FROM comments " +
        "WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?",
    )
    .all(PAGE_LIMIT) as CommentRow[];
}

export function insertComment(
  slug: string,
  name: string | null,
  body: string,
  status: "approved" | "pending",
): void {
  get()
    .prepare(
      "INSERT INTO comments (slug, name, body, status, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(slug, name, body, status, Date.now());
}

export function setStatus(id: number, status: "approved"): void {
  get().prepare("UPDATE comments SET status = ? WHERE id = ?").run(status, id);
}

export function deleteComment(id: number): void {
  get().prepare("DELETE FROM comments WHERE id = ?").run(id);
}

export interface QuestionRow {
  id: number;
  question: string;
  scope: string | null;
  locale: string | null;
  created_at: number;
}

const MAX_QUESTIONS = 300;

/** No IP, no session — this is a "what do people ask" log for prioritising
 *  what to write next, not analytics on who asked. Self-trims to MAX_QUESTIONS
 *  on every insert (personal-scale traffic, so a query per submission is fine —
 *  no separate cron/sweep needed). */
export function logQuestion(question: string, scope: string | null, locale: string | null): void {
  const d = get();
  d.prepare(
    "INSERT INTO questions (question, scope, locale, created_at) VALUES (?, ?, ?, ?)",
  ).run(question, scope, locale, Date.now());
  d.prepare(
    "DELETE FROM questions WHERE id NOT IN (SELECT id FROM questions ORDER BY created_at DESC LIMIT ?)",
  ).run(MAX_QUESTIONS);
}

export function recentQuestions(limit = 100): QuestionRow[] {
  return get()
    .prepare("SELECT id, question, scope, locale, created_at FROM questions ORDER BY created_at DESC LIMIT ?")
    .all(Math.min(limit, MAX_QUESTIONS)) as QuestionRow[];
}

// Fallback if schema/comments.sql isn't shipped (kept in sync with that file).
const DEFAULT_SCHEMA = `
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_slug_status ON comments(slug, status);
CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at DESC);
`;
