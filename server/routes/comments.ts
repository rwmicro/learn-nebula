// Comments — the /api/comments Pages Function, backed by local SQLite (db.ts)
// instead of D1. Same routes, validation, moderation and admin auth.
//
//   GET  /api/comments?slug=<slug>    → approved comments for a note
//   GET  /api/comments?status=pending → admin list (Bearer token)
//   POST /api/comments                → submit { slug, name?, body, turnstileToken? }
//   PATCH /api/comments               → admin { id, action: "approve"|"delete" }

import { Hono } from "hono";
import { env } from "../env.ts";
import { getIp } from "../http.ts";
import { Cooldown } from "../ratelimit.ts";
import {
  approvedForSlug,
  pending,
  insertComment,
  setStatus,
  deleteComment,
} from "../db.ts";

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

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function isAdmin(auth: string | undefined): boolean {
  if (!env.adminToken) return false;
  const prefix = "Bearer ";
  if (!auth || !auth.startsWith(prefix)) return false;
  return timingSafeEqual(auth.slice(prefix.length), env.adminToken);
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.turnstileSecret, response: token });
  if (ip && ip !== "anon") body.set("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const data = (await r.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

const cooldown = new Cooldown(5);

export const commentsRoute = new Hono();

commentsRoute.get("/", (c) => {
  const status = c.req.query("status");
  try {
    if (status === "pending") {
      if (!isAdmin(c.req.header("authorization"))) {
        return c.json({ error: "Non autorisé." }, 401);
      }
      return c.json({ comments: pending() });
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

  try {
    insertComment(slug, name || null, body, status);
  } catch (e) {
    console.error("comments: insert failed", e);
    return c.json({ error: "Base de commentaires indisponible." }, 503);
  }
  return c.json({ ok: true, status }, 201);
});

commentsRoute.patch("/", async (c) => {
  if (!isAdmin(c.req.header("authorization"))) {
    return c.json({ error: "Non autorisé." }, 401);
  }
  let payload: { id?: number; action?: "approve" | "delete" };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "Requête invalide." }, 400);
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
