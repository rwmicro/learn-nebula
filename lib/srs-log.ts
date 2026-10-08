/**
 * Daily review counts — pure apart from the storage helpers. One small
 * localStorage entry, `srsLog`: {"YYYY-MM-DD": [reviews, failed]} over the
 * last LOG_DAYS days, written by every grade (decks, note questions, the
 * combined session) and read by /progression/ for the success rate. A
 * review's grade is all it keeps: no card ids, so it stays tiny.
 */
import { addDays, type Grade } from "./srs";

export const LOG_KEY = "srsLog";
export const LOG_DAYS = 400;

export type ReviewLog = Record<string, [number, number]>;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLog(raw: string | null): ReviewLog {
  const out: ReviewLog = {};
  if (!raw) return out;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o)) return out;
    for (const [day, v] of Object.entries(o)) {
      if (!DAY_RE.test(day) || !Array.isArray(v)) continue;
      const [n, f] = v.map(Number);
      if (Number.isInteger(n) && Number.isInteger(f) && n > 0 && f >= 0 && f <= n) out[day] = [n, f];
    }
  } catch {
    /* malformed: empty */
  }
  return out;
}

/** Count one review on `day` (`undo`: take it back), dropping old days. */
export function logReview(log: ReviewLog, day: string, g: Grade, undo = false): ReviewLog {
  const [n, f] = log[day] ?? [0, 0];
  const d = undo ? -1 : 1;
  const next = [Math.max(0, n + d), Math.max(0, f + (g === "again" ? d : 0))] as [number, number];
  const out: ReviewLog = {};
  const oldest = addDays(day, -LOG_DAYS);
  for (const [k, v] of Object.entries(log)) if (k > oldest && k !== day) out[k] = v;
  if (next[0] > 0) out[day] = [next[0], Math.min(next[0], next[1])];
  return out;
}

/** Reviews and first-try successes over the `days` days ending `today`. */
export function successRate(log: ReviewLog, today: string, days = 30): { reviews: number; ok: number } {
  const from = addDays(today, -(days - 1));
  let reviews = 0;
  let failed = 0;
  for (const [day, [n, f]] of Object.entries(log))
    if (day >= from && day <= today) {
      reviews += n;
      failed += f;
    }
  return { reviews, ok: reviews - failed };
}

/** Merge two logs (import): the larger count per day. */
export function mergeLogs(a: ReviewLog, b: ReviewLog): ReviewLog {
  const out = { ...a };
  for (const [day, v] of Object.entries(b)) if (!out[day] || v[0] > out[day][0]) out[day] = v;
  return out;
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** Read-modify-write one review into storage; silent when storage is gone. */
export function recordReview(day: string, g: Grade, undo = false, store?: Store): void {
  try {
    const s = store ?? localStorage;
    s.setItem(LOG_KEY, JSON.stringify(logReview(parseLog(s.getItem(LOG_KEY)), day, g, undo)));
  } catch {
    /* storage unavailable */
  }
}

export function loadLog(store?: Pick<Storage, "getItem">): ReviewLog {
  try {
    return parseLog((store ?? localStorage).getItem(LOG_KEY));
  } catch {
    return {};
  }
}
