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

    CREATE TABLE IF NOT EXISTS translations (
      key TEXT PRIMARY KEY,
      markdown TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_translations_created ON translations(created_at DESC);

    CREATE TABLE IF NOT EXISTS search_misses (
      q TEXT NOT NULL,
      "where" TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (q, "where")
    );
    CREATE INDEX IF NOT EXISTS idx_search_misses_last ON search_misses(last_seen DESC);
  `);
  migrateQuestions(db);
  return db;
}

/** Columns added to `questions` after it first shipped. SQLite has no
 *  `ADD COLUMN IF NOT EXISTS`, so check table_info first — safe to run on
 *  every start, against a fresh file or a volume from any earlier version. */
function migrateQuestions(d: Database.Database): void {
  const cols = new Set(
    (d.prepare("PRAGMA table_info(questions)").all() as { name: string }[]).map((c) => c.name),
  );
  // Best cosine among the chunks retrieval kept (NULL = retrieval unavailable
  // when the question was asked, so its coverage is unknown, not "weak").
  if (!cols.has("top_score")) d.exec("ALTER TABLE questions ADD COLUMN top_score REAL");
  // How many chunks retrieval kept (0..TOP_K); NULL as above.
  if (!cols.has("hits")) d.exec("ALTER TABLE questions ADD COLUMN hits INTEGER");
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

/** Escape LIKE wildcards so a search for "100%" matches literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** Published comments for /admin, newest first, optionally filtered by a
 *  case-insensitive substring of the slug, name or body. With Turnstile on,
 *  comments skip the pending queue entirely — this is the only place they can
 *  be found again (and deleted). */
export function approvedPage(opts: { q?: string; limit: number; offset: number }): {
  comments: CommentRow[];
  total: number;
} {
  const d = get();
  const q = (opts.q ?? "").trim().toLowerCase();
  const where = q
    ? "WHERE status = 'approved' AND (lower(slug) LIKE @p ESCAPE '\\' OR lower(coalesce(name, '')) LIKE @p ESCAPE '\\' OR lower(body) LIKE @p ESCAPE '\\')"
    : "WHERE status = 'approved'";
  const params = q ? { p: likePattern(q) } : {};
  const total = (d.prepare(`SELECT count(*) AS n FROM comments ${where}`).get(params) as { n: number }).n;
  const comments = d
    .prepare(
      `SELECT id, slug, name, body, created_at FROM comments ${where} ` +
        "ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset",
    )
    .all({ ...params, limit: opts.limit, offset: opts.offset }) as CommentRow[];
  return { comments, total };
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
  top_score: number | null;
  hits: number | null;
}

/** What retrieval found for a question; null when retrieval wasn't running. */
export interface RetrievalStats {
  topScore: number | null;
  hits: number;
}

const MAX_QUESTIONS = 300;

/** No IP, no session — this is a "what do people ask" log for prioritising
 *  what to write next, not analytics on who asked. Self-trims to MAX_QUESTIONS
 *  on every insert (personal-scale traffic, so a query per submission is fine —
 *  no separate cron/sweep needed). */
export function logQuestion(
  question: string,
  scope: string | null,
  locale: string | null,
  retrieval: RetrievalStats | null = null,
): void {
  const d = get();
  d.prepare(
    "INSERT INTO questions (question, scope, locale, created_at, top_score, hits) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    question,
    scope,
    locale,
    Date.now(),
    retrieval ? retrieval.topScore : null,
    retrieval ? retrieval.hits : null,
  );
  d.prepare(
    "DELETE FROM questions WHERE id NOT IN (SELECT id FROM questions ORDER BY created_at DESC LIMIT ?)",
  ).run(MAX_QUESTIONS);
}

export function recentQuestions(limit = 100): QuestionRow[] {
  return get()
    .prepare(
      "SELECT id, question, scope, locale, created_at, top_score, hits FROM questions " +
        "ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .all(Math.min(limit, MAX_QUESTIONS)) as QuestionRow[];
}

const MAX_TRANSLATIONS = 2000;

/** Translated Markdown, keyed by a hash of (model, languages, source text) —
 *  so every reader after the first gets a note's translation for free, and an
 *  edited note (new source text) simply misses. The Markdown is stored rather
 *  than the rendered HTML so a change to the render pipeline applies to cached
 *  translations too. */
export function cachedTranslation(key: string): string | null {
  const row = get().prepare("SELECT markdown FROM translations WHERE key = ?").get(key) as
    | { markdown: string }
    | undefined;
  return row?.markdown ?? null;
}

/** Store a translation; self-trims to MAX_TRANSLATIONS (oldest first), the same
 *  way logQuestion() does. */
export function storeTranslation(key: string, markdown: string): void {
  const d = get();
  d.prepare(
    "INSERT OR REPLACE INTO translations (key, markdown, created_at) VALUES (?, ?, ?)",
  ).run(key, markdown, Date.now());
  d.prepare(
    "DELETE FROM translations WHERE key NOT IN (SELECT key FROM translations ORDER BY created_at DESC LIMIT ?)",
  ).run(MAX_TRANSLATIONS);
}

export interface SearchMissRow {
  q: string;
  where: string;
  count: number;
  first_seen: number;
  last_seen: number;
}

const MAX_SEARCH_MISSES = 1000;

/** Count one zero-result search (already normalised by lib/search-miss.ts).
 *  Like the questions log: no IP, nothing about who searched; self-trims to
 *  the MAX_SEARCH_MISSES most recently seen queries. */
export function recordSearchMiss(q: string, where: string, now = Date.now()): void {
  const d = get();
  d.prepare(
    'INSERT INTO search_misses (q, "where", count, first_seen, last_seen) VALUES (?, ?, 1, ?, ?) ' +
      'ON CONFLICT (q, "where") DO UPDATE SET count = count + 1, last_seen = excluded.last_seen',
  ).run(q, where, now, now);
  d.prepare(
    'DELETE FROM search_misses WHERE rowid NOT IN (SELECT rowid FROM search_misses ORDER BY last_seen DESC LIMIT ?)',
  ).run(MAX_SEARCH_MISSES);
}

const MISS_COLS = 'q, "where" AS "where", count, first_seen, last_seen';

/** The most frequent misses and the most recent ones, for /admin. */
export function searchMisses(limit = 50): { top: SearchMissRow[]; recent: SearchMissRow[]; total: number } {
  const d = get();
  const top = d
    .prepare(`SELECT ${MISS_COLS} FROM search_misses ORDER BY count DESC, last_seen DESC LIMIT ?`)
    .all(limit) as SearchMissRow[];
  const recent = d
    .prepare(`SELECT ${MISS_COLS} FROM search_misses ORDER BY last_seen DESC LIMIT ?`)
    .all(limit) as SearchMissRow[];
  const total = (d.prepare("SELECT count(*) AS n FROM search_misses").get() as { n: number }).n;
  return { top, recent, total };
}

/** Dismiss one query (in one place, or everywhere when `where` is omitted). */
export function deleteSearchMiss(q: string, where?: string): number {
  const d = get();
  const r = where
    ? d.prepare('DELETE FROM search_misses WHERE q = ? AND "where" = ?').run(q, where)
    : d.prepare("DELETE FROM search_misses WHERE q = ?").run(q);
  return r.changes;
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
