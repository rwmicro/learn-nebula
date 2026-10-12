// Shared admin check for every owner-only endpoint (comments moderation, the
// questions log, /api/admin/*). Two ways in:
//  - the COMMENTS_ADMIN_TOKEN bearer token (scripts, and the pasted token in
//    /admin/): one timing-safe comparison, with a per-IP lockout;
//  - the owner's own reader session (an account listed in ADMIN_EMAILS, logged
//    in by magic link less than ADMIN_SESSION_HOURS ago): an HttpOnly cookie,
//    so nothing an injected script could read, plus a same-origin check on
//    every mutating request since a cookie, unlike a header, rides along on
//    its own.

import type { Context } from "hono";
import { env } from "./env.ts";
import { getIp } from "./http.ts";
import { database, logAdminEvent } from "./db.ts";
import { sessionAccount } from "./account-store.ts";
import { originAllowed, publicBase, sessionToken } from "./session.ts";

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

/** How the request is an admin one, or null. A request carrying an
 *  Authorization header is judged on that header alone (a wrong token is a
 *  failed attempt, never a fallback to the cookie). */
export function adminVia(c: Context): "token" | "session" | null {
  const auth = c.req.header("authorization");
  if (auth) return isAdmin(auth, getIp(c)) ? "token" : null;
  return adminSessionEmail(c) ? "session" : null;
}

export function isAdminRequest(c: Context): boolean {
  return adminVia(c) !== null;
}

/** The admin account behind the request's session cookie, or null. */
export function adminSessionEmail(c: Context, now = Date.now()): string | null {
  if (!env.adminEmails.length) return null;
  let account: { email: string; createdAt: number } | null;
  try {
    account = sessionAccount(database(), sessionToken(c));
  } catch {
    return null;
  }
  if (!account || !env.adminEmails.includes(account.email.toLowerCase())) return null;
  if (now - account.createdAt > env.adminSessionMaxAgeMs) return null;
  const m = c.req.method;
  if (m !== "GET" && m !== "HEAD") {
    const host = (env.trustProxy && c.req.header("x-forwarded-host")) || c.req.header("host");
    if (!originAllowed(c.req.header("origin"), host, publicBase())) return null;
  }
  return account.email;
}

/** Record an admin action in the journal (/admin "journal"), with how the
 *  owner was logged in. */
export function audit(c: Context, action: string, detail = ""): void {
  logAdminEvent(action, detail, adminVia(c) ?? "");
}
