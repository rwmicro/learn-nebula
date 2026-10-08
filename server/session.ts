// Reader sessions on the wire: the `gk_session` cookie, the current user, and
// the Origin check every mutating account route goes through. The session
// rows themselves are in server/account-store.ts.

import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SITE_URL } from "../lib/site.ts";
import { env } from "./env.ts";
import { database } from "./db.ts";
import { SESSION_TTL_MS, sessionUser } from "./account-store.ts";

export const SESSION_COOKIE = "gk_session";

/** Base URL for login links and the expected Origin: PUBLIC_URL, else the
 *  site's own SITE_URL. */
export function publicBase(): string {
  return env.publicUrl || SITE_URL;
}

const secure = () => publicBase().startsWith("https://");

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: secure(), httpOnly: true, sameSite: "Lax" });
}

export function sessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/** The logged-in user's id, or null. Slides the session (and re-sends the
 *  cookie) when it is past half its life; drops a stale cookie. */
export function currentUser(c: Context): number | null {
  const token = sessionToken(c);
  if (!token) return null;
  const s = sessionUser(database(), token);
  if (!s) {
    clearSessionCookie(c);
    return null;
  }
  if (s.refreshed) setSessionCookie(c, token);
  return s.userId;
}

/** Whether a request's Origin is this site: PUBLIC_URL/SITE_URL's origin, or
 *  the host the request was sent to (local dev on another port or host).
 *  A missing Origin is refused — browsers always send it on POST/PUT/DELETE. */
export function originAllowed(origin: string | undefined, host: string | undefined, base: string): boolean {
  if (!origin || origin === "null") return false;
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  try {
    if (o.origin === new URL(base).origin) return true;
  } catch {
    /* malformed base: fall through to the host check */
  }
  return !!host && o.host === host.toLowerCase();
}

/** CSRF guard for the account routes: SameSite=Lax already keeps the cookie
 *  off cross-site POSTs, this refuses them outright as well. */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  const m = c.req.method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return next();
  const host = (env.trustProxy && c.req.header("x-forwarded-host")) || c.req.header("host");
  if (!originAllowed(c.req.header("origin"), host, publicBase())) {
    return c.json({ error: "bad-origin" }, 403);
  }
  return next();
};

/** Account data is private and per-user: never cached anywhere. */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
};
