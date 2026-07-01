-- D1 schema for /api/comments.
-- Apply once per environment:
--   wrangler d1 execute garden-comments --remote --file=./schema/comments.sql
--   wrangler d1 execute garden-comments --local  --file=./schema/comments.sql
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_slug_status
  ON comments(slug, status);

CREATE INDEX IF NOT EXISTS idx_comments_status_created
  ON comments(status, created_at DESC);
