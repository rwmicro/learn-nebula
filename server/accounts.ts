// Reader accounts: the pure part. Days in the reader's own time zone, the
// streak arithmetic, what a progress sync newly did (and so what it pays),
// e-mail normalising/masking and the token helpers. No database here — that is
// server/account-store.ts — so all of it is unit-tested directly
// (accounts.test.ts).
//
// Coins are decided by the server alone, from the difference between the
// progress it had stored and the progress after merging what a device sent.
// The client never says "I earned N": it only sends its state.

import { createHash, randomBytes } from "node:crypto";
import { specFor } from "../lib/progress-transfer.ts";
import { STREAK_MILESTONES } from "../lib/avatar.ts";

export const DEFAULT_TZ = "Europe/Paris";

// --- coin scale -------------------------------------------------------------

export const COINS = {
  /** A note newly marked read (its gkReading entry gains `r`). Once per note, ever. */
  read: 5,
  /** A card or saved question reviewed, or a question answered correctly. */
  review: 1,
  /** Any of the above happened that day. */
  active: 10,
  /** First sync of a new account (instead of paying for the imported history). */
  welcome: 50,
} as const;

/** Daily caps, in events (not coins). */
export const DAILY_MAX = { read: 10, review: 50 } as const;

/** Streak length → bonus, paid on the day the run reaches it (lib/avatar.ts,
 *  shared with the account page). */
export const MILESTONES = STREAK_MILESTONES;

// --- days -------------------------------------------------------------------

/** The time zone if Intl knows it (canonical spelling), else null. */
export function validTimezone(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz || tz.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** Calendar day of `now` in `tz`, "YYYY-MM-DD". Falls back to DEFAULT_TZ. */
export function dayIn(tz: string, now: Date = new Date()): string {
  const fmt = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  try {
    return fmt(tz);
  } catch {
    return fmt(DEFAULT_TZ);
  }
}

/** Whole days from `a` to `b` (both "YYYY-MM-DD"); positive when b is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// --- streaks ----------------------------------------------------------------

export interface Streak {
  current: number;
  best: number;
  /** Last active day, "YYYY-MM-DD"; null before the first one. */
  lastDay: string | null;
  freezes: number;
}

export const EMPTY_STREAK: Streak = { current: 0, best: 0, lastDay: null, freezes: 0 };

/**
 * `today` is an active day: the streak after it, and the milestone the run
 * just reached (null if none). A gap of missed days is bridged by freezes when
 * enough are held (each missed day consumes one); otherwise the run restarts
 * at 1 and the freezes are kept for the next one.
 */
export function advanceStreak(s: Streak, today: string): { streak: Streak; milestone: number | null } {
  if (s.lastDay === today) return { streak: s, milestone: null };
  let { current, freezes } = s;
  const gap = s.lastDay ? daysBetween(s.lastDay, today) : Infinity;
  if (gap < 0) {
    // A time-zone change put "today" before the last active day: count it as
    // the same day rather than rewinding anything.
    return { streak: s, milestone: null };
  }
  if (gap === 1) current += 1;
  else if (Number.isFinite(gap) && gap - 1 <= freezes) {
    freezes -= gap - 1;
    current += 1;
  } else current = 1;
  const streak = { current, best: Math.max(s.best, current), lastDay: today, freezes };
  return { streak, milestone: MILESTONES[current] ? current : null };
}

/** The streak as it stands on `today` without new activity: a run whose gap
 *  can no longer be bridged by the freezes held reads as 0. Display only —
 *  nothing is consumed until the next active day. */
export function streakView(s: Streak, today: string): Streak {
  if (!s.lastDay || s.current === 0) return { ...s, current: 0 };
  const gap = daysBetween(s.lastDay, today);
  // gap 0: active today; 1: today is still open; gap-1 missed days ≤ freezes:
  // still savable.
  if (gap <= 1 || gap - 1 <= s.freezes) return s;
  return { ...s, current: 0 };
}

// --- what a sync newly did --------------------------------------------------

