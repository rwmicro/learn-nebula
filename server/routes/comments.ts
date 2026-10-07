// Comments — the /api/comments Pages Function, backed by local SQLite (db.ts)
// instead of D1. Same routes, validation, moderation and admin auth.
//
//   GET  /api/comments?slug=<slug>    → approved comments for a note
//   GET  /api/comments?status=pending → admin list (Bearer token)
//   GET  /api/comments?status=approved&q=&offset=&limit=
//                                     → admin list of published comments,
//                                       newest first, { comments, total }
//   POST /api/comments                → submit { slug, name?, body, turnstileToken? }
//   PATCH /api/comments               → admin { id | ids, action: "approve"|"delete" }
//
// Pending comments come back with `flagged`: the blocked words (edited at
// /api/admin/blocked-words) they contain. With the "hold" setting on, a
// comment containing one stays pending even when Turnstile would publish it.

import { Hono } from "hono";
import { env } from "../env.ts";
import { getIp } from "../http.ts";
import { isAdmin } from "../auth.ts";
import { Cooldown } from "../ratelimit.ts";
import {
  approvedForSlug,
  pending,
  approvedPage,
  insertComment,
  setStatus,
  deleteComment,
  moderateMany,
  blockedWords,
  holdBlocked,
} from "../db.ts";
import { matchBlocked } from "../blocked-words.ts";
import { verifyTurnstile } from "../turnstile.ts";

const MAX_BULK = 100;

const MAX_NAME = 80;
const MAX_BODY = 2000;
const MAX_SLUG = 200;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

function clean(s: string, max: number): string {
  return (
    s
      // Strip control chars (keep \t \n \r) and zero-width / bidi-override
      // characters (Trojan-Source display tricks) before normalization.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\r\n?/g, "\n")
      .trim()
      .slice(0, max)
  );
}

/** Best-effort ping so moderation doesn't rely on remembering to check /admin.
 *  Fire-and-forget: a broken/unreachable webhook must never affect the comment
 *  submission itself. */
function notifyWebhook(slug: string, name: string | null, body: string): void {
  if (!env.commentWebhookUrl) return;
  const preview = body.length > 200 ? `${body.slice(0, 200)}…` : body;
  fetch(env.commentWebhookUrl, {
    method: "POST",
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: `Nouveau commentaire en attente sur ${slug} — ${name || "anonyme"} : « ${preview} »`,
  }).catch((e) => {
    console.warn("comments: webhook notify failed", e instanceof Error ? e.message : e);
  });
}

const cooldown = new Cooldown(5);

export const commentsRoute = new Hono();

commentsRoute.get("/", (c) => {
  const status = c.req.query("status");
  try {
    if (status === "pending") {
      if (!isAdmin(c.req.header("authorization"), getIp(c))) {
        return c.json({ error: "Non autorisé." }, 401);
      }
      const words = blockedWords();
      const comments = pending().map((row) => ({
        ...row,
        flagged: matchBlocked(`${row.name ?? ""}\n${row.body}`, words),
      }));
      return c.json({ comments });
    }
    if (status === "approved") {
      if (!isAdmin(c.req.header("authorization"), getIp(c))) {
        return c.json({ error: "Non autorisé." }, 401);
      }
      const limit = Math.min(Math.max(Math.floor(Number(c.req.query("limit"))) || 20, 1), 100);
      const offset = Math.max(Math.floor(Number(c.req.query("offset"))) || 0, 0);
      const q = (c.req.query("q") ?? "").slice(0, 200);
      return c.json(approvedPage({ q, limit, offset }));
    }
    const slug = c.req.query("slug");
    if (!slug) return c.json({ error: "slug requis." }, 400);
    return c.json({ comments: approvedForSlug(slug.slice(0, MAX_SLUG)) });
  } catch (e) {
    console.error("comments: read failed", e);
    return c.json({ error: "Base de commentaires indisponible." }, 503);
  }
});

commentsRoute.post("/", async (c) => {
  let payload: { slug?: string; name?: string; body?: string; turnstileToken?: string };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }

  const slug = clean(payload.slug ?? "", MAX_SLUG);
  const name = clean(payload.name ?? "", MAX_NAME);
  const body = clean(payload.body ?? "", MAX_BODY);
  if (!slug || !body) return c.json({ error: "Slug et message requis." }, 400);
  if (!SLUG_RE.test(slug)) return c.json({ error: "Slug invalide." }, 400);

  const ip = getIp(c);
  if (ip !== "anon" && cooldown.limited(`comments:${ip}`)) {
    return c.json({ error: "Trop de requêtes — réessaie dans un instant." }, 429);
  }

  // When a Turnstile secret is configured, a valid token is required (approved);
  // otherwise the comment is held for manual moderation (pending).
  let status: "approved" | "pending";
  if (env.turnstileSecret) {
    const ok = await verifyTurnstile(payload.turnstileToken ?? "", ip);
    if (!ok) return c.json({ error: "Vérification anti-robot échouée." }, 403);
    status = "approved";
  } else {
    status = "pending";
  }
  if (status === "approved") {
    try {
      if (holdBlocked() && matchBlocked(`${name}\n${body}`, blockedWords()).length) status = "pending";
    } catch (e) {
      console.error("comments: word filter unavailable", e);
    }
  }

  try {
    insertComment(slug, name || null, body, status);
  } catch (e) {
    console.error("comments: insert failed", e);
    return c.json({ error: "Base de commentaires indisponible." }, 503);
  }
  if (status === "pending") notifyWebhook(slug, name || null, body);
  return c.json({ ok: true, status }, 201);
});

commentsRoute.patch("/", async (c) => {
  if (!isAdmin(c.req.header("authorization"), getIp(c))) {
    return c.json({ error: "Non autorisé." }, 401);
  }
  let payload: { id?: number; ids?: unknown; action?: "approve" | "delete" };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
  }
  if (payload.ids !== undefined) {
    const ids = Array.isArray(payload.ids) ? payload.ids.map(Number) : [];
    if (!ids.length || ids.length > MAX_BULK || !ids.every((n) => Number.isInteger(n) && n > 0)) {
      return c.json({ error: `ids : 1 à ${MAX_BULK} entiers positifs.` }, 400);
    }
    if (payload.action !== "approve" && payload.action !== "delete") {
      return c.json({ error: "Action inconnue." }, 400);
    }
    try {
      return c.json({ ok: true, changed: moderateMany([...new Set(ids)], payload.action) });
    } catch (e) {
      console.error("comments: bulk write failed", e);
      return c.json({ error: "Base de commentaires indisponible." }, 503);
    }
  }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "id requis." }, 400);
  try {
    if (payload.action === "approve") setStatus(id, "approved");
    else if (payload.action === "delete") deleteComment(id);
    else return c.json({ error: "Action inconnue." }, 400);
  } catch (e) {
    console.error("comments: write failed", e);
    return c.json({ error: "Base de commentaires indisponible." }, 503);
  }
  return c.json({ ok: true });
});
