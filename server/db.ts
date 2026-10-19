// Comments store: the D1 database becomes a local SQLite file (better-sqlite3),
// persisted on a mounted volume. Same schema (schema/comments.sql) and same
// access patterns as the Cloudflare version — just synchronous.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env.ts";
import { ACCOUNT_SCHEMA } from "./account-store.ts";
import { PASSKEY_SCHEMA } from "./passkey-store.ts";
import { PUSH_SCHEMA } from "./push-store.ts";
import { clientErrorKey, type ClientErrorInput, type ReportInput } from "../lib/feedback.ts";

export interface CommentRow {
  id: number;
  slug?: string;
  name: string | null;
  body: string;
  created_at: number;
  /** 1 = written by the site's owner from /admin (shown with a badge). */
  author?: number;
  /** The comment this one answers, and its author's name (public list). */
  reply_to?: number | null;
  reply_to_name?: string | null;
}

let db: Database.Database | null = null;

/** Open (creating the file + schema if needed). Called once at startup. */
export function initDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
  db = new Database(env.dbPath);
  db.pragma("journal_mode = WAL"); // better concurrency for reads during writes
  // Off by default in SQLite, per connection: the account tables rely on
  // ON DELETE CASCADE so deleting a user takes everything of theirs with it.
  db.pragma("foreign_keys = ON");
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

    -- Comment word filter, edited from /admin (server/blocked-words.ts).
    CREATE TABLE IF NOT EXISTS blocked_words (
      word TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    );
    -- Small owner settings (key/value), e.g. whether blocked words hold a
    -- comment for moderation even when Turnstile would publish it.
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS search_misses (
      q TEXT NOT NULL,
      "where" TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (q, "where")
    );
    CREATE INDEX IF NOT EXISTS idx_search_misses_last ON search_misses(last_seen DESC);
    -- What the owner did from /admin, newest last (server/auth.ts's adminVia
    -- says how they were logged in). Self-trims to MAX_ADMIN_EVENTS.
    CREATE TABLE IF NOT EXISTS admin_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      via TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_admin_events_at ON admin_events(at DESC);
    -- Uncaught errors in readers' browsers (public/js/error-beacon.js), one row
    -- per message + place, counted. No IP; self-trims to MAX_CLIENT_ERRORS.
    CREATE TABLE IF NOT EXISTS client_errors (
      key TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      line INTEGER NOT NULL DEFAULT 0,
      stack TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      count INTEGER NOT NULL DEFAULT 1,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_client_errors_last ON client_errors(last_seen DESC);
    -- "Signaler une erreur" on a note passage (POST /api/report), until the
    -- owner marks it handled from /admin. No IP, no account link.
    CREATE TABLE IF NOT EXISTS error_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      passage TEXT NOT NULL,
      remark TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      done_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_error_reports_open ON error_reports(done_at, created_at DESC);
  `);
  // Reader accounts, progress sync, coins, streaks, avatar items
  // (server/account-store.ts).
  db.exec(ACCOUNT_SCHEMA);
  // Passkeys and Web Push reminders (server/passkey-store.ts, push-store.ts).
  db.exec(PASSKEY_SCHEMA);
  db.exec(PUSH_SCHEMA);
  migrateQuestions(db);
  migrateComments(db);
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

/** Owner replies (schema/comments.sql predates them). */
function migrateComments(d: Database.Database): void {
  const cols = new Set((d.prepare("PRAGMA table_info(comments)").all() as { name: string }[]).map((c) => c.name));
  if (!cols.has("author")) d.exec("ALTER TABLE comments ADD COLUMN author INTEGER NOT NULL DEFAULT 0");
  if (!cols.has("reply_to")) d.exec("ALTER TABLE comments ADD COLUMN reply_to INTEGER");
}

function get(): Database.Database {
  return db ?? initDb();
}

/** The shared handle, for modules that keep their queries elsewhere
 *  (server/account-store.ts takes it as a parameter). */
export const database = get;

const PAGE_LIMIT = 100;

export function approvedForSlug(slug: string): CommentRow[] {
  return get()
    .prepare(
      "SELECT c.id, c.name, c.body, c.created_at, c.author, c.reply_to, p.name AS reply_to_name " +
        "FROM comments c LEFT JOIN comments p ON p.id = c.reply_to " +
        "WHERE c.slug = ? AND c.status = 'approved' ORDER BY c.created_at ASC LIMIT ?",
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
      `SELECT id, slug, name, body, created_at, author, reply_to FROM comments ${where} ` +
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

/** The owner's answer to comment `parentId`, published at once on the same
 *  note. Returns the new row's id, or null when the parent doesn't exist. */
export function insertAuthorReply(parentId: number, name: string, body: string): number | null {
  const d = get();
  const parent = d.prepare("SELECT slug FROM comments WHERE id = ?").get(parentId) as { slug: string } | undefined;
  if (!parent) return null;
  const r = d
    .prepare(
      "INSERT INTO comments (slug, name, body, status, created_at, author, reply_to) VALUES (?, ?, ?, 'approved', ?, 1, ?)",
    )
    .run(parent.slug, name, body, Date.now(), parentId);
  return Number(r.lastInsertRowid);
}

export function setStatus(id: number, status: "approved"): void {
  get().prepare("UPDATE comments SET status = ? WHERE id = ?").run(status, id);
}

export function deleteComment(id: number): void {
  get().prepare("DELETE FROM comments WHERE id = ?").run(id);
}

/** Bulk moderation: one transaction, so a batch is all-or-nothing. Returns
 *  how many rows were touched. */
export function moderateMany(ids: number[], action: "approve" | "delete"): number {
  const d = get();
  const stmt =
    action === "approve"
      ? d.prepare("UPDATE comments SET status = 'approved' WHERE id = ?")
      : d.prepare("DELETE FROM comments WHERE id = ?");
  const run = d.transaction((list: number[]) => {
    let n = 0;
    for (const id of list) n += stmt.run(id).changes;
    return n;
  });
  return run(ids);
}

/** Blocked words in the order they were added. */
export function blockedWords(): string[] {
  return (
    get().prepare("SELECT word FROM blocked_words ORDER BY created_at, rowid").all() as {
      word: string;
    }[]
  ).map((r) => r.word);
}

/** Replace the whole list (the admin UI edits it as one text area). Callers
 *  pass it through sanitizeWords() first. */
export function setBlockedWords(words: string[]): void {
  const d = get();
  const insert = d.prepare("INSERT OR IGNORE INTO blocked_words (word, created_at) VALUES (?, ?)");
  d.transaction((list: string[]) => {
    d.prepare("DELETE FROM blocked_words").run();
    const now = Date.now();
    list.forEach((w, i) => insert.run(w, now + i));
  })(words);
}

export function getSetting(key: string): string | null {
  const row = get().prepare("SELECT value FROM admin_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  get()
    .prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)")
    .run(key, value);
}

/** Setting key: hold comments containing a blocked word for moderation. */
export const HOLD_BLOCKED_KEY = "blocked_words_hold";
export function holdBlocked(): boolean {
  return getSetting(HOLD_BLOCKED_KEY) !== "0"; // on by default
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

// --- client errors and error reports (lib/feedback.ts) ---------------------------

export interface ClientErrorRow {
  key: string;
  message: string;
  source: string;
  line: number;
  stack: string;
  path: string;
  count: number;
  first_seen: number;
  last_seen: number;
}

const MAX_CLIENT_ERRORS = 300;

/** Count one occurrence; the stack and page are the latest seen. */
export function recordClientError(e: ClientErrorInput, now = Date.now()): void {
  const d = get();
  d.prepare(
    "INSERT INTO client_errors (key, message, source, line, stack, path, count, first_seen, last_seen) " +
      "VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT (key) DO UPDATE SET count = count + 1, " +
      "last_seen = excluded.last_seen, stack = excluded.stack, path = excluded.path",
  ).run(clientErrorKey(e), e.message, e.source, e.line, e.stack, e.path, now, now);
  d.prepare(
    "DELETE FROM client_errors WHERE rowid NOT IN (SELECT rowid FROM client_errors ORDER BY last_seen DESC LIMIT ?)",
  ).run(MAX_CLIENT_ERRORS);
}

export function clientErrors(limit = 100): { errors: ClientErrorRow[]; total: number } {
  const d = get();
  const errors = d
    .prepare("SELECT * FROM client_errors ORDER BY last_seen DESC LIMIT ?")
    .all(limit) as ClientErrorRow[];
  const total = (d.prepare("SELECT count(*) AS n FROM client_errors").get() as { n: number }).n;
  return { errors, total };
}

export function deleteClientError(key: string): number {
  return get().prepare("DELETE FROM client_errors WHERE key = ?").run(key).changes;
}

export interface ErrorReportRow {
  id: number;
  slug: string;
  passage: string;
  remark: string;
  created_at: number;
  done_at: number | null;
}

const MAX_OPEN_REPORTS = 500;

/** Queue one report; false once the open queue is full (spam guard). */
export function recordErrorReport(r: ReportInput, now = Date.now()): boolean {
  const d = get();
  const open = (d.prepare("SELECT count(*) AS n FROM error_reports WHERE done_at IS NULL").get() as { n: number }).n;
  if (open >= MAX_OPEN_REPORTS) return false;
  d.prepare("INSERT INTO error_reports (slug, passage, remark, created_at) VALUES (?, ?, ?, ?)").run(
    r.slug,
    r.passage,
    r.remark,
    now,
  );
  // Handled reports are kept 90 days, for the record.
  d.prepare("DELETE FROM error_reports WHERE done_at IS NOT NULL AND done_at < ?").run(now - 90 * 86_400_000);
  return true;
}

export function errorReports(limit = 200): { open: ErrorReportRow[]; done: ErrorReportRow[] } {
  const d = get();
  const open = d
    .prepare("SELECT * FROM error_reports WHERE done_at IS NULL ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ErrorReportRow[];
  const done = d
    .prepare("SELECT * FROM error_reports WHERE done_at IS NOT NULL ORDER BY done_at DESC LIMIT 20")
    .all() as ErrorReportRow[];
  return { open, done };
}

/** Mark handled (or reopen with done=false). */
export function setErrorReportDone(id: number, done: boolean, now = Date.now()): number {
  return get()
    .prepare("UPDATE error_reports SET done_at = ? WHERE id = ?")
    .run(done ? now : null, id).changes;
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

// --- admin journal ------------------------------------------------------------

const MAX_ADMIN_EVENTS = 2000;

export interface AdminEvent {
  id: number;
  at: number;
  action: string;
  detail: string;
  via: string;
}

/** Never throws: a journal hiccup must not fail the action it records. */
export function logAdminEvent(action: string, detail = "", via = ""): void {
  try {
    const d = get();
    d.prepare("INSERT INTO admin_events (at, action, detail, via) VALUES (?, ?, ?, ?)").run(
      Date.now(),
      action,
      detail.slice(0, 500),
      via,
    );
    d.prepare(
      "DELETE FROM admin_events WHERE id NOT IN (SELECT id FROM admin_events ORDER BY id DESC LIMIT ?)",
    ).run(MAX_ADMIN_EVENTS);
  } catch (e) {
    console.warn("admin: journal write failed", e instanceof Error ? e.message : e);
  }
}

export function adminEvents(limit = 100): AdminEvent[] {
  return get()
    .prepare("SELECT id, at, action, detail, via FROM admin_events ORDER BY id DESC LIMIT ?")
    .all(Math.min(Math.max(limit, 1), 500)) as AdminEvent[];
}

// --- activity (the /admin charts) -------------------------------------------------

/** Timestamps (ms) of rows created since `since`, for bucketing by day. */
export function createdSince(table: "questions" | "comments" | "users", since: number): number[] {
  return (
    get().prepare(`SELECT created_at AS t FROM ${table} WHERE created_at >= ?`).all(since) as { t: number }[]
  ).map((r) => r.t);
}
