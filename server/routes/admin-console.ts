// Owner-only /admin console routes, mounted under /api/admin by admin.ts (so
// behind its gate and no-store header):
//
//   GET  /usage                → { ask, translate }: LLM calls over the last 24 h vs. the daily caps
//   GET  /activity?days=30     → { days, questions, comments, signups, active } per day (Europe/Paris)
//   GET  /events?limit=        → { events }: the admin journal, newest first
//   POST /comments/:id/reply   → { body } → the owner's answer, published at once
//   GET  /prereq-ignored       → { keys }: prerequisite suggestions dismissed in /admin
//   PUT  /prereq-ignored       → { keys } → same shape back
//   POST /webhook-test         → pings COMMENT_WEBHOOK_URL with a test line

import { Hono } from "hono";
import { env } from "../env.ts";
import { AUTHOR } from "../../lib/site.ts";
import { audit } from "../auth.ts";
import { DEFAULT_TZ, dayIn } from "../accounts.ts";
import { activeByDay } from "../account-store.ts";
import {
  adminEvents,
  createdSince,
  database,
  getSetting,
  insertAuthorReply,
  setSetting,
} from "../db.ts";
import { askUsage } from "./ask.ts";
import { translateUsage } from "./translate.ts";

export const adminConsoleRoute = new Hono();

const DAY_MS = 86_400_000;
const MAX_REPLY = 4000;
const PREREQ_IGNORED_KEY = "prereq_ignored";
const MAX_IGNORED = 2000;

adminConsoleRoute.get("/usage", (c) => c.json({ ask: askUsage(), translate: translateUsage() }));

/** The last `n` days, oldest first, as YYYY-MM-DD in the site's time zone. */
export function lastDays(n: number, now = Date.now()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayIn(DEFAULT_TZ, new Date(now - i * DAY_MS)));
  // Two instants a day apart can land on the same calendar day around a DST
  // change: keep each day once.
  return [...new Set(out)];
}

export function bucket(days: string[], stamps: number[]): number[] {
  const idx = new Map(days.map((d, i) => [d, i]));
  const counts = days.map(() => 0);
  for (const t of stamps) {
    const i = idx.get(dayIn(DEFAULT_TZ, new Date(t)));
    if (i !== undefined) counts[i]++;
  }
  return counts;
}

adminConsoleRoute.get("/activity", (c) => {
  const n = Math.min(90, Math.max(7, Math.floor(Number(c.req.query("days"))) || 30));
  const days = lastDays(n);
  const since = Date.now() - (n + 1) * DAY_MS;
  try {
    const active = activeByDay(database(), days[0]);
    return c.json({
      days,
      questions: bucket(days, createdSince("questions", since)),
      comments: bucket(days, createdSince("comments", since)),
      signups: bucket(days, createdSince("users", since)),
      active: days.map((d) => active[d] ?? 0),
    });
  } catch (e) {
    console.error("admin: activity read failed", e);
    return c.json({ error: "Base indisponible." }, 503);
  }
});

adminConsoleRoute.get("/events", (c) => {
  try {
    return c.json({ events: adminEvents(Number(c.req.query("limit")) || 100) });
  } catch (e) {
    console.error("admin: journal read failed", e);
    return c.json({ error: "Journal indisponible." }, 503);
  }
});

adminConsoleRoute.post("/comments/:id/reply", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "id invalide." }, 400);
  let payload: { body?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }
  const body = typeof payload.body === "string" ? payload.body.trim().slice(0, MAX_REPLY) : "";
  if (!body) return c.json({ error: "Réponse vide." }, 400);
  try {
    const newId = insertAuthorReply(id, env.commentAuthorName || AUTHOR, body);
    if (newId === null) return c.json({ error: "Commentaire introuvable." }, 404);
    audit(c, "comment.reply", `#${id} → #${newId}`);
    return c.json({ ok: true, id: newId }, 201);
  } catch (e) {
    console.error("admin: reply failed", e);
    return c.json({ error: "Base de commentaires indisponible." }, 503);
  }
});

function readIgnored(): string[] {
  try {
    const v = JSON.parse(getSetting(PREREQ_IGNORED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

adminConsoleRoute.get("/prereq-ignored", (c) => {
  try {
    return c.json({ keys: readIgnored() });
  } catch (e) {
    console.error("admin: prereq-ignored read failed", e);
    return c.json({ error: "Base indisponible." }, 503);
  }
});

adminConsoleRoute.put("/prereq-ignored", async (c) => {
  let payload: { keys?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }
  if (!Array.isArray(payload.keys)) return c.json({ error: "keys : liste attendue." }, 400);
  const keys = [
    ...new Set(payload.keys.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 500)),
  ].slice(0, MAX_IGNORED);
  try {
    setSetting(PREREQ_IGNORED_KEY, JSON.stringify(keys));
    return c.json({ keys });
  } catch (e) {
    console.error("admin: prereq-ignored write failed", e);
    return c.json({ error: "Base indisponible." }, 503);
  }
});

adminConsoleRoute.post("/webhook-test", async (c) => {
  if (!env.commentWebhookUrl) {
    return c.json({ error: "COMMENT_WEBHOOK_URL n'est pas défini." }, 503);
  }
  try {
    const r = await fetch(env.commentWebhookUrl, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: "Test depuis /admin : les notifications de commentaires arrivent bien.",
      signal: AbortSignal.timeout(10_000),
    });
    audit(c, "webhook.test", `HTTP ${r.status}`);
    if (!r.ok) return c.json({ error: `Le webhook a répondu HTTP ${r.status}.` }, 502);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: `Webhook injoignable — ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
});
