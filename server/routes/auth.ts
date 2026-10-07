// Reader login by e-mailed magic link. No password, no account enumeration:
// a request for any well-formed address answers the same, and the account is
// only created when the link is opened.
//
//   GET  /api/auth/config  → { enabled, turnstileSiteKey? }
//   POST /api/auth/request { email, turnstileToken?, next? } → { ok: true }
//   GET  /api/auth/verify?token=…&next=… → 302 (sets gk_session)
//   POST /api/auth/logout  → { ok: true } (clears gk_session)

import { Hono } from "hono";
import { env } from "../env.ts";
import { getIp } from "../http.ts";
import { Quota } from "../ratelimit.ts";
import { database } from "../db.ts";
import { verifyTurnstile } from "../turnstile.ts";
import { mailConfigured, sendLoginMail } from "../mail.ts";
import { ACCOUNT_PATH, hashToken, normalizeEmail, safeNext } from "../accounts.ts";
import {
  consumeLoginToken,
  createLoginToken,
  createSession,
  deleteSession,
  upsertUser,
} from "../account-store.ts";
import {
  clearSessionCookie,
  noStore,
  publicBase,
  sameOrigin,
  sessionToken,
  setSessionCookie,
} from "../session.ts";

/** Login works when mail can go out, or when links are logged (dev). */
export function authEnabled(): boolean {
  return mailConfigured() || env.authDevLog;
}

// Per IP: a handful of links an hour is plenty for a person, and keeps the
// form from being used to spray mail at strangers. Per address: a few per
// quarter hour, whoever asks.
const ipQuota = new Quota(10, 60 * 60_000);
const emailQuota = new Quota(3, 15 * 60_000);

export const authRoute = new Hono();
authRoute.use("*", sameOrigin, noStore);

authRoute.get("/config", (c) => {
  const enabled = authEnabled();
  return c.json(
    enabled && env.turnstileSecret && env.turnstileSiteKey
      ? { enabled, turnstileSiteKey: env.turnstileSiteKey }
      : { enabled },
  );
});

authRoute.post("/request", async (c) => {
  if (!authEnabled()) return c.json({ error: "disabled" }, 503);
  let payload: { email?: unknown; turnstileToken?: unknown; next?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "invalid" }, 400);
  }
  const email = normalizeEmail(payload?.email);
  if (!email) return c.json({ error: "invalid-email" }, 400);

  const ip = getIp(c);
  if (ipQuota.exceeded(`ip:${ip}`)) return c.json({ error: "rate-limited" }, 429);
  if (env.turnstileSecret) {
    const token = typeof payload.turnstileToken === "string" ? payload.turnstileToken : "";
    if (!(await verifyTurnstile(token, ip))) return c.json({ error: "turnstile" }, 403);
  }
  if (emailQuota.exceeded(hashToken(email))) return c.json({ error: "rate-limited" }, 429);

  const next = safeNext(payload.next) ?? ACCOUNT_PATH;
  let token: string;
  try {
    token = createLoginToken(database(), email);
  } catch (e) {
    console.error("auth: token write failed", e);
    return c.json({ error: "unavailable" }, 503);
  }
  const link = `${publicBase()}/api/auth/verify?token=${token}&next=${encodeURIComponent(next)}`;

  if (mailConfigured()) {
    try {
      await sendLoginMail(email, link);
    } catch (e) {
      console.error("auth: mail failed", e instanceof Error ? e.message : e);
      return c.json({ error: "mail" }, 502);
    }
  } else {
    // AUTH_DEV_LOG=true without SMTP (authEnabled() checked above): local dev.
    console.log(`auth: login link for ${email}: ${link}`);
  }
  return c.json({ ok: true });
});

authRoute.get("/verify", (c) => {
  // The token is in this URL, but it is consumed before we redirect, so a
  // Referer carrying it (same-origin only, per the site's Referrer-Policy)
  // is worthless.
  const token = c.req.query("token") ?? "";
  let email: string | null;
  try {
    email = consumeLoginToken(database(), token);
    if (!email) return c.redirect(`${ACCOUNT_PATH}?login=expired`, 302);
    const db = database();
    const { id } = upsertUser(db, email);
    setSessionCookie(c, createSession(db, id));
  } catch (e) {
    console.error("auth: verify failed", e);
    return c.redirect(`${ACCOUNT_PATH}?login=error`, 302);
  }
  return c.redirect(safeNext(c.req.query("next")) ?? ACCOUNT_PATH, 302);
});

authRoute.post("/logout", (c) => {
  try {
    deleteSession(database(), sessionToken(c));
  } catch (e) {
    console.error("auth: logout failed", e);
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});
