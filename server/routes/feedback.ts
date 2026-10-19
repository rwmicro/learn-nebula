// What readers' browsers report to the owner (lib/feedback.ts), the public
// half. Both land in the comments SQLite for /admin; neither stores an IP.
//
//   POST /api/client-error { message, source, line, stack, path } → 204
//   POST /api/report       { slug, passage, remark }              → 204 | 400 | 429

import { Hono } from "hono";
import { getIp } from "../http.ts";
import { Quota } from "../ratelimit.ts";
import { sameOrigin } from "../session.ts";
import { recordClientError, recordErrorReport } from "../db.ts";
import { normaliseClientError, normaliseReport } from "../../lib/feedback.ts";

// A page that throws in a loop would otherwise write on every frame; the
// beacon also stops itself after a few per page view.
const errorQuota = new Quota(20, 10 * 60_000);
// A reader reports a handful of passages; a flood stops here.
const reportQuota = new Quota(10, 60 * 60_000);

export const clientErrorRoute = new Hono();
clientErrorRoute.use("*", sameOrigin);

clientErrorRoute.post("/", async (c) => {
  let raw: unknown;
  try {
    // sendBeacon posts text/plain to stay a "simple" request; parse it either way.
    raw = JSON.parse(await c.req.text());
  } catch {
    return c.body(null, 400);
  }
  const e = normaliseClientError(raw);
  if (!e) return c.body(null, 400);
  const ip = getIp(c);
  if (ip !== "anon" && errorQuota.exceeded(`cerr:${ip}`)) return c.body(null, 429);
  try {
    recordClientError(e);
  } catch (err) {
    console.warn("client-error: write failed", err);
  }
  return c.body(null, 204);
});

export const reportRoute = new Hono();
reportRoute.use("*", sameOrigin);

reportRoute.post("/", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }
  const r = normaliseReport(raw);
  if (!r) return c.json({ error: "Requête invalide." }, 400);
  const ip = getIp(c);
  if (ip !== "anon" && reportQuota.exceeded(`report:${ip}`)) {
    return c.json({ error: "Trop de signalements, réessaie plus tard." }, 429);
  }
  try {
    if (!recordErrorReport(r)) return c.json({ error: "File pleine, réessaie plus tard." }, 429);
  } catch (err) {
    console.error("report: write failed", err);
    return c.json({ error: "Enregistrement impossible." }, 503);
  }
  return c.body(null, 204);
});
