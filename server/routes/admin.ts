// Owner-only build reports for /admin. Same bearer-token gate as
// /api/questions and the comment moderation endpoints.
//
//   GET /api/admin/version      → served build vs. pensine's latest commit (server/version.ts)
//   GET /api/admin/vault-health → the build-time vault report (scripts/vault-health.ts)
//   GET /api/admin/prereq-suggestions → draft `prerequis` edges (scripts/prereq-suggestions.ts)
//   GET /api/admin/blocked-words → { words, hold } — the comment word filter
//   PUT /api/admin/blocked-words { words: string[], hold?: boolean } → same shape back

import fs from "node:fs";
import { Hono } from "hono";
import { isAdmin } from "../auth.ts";
import { getIp } from "../http.ts";
import { env } from "../env.ts";
import { versionStatus } from "../version.ts";
import { HOLD_BLOCKED_KEY, blockedWords, holdBlocked, setBlockedWords, setSetting } from "../db.ts";
import { MAX_WORDS, sanitizeWords } from "../blocked-words.ts";

export const adminRoute = new Hono();

adminRoute.use("*", async (c, next) => {
  if (!isAdmin(c.req.header("authorization"), getIp(c))) {
    return c.json({ error: "Non autorisé." }, 401);
  }
  c.header("cache-control", "no-store");
  await next();
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
