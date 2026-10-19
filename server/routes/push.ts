// Daily review reminders (Web Push), opt-in from /compte.
//
//   GET    /api/push/config                   → { enabled, publicKey? }
//   GET    /api/push/subscribe?endpoint=…      → { hour } | 404 (signed in)
//   POST   /api/push/subscribe { subscription, hour, tz, locale } → { ok }
//   DELETE /api/push/subscribe { endpoint }    → { ok }
//
// Signed-in readers only (the reminder counts their synced cards), same-site
// Origin on writes like every account route. VAPID unset → 503 / enabled:false.

import { Hono, type Context } from "hono";
import { env, pushConfigured } from "../env.ts";
import { database } from "../db.ts";
import { Quota } from "../ratelimit.ts";
import { validTimezone } from "../accounts.ts";
import { currentUser, noStore, sameOrigin } from "../session.ts";
import { parseSubscription, pushLocale, validHour } from "../push.ts";
import { deleteSubscription, subscriptionFor, upsertSubscription } from "../push-store.ts";

export const pushRoute = new Hono();
pushRoute.use("*", sameOrigin, noStore);
pushRoute.onError((e, c) => {
  console.error("push: request failed", e);
  return c.json({ error: "unavailable" }, 503);
});

const quota = new Quota(30, 60 * 60_000);
const disabled = (c: Context) => c.json({ error: "disabled" }, 503);
const unauthenticated = (c: Context) => c.json({ error: "unauthenticated" }, 401);

pushRoute.get("/config", (c) =>
  c.json(pushConfigured() ? { enabled: true, publicKey: env.vapidPublicKey } : { enabled: false }),
);

pushRoute.get("/subscribe", (c) => {
  if (!pushConfigured()) return disabled(c);
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  const endpoint = c.req.query("endpoint") ?? "";
  const s = endpoint ? subscriptionFor(database(), endpoint, uid) : null;
  return s ? c.json(s) : c.json({ error: "not-found" }, 404);
});

pushRoute.post("/subscribe", async (c) => {
  if (!pushConfigured()) return disabled(c);
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  if (quota.exceeded(`u:${uid}`)) return c.json({ error: "rate-limited" }, 429);
  let body: { subscription?: unknown; hour?: unknown; tz?: unknown; locale?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid" }, 400);
  }
  const sub = parseSubscription(body?.subscription);
  const hour = validHour(body?.hour);
  const tz = validTimezone(body?.tz);
  if (!sub || hour == null || !tz) return c.json({ error: "invalid" }, 400);
  const ok = upsertSubscription(database(), { ...sub, userId: uid, hour, tz, locale: pushLocale(body.locale) });
  return ok ? c.json({ ok: true }) : c.json({ error: "too-many" }, 409);
});

pushRoute.delete("/subscribe", async (c) => {
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  let endpoint = "";
  try {
    const b = (await c.req.json()) as { endpoint?: unknown };
    endpoint = typeof b.endpoint === "string" ? b.endpoint : "";
  } catch {
    return c.json({ error: "invalid" }, 400);
  }
  if (!endpoint || endpoint.length > 1024) return c.json({ error: "invalid" }, 400);
  deleteSubscription(database(), endpoint, uid);
  return c.json({ ok: true });
});
