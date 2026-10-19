// Two things readers' browsers tell the owner, both stored in the comments
// SQLite for /admin and never shown publicly:
//
//  - client errors: an uncaught exception or rejected promise on a page
//    (public/js/error-beacon.js → POST /api/client-error), deduplicated by
//    message + where it was thrown, so the owner sees what breaks for readers
//    instead of learning it from a review;
//  - error reports ("Signaler une erreur"): a reader selects a passage of a
//    note and says what is wrong with it (public/js/selection-menu.js →
//    POST /api/report), queued until the owner marks it handled.
//
// Shared by the server routes (validation) and the browser code (the same
// limits, so a report the form accepts is one the server takes).

export const CLIENT_ERROR_MAX = { message: 300, source: 300, stack: 2000, url: 300 } as const;
export const REPORT_MAX = { passage: 600, remark: 1000, slug: 300 } as const;
export const REPORT_MIN_REMARK = 3;

/** Control and bidi-override characters out, whitespace collapsed, capped. */
export function clean(v: unknown, max: number, keepNewlines = false): string {
  if (typeof v !== "string") return "";
  const s = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, " ");
  const collapsed = keepNewlines
    ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
    : s.replace(/\s+/g, " ");
  return [...collapsed.trim()].slice(0, max).join("").trim();
}

/** Only a same-site path ("/posts/a/b/"), never a full URL or a query. */
export function cleanPath(v: unknown, max = 300): string {
  if (typeof v !== "string") return "";
  let p = v;
  try {
    p = new URL(v, "https://x.invalid").pathname;
  } catch {
    return "";
  }
  return p.startsWith("/") ? clean(p, max) : "";
}

export interface ClientErrorInput {
  message: string;
  source: string;
  line: number;
  stack: string;
  path: string;
}

export function normaliseClientError(raw: unknown): ClientErrorInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const message = clean(r.message, CLIENT_ERROR_MAX.message);
  if (!message) return null;
  // Errors thrown by browser extensions and injected scripts say nothing about
  // the site; only keep same-origin (or unknown) sources.
  const source = clean(r.source, CLIENT_ERROR_MAX.source);
  if (/^(chrome|moz|safari|edge)-extension:/i.test(source)) return null;
  const line = Number.isFinite(Number(r.line)) ? Math.max(0, Math.floor(Number(r.line))) : 0;
  return {
    message,
    source: cleanPath(source) || source.slice(0, 80),
    line,
    stack: clean(r.stack, CLIENT_ERROR_MAX.stack, true),
    path: cleanPath(r.path),
  };
}

/** One row per distinct error: same message thrown from the same place. */
export function clientErrorKey(e: ClientErrorInput): string {
  return `${e.message}\u0000${e.source}:${e.line}`;
}

export interface ReportInput {
  slug: string;
  passage: string;
  remark: string;
}

/** A note slug as the site writes it ("social-sciences/x/y"), no dots. */
export function normaliseSlug(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.replace(/^\/?posts\//, "").replace(/^\/+|\/+$/g, "");
  return /^[\p{L}\p{N}_\-/]+$/u.test(s) && !s.includes("//") ? s.slice(0, REPORT_MAX.slug) : "";
}

export function normaliseReport(raw: unknown): ReportInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const slug = normaliseSlug(r.slug);
  const passage = clean(r.passage, REPORT_MAX.passage, true);
  const remark = clean(r.remark, REPORT_MAX.remark, true);
  if (!slug || !passage || [...remark].length < REPORT_MIN_REMARK) return null;
  return { slug, passage, remark };
}