export interface Activity {
  /** Note slugs newly marked read. */
  reads: string[];
  /** Review refs `${key}#${id}`: a card or saved question whose scheduling
   *  state changed, or a question newly answered correctly. */
  reviews: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function cardChanged(before: unknown, after: unknown): boolean {
  if (!isObj(after)) return false;
  if (!isObj(before)) return true;
  return (
    before.reps !== after.reps ||
    before.due !== after.due ||
    before.iv !== after.iv ||
    before.ef !== after.ef
  );
}

/**
 * What changed for one progress key between the stored value (`before`,
 * undefined for a new key) and the merged one. Kinds that pay nothing (known
 * notes, path targets, anything added to PROGRESS_KEYS later) give nothing,
 * so they sync without paying and without a server change.
 */
export function diffActivity(key: string, before: unknown, after: unknown): Activity {
  const out: Activity = { reads: [], reviews: [] };
  const kind = specFor(key)?.kind as string | undefined;
  if (!isObj(after)) return out;
  const prev = isObj(before) ? before : {};
  if (kind === "reading") {
    for (const [slug, e] of Object.entries(after)) {
      if (!isObj(e) || e.r == null) continue;
      const b = prev[slug];
      if (!isObj(b) || b.r == null) out.reads.push(slug);
    }
  } else if (kind === "decks" || kind === "questions") {
    const cards = isObj(after.cards) ? after.cards : {};
    const prevCards = isObj(prev.cards) ? prev.cards : {};
    const seen = new Set<string>();
    for (const [id, c] of Object.entries(cards)) {
      if (cardChanged(prevCards[id], c)) seen.add(id);
    }
    if (kind === "questions") {
      const ok = isObj(after.ok) ? after.ok : {};
      const prevOk = isObj(prev.ok) ? prev.ok : {};
      for (const [id, day] of Object.entries(ok)) {
        const was = prevOk[id];
        if (typeof day === "string" && (typeof was !== "string" || day > was)) seen.add(id);
      }
    }
    for (const id of seen) out.reviews.push(`${key}#${id}`);
  }
  return out;
}

// --- what activity may be paid ----------------------------------------------

/** The built content a sync is allowed to earn coins for: real note slugs and
 *  real Anki deck slugs. When no manifest is available (a dev run with no
 *  build), everything reads as "known", so activity pays exactly as before. */
export interface ContentKnown {
  hasNote(slug: string): boolean;
  hasDeck(deckSlug: string): boolean;
  /** False when no manifest was loaded (validation then pays everything). */
  available: boolean;
}

/** A review ref is `${progressKey}#${id}` (see diffActivity). Its activity is
 *  real only when the progress key points at a known note (`srs:note:<slug>`)
 *  or a known deck (`srs:<deck-slug>`); a fabricated key earns nothing. The
 *  key is everything before the first `#` (slugs never contain one). */
export function reviewRefKnown(ref: string, known: ContentKnown): boolean {
  const hash = ref.indexOf("#");
  const key = hash < 0 ? ref : ref.slice(0, hash);
  if (key.startsWith("srs:note:")) return known.hasNote(key.slice("srs:note:".length));
  if (key.startsWith("srs:")) return known.hasDeck(key.slice("srs:".length));
  return false;
}

// --- e-mail -----------------------------------------------------------------

// Deliberately loose (one @, a dot in the domain, no spaces): the mail itself
// is the real check.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return null;
  // Header injection guard, belt and braces (EMAIL_RE already excludes \s).
  if (/[\r\n<>"',;]/.test(e)) return null;
  return e;
}

/** "marie@gmail.com" → "ma•••@gmail.com" (one visible character for a
 *  local part of two or fewer). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "•••";
  const local = email.slice(0, at);
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}•••${email.slice(at)}`;
}

// --- redirects --------------------------------------------------------------

export const ACCOUNT_PATH = "/compte/";

/** A same-site path to send the reader back to after login, or null. */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // Backslashes are read as slashes by browsers ("/\evil.com"); no control
  // characters either (header splitting).
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw;
}

// --- tokens -----------------------------------------------------------------

/** 32 random bytes, base64url: login links and session cookies. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this is stored: a database leak hands out no usable link or session. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
