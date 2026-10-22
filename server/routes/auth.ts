// Reader login by e-mailed magic link. No password, no account enumeration:
// a request for any well-formed address answers the same, and the account is
// only created when the link is opened.
//
//   GET  /api/auth/config  → { enabled, passkey, turnstileSiteKey? }
//   POST /api/auth/request { email, turnstileToken?, next?, locale? } → { ok: true }
//   POST /api/auth/verify  { token } → { ok: true } (sets gk_session) | 400 { error: "expired" }
//
// The e-mail links to /compte/#login=<token>&next=…, a static page whose
// script POSTs the token here. A GET that consumed the token would be spent
// by the mail scanners that open every link of an incoming message before the
// reader does; they don't run the page's script. The token sits in the
// fragment, which no server or log ever sees.
//   POST /api/auth/logout  → { ok: true } (clears gk_session)
//
// Passkeys (server/routes/passkey.ts, /api/auth/passkey/*) sign in to the same
// gk_session; this link stays the way in on a new device.

import { Hono } from "hono";
import { env } from "../env.ts";
import { getIp } from "../http.ts";
import { Quota } from "../ratelimit.ts";
import { database } from "../db.ts";
import { verifyTurnstile } from "../turnstile.ts";
import { mailConfigured, sendLoginMail } from "../mail.ts";
import { LOCALES, type Locale } from "../../lib/i18n.ts";
import { passkeyRp } from "./passkey.ts";
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
  // passkey: whether /api/auth/passkey/* works (server/routes/passkey.ts).
  const passkey = enabled && passkeyRp() !== null;
  return c.json(
    enabled && env.turnstileSecret && env.turnstileSiteKey
      ? { enabled, passkey, turnstileSiteKey: env.turnstileSiteKey }
      : { enabled, passkey },
  );
});

authRoute.post("/request", async (c) => {
  if (!authEnabled()) return c.json({ error: "disabled" }, 503);
  let payload: { email?: unknown; turnstileToken?: unknown; next?: unknown; locale?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "invalid" }, 400);
  }
  const email = normalizeEmail(payload?.email);
  if (!email) return c.json({ error: "invalid-email" }, 400);

  const ip = getIp(c);
  if (ipQuota.exceeded(`ip:${ip}`)) return c.json({ error: "rate-limited" }, 429);
  // Only when /api/auth/config hands out a site key: without one the form has
  // no widget, every token would be empty and nobody could sign in.
  if (env.turnstileSecret && env.turnstileSiteKey) {
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
  const link = `${publicBase()}${ACCOUNT_PATH}#login=${token}&next=${encodeURIComponent(next)}`;

  if (mailConfigured()) {
    try {
      // The form's UI language; anything else gets the default (fr) mail.
      const locale = (LOCALES as readonly unknown[]).includes(payload.locale) ? (payload.locale as Locale) : undefined;
      await sendLoginMail(email, link, locale);
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

authRoute.post("/verify", async (c) => {
  let token = "";
  try {
    const body = (await c.req.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return c.json({ error: "invalid" }, 400);
  }
  try {
    const email = consumeLoginToken(database(), token);
    if (!email) return c.json({ error: "expired" }, 400);
    const db = database();
    const { id } = upsertUser(db, email);
    setSessionCookie(c, createSession(db, id));
  } catch (e) {
    console.error("auth: verify failed", e);
    return c.json({ error: "unavailable" }, 503);
  }
  return c.json({ ok: true });
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
