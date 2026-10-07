// The logged-in reader's own data. Every route here answers only for the
// session's owner, is never cached (no-store) and, when it writes, requires a
// same-site Origin (session.ts).
//
//   GET    /api/me                → { user: null } | { user: MeView }
//   PUT    /api/me { timezone?, look? } → { user: MeView }
//   POST   /api/progress/sync { items } → { items, coins, streak, earned }
//   GET    /api/account           → AccountView
//   DELETE /api/account           → { ok: true } (and clears the cookie)
//   GET    /api/shop              → ShopView (works logged out: coins null)
//   POST   /api/shop/buy { id }   → { ok, coins, owned, freezes }

import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { database } from "../db.ts";
import { Quota } from "../ratelimit.ts";
import { validTimezone } from "../accounts.ts";
import {
  accountView,
  buy,
  cleanItems,
  deleteUser,
  meView,
  shopView,
  syncProgress,
  updateMe,
} from "../account-store.ts";
import { clearSessionCookie, currentUser, noStore, sameOrigin } from "../session.ts";

/** Largest sync body, and most keys in one. */
export const MAX_SYNC_BYTES = 2 * 1024 * 1024;
export const MAX_SYNC_KEYS = 3000;

function guarded(): Hono {
  const r = new Hono();
  r.use("*", sameOrigin, noStore);
  r.onError((e, c) => {
    console.error("account: request failed", e);
    return c.json({ error: "unavailable" }, 503);
  });
  return r;
}

const unauthenticated = (c: Context) => c.json({ error: "unauthenticated" }, 401);

async function jsonBody(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const v = await c.req.json();
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// --- /api/me -------------------------------------------------------------------

export const meRoute = guarded();

meRoute.get("/", (c) => {
  const uid = currentUser(c);
  return c.json({ user: uid ? meView(database(), uid) : null });
});

meRoute.put("/", async (c) => {
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  const body = await jsonBody(c);
  if (!body) return c.json({ error: "invalid" }, 400);
  const patch: { timezone?: string; look?: unknown } = {};
  if (body.timezone !== undefined) {
    const tz = validTimezone(body.timezone);
    if (!tz) return c.json({ error: "invalid-timezone" }, 400);
    patch.timezone = tz;
  }
  if (body.look !== undefined) patch.look = body.look;
  updateMe(database(), uid, patch);
  return c.json({ user: meView(database(), uid) });
});

// --- /api/progress -------------------------------------------------------------

export const progressRoute = guarded();
// Per account: a device syncs on load, on changes and on leaving — this only
// stops a runaway loop.
const syncQuota = new Quota(120, 10 * 60_000);

progressRoute.post(
  "/sync",
  bodyLimit({ maxSize: MAX_SYNC_BYTES, onError: (c) => c.json({ error: "too-large" }, 413) }),
  async (c) => {
    const uid = currentUser(c);
    if (!uid) return unauthenticated(c);
    if (syncQuota.exceeded(`u:${uid}`)) return c.json({ error: "rate-limited" }, 429);
    const body = await jsonBody(c);
    const raw = body?.items;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return c.json({ error: "invalid" }, 400);
    if (Object.keys(raw).length > MAX_SYNC_KEYS) return c.json({ error: "too-many-keys" }, 413);
    const items = cleanItems(raw);
    if (!items) return c.json({ error: "invalid" }, 400);
    return c.json(syncProgress(database(), uid, items));
  },
);

// --- /api/account --------------------------------------------------------------

export const accountRoute = guarded();

accountRoute.get("/", (c) => {
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  return c.json(accountView(database(), uid));
});

accountRoute.delete("/", (c) => {
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  deleteUser(database(), uid);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// --- /api/shop -----------------------------------------------------------------

export const shopRoute = guarded();

shopRoute.get("/", (c) => c.json(shopView(database(), currentUser(c))));

const BUY_STATUS = { unknown: 404, owned: 409, "max-freezes": 409, insufficient: 402 } as const;

shopRoute.post("/buy", async (c) => {
  const uid = currentUser(c);
  if (!uid) return unauthenticated(c);
  const body = await jsonBody(c);
  const id = body?.id;
  if (typeof id !== "string" || !id || id.length > 64) return c.json({ error: "invalid" }, 400);
  const r = buy(database(), uid, id);
  if (!r.ok) return c.json({ error: r.error }, BUY_STATUS[r.error]);
  return c.json(r);
});
