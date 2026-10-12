// Owner-only build reports for /admin. Same gate as /api/questions and the
// comment moderation endpoints: the bearer token or an admin reader session
// (server/auth.ts).
//
//   GET /api/admin/me           → { via: "token" | "session", email? } — who is in

//   GET /api/admin/version      → served build vs. pensine's latest commit (server/version.ts)
//   GET /api/admin/vault-health → the build-time vault report (scripts/vault-health.ts)
//   GET /api/admin/prereq-suggestions → draft `prerequis` edges (scripts/prereq-suggestions.ts)
//   GET /api/admin/blocked-words → { words, hold } — the comment word filter
//   PUT /api/admin/blocked-words { words: string[], hold?: boolean } → same shape back
//   GET /api/admin/accounts → { accounts, active7d, coinsInCirculation, list } —
//                             the aggregates plus every account (e-mail, sign-up,
//                             last seen, coins), most recently active first
//   …plus the tools in admin-tools.ts (search misses, rebuild, prereq PR,
//   retrieval bench, facts to check), mounted at the end of this file.

import fs from "node:fs";
import { Hono } from "hono";
import { adminSessionEmail, adminVia, isAdminRequest } from "../auth.ts";
import { env } from "../env.ts";
import { versionStatus } from "../version.ts";
import { HOLD_BLOCKED_KEY, blockedWords, holdBlocked, setBlockedWords, setSetting } from "../db.ts";
import { MAX_WORDS, sanitizeWords } from "../blocked-words.ts";
import { adminToolsRoute } from "./admin-tools.ts";
import { database } from "../db.ts";
import { accountList, accountStats } from "../account-store.ts";

export const adminRoute = new Hono();

adminRoute.use("*", async (c, next) => {
  if (!isAdminRequest(c)) {
    return c.json({ error: "Non autorisé." }, 401);
  }
  c.header("cache-control", "no-store");
  await next();
});

adminRoute.get("/me", (c) => {
  const via = adminVia(c);
  return c.json(via === "session" ? { via, email: adminSessionEmail(c) } : { via });
});

adminRoute.get("/version", async (c) => c.json(await versionStatus()));

adminRoute.get("/vault-health", (c) => {
  let raw: string;
  try {
    raw = fs.readFileSync(env.vaultHealth, "utf8");
  } catch {
    return c.json({ error: "Rapport absent — il est généré par le build (scripts/vault-health.ts)." }, 404);
  }
  // Already JSON on disk: pass it through rather than parse + re-serialise.
  return c.body(raw, 200, { "content-type": "application/json; charset=utf-8" });
});

adminRoute.get("/prereq-suggestions", (c) => {
  let raw: string;
  try {
    raw = fs.readFileSync(env.prereqSuggestions, "utf8");
  } catch {
    return c.json(
      { error: "Suggestions absentes — elles sont générées par le build (scripts/prereq-suggestions.ts)." },
      404,
    );
  }
  return c.body(raw, 200, { "content-type": "application/json; charset=utf-8" });
});

adminRoute.get("/accounts", (c) => {
  try {
    const db = database();
    return c.json({ ...accountStats(db), list: accountList(db) });
  } catch (e) {
    console.error("admin: account stats failed", e);
    return c.json({ error: "Base indisponible." }, 503);
  }
});

adminRoute.get("/blocked-words", (c) => {
  try {
    return c.json({ words: blockedWords(), hold: holdBlocked(), max: MAX_WORDS });
  } catch (e) {
    console.error("admin: blocked words read failed", e);
    return c.json({ error: "Base de commentaires indisponible." }, 503);
  }
});

adminRoute.put("/blocked-words", async (c) => {
  let payload: { words?: unknown; hold?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }
  if (!Array.isArray(payload.words)) return c.json({ error: "words : liste attendue." }, 400);
  try {
    setBlockedWords(sanitizeWords(payload.words));
    if (typeof payload.hold === "boolean") setSetting(HOLD_BLOCKED_KEY, payload.hold ? "1" : "0");
    return c.json({ words: blockedWords(), hold: holdBlocked(), max: MAX_WORDS });
  } catch (e) {
    console.error("admin: blocked words write failed", e);
    return c.json({ error: "Base de commentaires indisponible." }, 503);
  }
});

// Mounted after the gate above, so every tool route is token-checked too.
adminRoute.route("/", adminToolsRoute);
