// Shared admin-token check for every owner-only endpoint (comments moderation,
// the questions log). One timing-safe comparison, one place to get it right.

import { env } from "./env.ts";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// Failed attempts only (a legitimate, already-connected admin polling every
// 30s never accumulates any) — past FAIL_LIMIT within the window, further
// attempts from that IP are rejected without even comparing the token, so a
// short/guessable COMMENTS_ADMIN_TOKEN isn't brute-forceable at wire speed.
// In-memory/per-instance, like the rest of server/ratelimit.ts.
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 5 * 60_000;
const failures = new Map<string, number[]>();

function recentFailures(ip: string): number[] {
  const now = Date.now();
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  failures.set(ip, recent);
  return recent;
}

const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of failures) {
    const kept = hits.filter((t) => now - t < FAIL_WINDOW_MS);
    if (kept.length) failures.set(ip, kept);
    else failures.delete(ip);
  }
}, FAIL_WINDOW_MS);
if (typeof sweepTimer.unref === "function") sweepTimer.unref();

export function isAdmin(auth: string | undefined, ip: string): boolean {
  if (!env.adminToken) return false;
  const recent = recentFailures(ip);
  if (recent.length >= FAIL_LIMIT) return false;

  const prefix = "Bearer ";
  const ok = !!auth && auth.startsWith(prefix) && timingSafeEqual(auth.slice(prefix.length), env.adminToken);
  if (!ok) {
    recent.push(Date.now());
    failures.set(ip, recent);
  }
  return ok;
}
