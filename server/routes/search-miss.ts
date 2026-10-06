// "Recherches sans résultat" — the public half. The home search and the note
// drawer search POST a query that settled on zero results (lib/search-miss.ts);
// the counts land in the comments SQLite DB for /admin (GET/DELETE
// /api/admin/search-misses). No IP is stored.
//
//   POST /api/search-miss { q, where: "home" | "note" } → 204

import { Hono } from "hono";
import { getIp } from "../http.ts";
import { Cooldown, Quota } from "../ratelimit.ts";
import { recordSearchMiss } from "../db.ts";
import { isSearchMissWhere, normaliseSearchMiss } from "../../lib/search-miss.ts";

// A reader trying spellings fires a handful in a minute; a flood doesn't get
// to write more than this per IP.
const quota = new Quota(30, 10 * 60_000);
// The same reader repeating the same query (a reload, another tab) counts once
// an hour — the count is "how many times people missed", not "how many POSTs".
const repeat = new Cooldown(3600);

export const searchMissRoute = new Hono();

searchMissRoute.post("/", async (c) => {
  let payload: { q?: unknown; where?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }
  const q = normaliseSearchMiss(payload?.q);
  const where = payload?.where;
  if (!q || !isSearchMissWhere(where)) return c.json({ error: "Requête invalide." }, 400);

  const ip = getIp(c);
  if (ip !== "anon" && quota.exceeded(`miss:${ip}`)) {
    return c.json({ error: "Trop de requêtes." }, 429);
  }
  if (ip !== "anon" && repeat.limited(`miss:${ip}:${where}:${q}`)) {
    return c.body(null, 204);
  }
  try {
    recordSearchMiss(q, where);
  } catch (e) {
    console.warn("search-miss: write failed", e);
  }
  return c.body(null, 204);
});
