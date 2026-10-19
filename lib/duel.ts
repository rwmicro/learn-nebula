/**
 * Two-player sessions on /duel/ (components/Duel.tsx) — the pure part: the
 * shared question order, who scores a round, the phrase of the day, and the
 * check of every message the other browser sends over the data channel.
 *
 * Both browsers fetch the same note and read its questions themselves; what
 * travels between them is only indices, answers and times, never content, so
 * the other side cannot make this page show anything the note doesn't.
 * Nothing here pays coins (server/accounts.ts only counts synced progress):
 * two tabs of one reader could otherwise farm them.
 */

export type Side = "host" | "guest";

/** Longest a round lasts; an unanswered round counts as no answer. */
export const ROUND_MS = 20_000;
/** Questions in one duel at most. */
export const DUEL_MAX = 10;

/** FNV-1a, 32 bits, as 8 hex characters. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Small seeded PRNG (mulberry32): the same seed gives both sides the same
 *  sequence. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The questions played, in order: a seeded shuffle of `n`, `max` at most. */
export function duelOrder(n: number, seed: number, max = DUEL_MAX): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  const r = rng(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.max(0, max));
}

export interface Answer {
  /** Choice index, -1 = no answer in time. */
  c: number;
  ms: number;
}

export const isRight = (ok: boolean[], a: Answer | undefined) => !!a && a.c >= 0 && ok[a.c] === true;

/** The round's point: the faster of those who answered right (a tie to the
 *  millisecond goes to both), null when nobody did. */
export function pointFor(ok: boolean[], host?: Answer, guest?: Answer): Side | "both" | null {
  const h = isRight(ok, host);
  const g = isRight(ok, guest);
  if (h && g) {
    if (host!.ms === guest!.ms) return "both";
    return host!.ms < guest!.ms ? "host" : "guest";
  }
  return h ? "host" : g ? "guest" : null;
}

export interface Round {
  ok: boolean[];
  host?: Answer;
  guest?: Answer;
}

export function tally(rounds: Round[]): Record<Side, number> {
  const s = { host: 0, guest: 0 };
  for (const r of rounds) {
    const p = pointFor(r.ok, r.host, r.guest);
    if (p === "host" || p === "both") s.host++;
    if (p === "guest" || p === "both") s.guest++;
  }
  return s;
}

/** Same prompt for both on a given day ("YYYY-MM-DD"). */
export const dayIndex = (day: string, n: number) => (n > 0 ? parseInt(fnv1a(day), 16) % n : 0);

// --- Data-channel messages ------------------------------------------------------

export type DuoMsg =
  | { t: "ready"; sig: string; n: number }
  | { t: "start"; seed: number; count: number }
  | { t: "q"; i: number }
  | { t: "a"; i: number; c: number; ms: number }
  | { t: "end" }
  | { t: "mismatch" }
  | { t: "phrase"; i: number }
  | { t: "mute"; on: boolean }
  | { t: "bye" };

const int = (x: unknown, lo: number, hi: number): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi;

/** A message from the other browser, or null when it isn't one we expect.
 *  Bounds keep a crafted message from indexing past the question list. */
export function parseDuo(raw: unknown): DuoMsg | null {
  if (typeof raw !== "string" || raw.length > 512) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  switch (o.t) {
    case "ready":
      return typeof o.sig === "string" && /^[0-9a-f]{8}$/.test(o.sig) && int(o.n, 0, 10_000)
        ? { t: "ready", sig: o.sig, n: o.n }
        : null;
    case "start":
      return int(o.seed, 0, 0xffffffff) && int(o.count, 1, DUEL_MAX)
        ? { t: "start", seed: o.seed, count: o.count }
        : null;
    case "q":
      return int(o.i, 0, DUEL_MAX - 1) ? { t: "q", i: o.i } : null;
    case "a":
      return int(o.i, 0, DUEL_MAX - 1) && int(o.c, -1, 25) && int(o.ms, 0, ROUND_MS)
        ? { t: "a", i: o.i, c: o.c, ms: o.ms }
        : null;
    case "phrase":
      return int(o.i, 0, 100_000) ? { t: "phrase", i: o.i } : null;
    case "mute":
      return typeof o.on === "boolean" ? { t: "mute", on: o.on } : null;
    case "end":
    case "mismatch":
    case "bye":
      return { t: o.t };
    default:
      return null;
  }
}

/** "#<code>" or "#<code>~<host key>" (the creator's first load). */
export function parseHash(hash: string): { code: string; key: string | null } | null {
  const m = /^#?([a-z2-7]{24})(?:~([a-z2-7]{32}))?$/.exec(hash);
  return m ? { code: m[1], key: m[2] ?? null } : null;
}
