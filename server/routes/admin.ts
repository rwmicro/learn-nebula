// Owner-only build reports for /admin. Same bearer-token gate as
// /api/questions and the comment moderation endpoints.
//
//   GET /api/admin/version      → served build vs. pensine's latest commit (server/version.ts)
//   GET /api/admin/vault-health → the build-time vault report (scripts/vault-health.ts)
//   GET /api/admin/prereq-suggestions → draft `prerequis` edges (scripts/prereq-suggestions.ts)

import fs from "node:fs";
import { Hono } from "hono";
import { isAdmin } from "../auth.ts";
import { getIp } from "../http.ts";
import { env } from "../env.ts";
import { versionStatus } from "../version.ts";

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
