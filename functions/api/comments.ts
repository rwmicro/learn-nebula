/// <reference types="@cloudflare/workers-types" />

// Comments endpoint (Cloudflare Pages Function), backed by D1.
//
// Routes:
//   GET  /api/comments?slug=<slug>    → public list of approved comments
//   GET  /api/comments?status=pending → admin list (Bearer admin token)
//   POST /api/comments                → submit { slug, name?, body, turnstileToken? }
//                                       Hybrid moderation: Turnstile OK → approved,
//                                       otherwise stored as pending.
//   PATCH /api/comments               → admin action { id, action: "approve"|"delete" }
//
// Bindings (wrangler.toml):
//   DB                     — D1 database "garden-comments"
//   TURNSTILE_SECRET_KEY   — secret, Cloudflare Turnstile siteverify key
//   COMMENTS_ADMIN_TOKEN   — secret, Bearer token gating admin GET/PATCH

interface Env {
  DB: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  COMMENTS_ADMIN_TOKEN?: string;
}

interface CommentRow {
  id: number;
  slug?: string;
  name: string | null;
  body: string;
  created_at: number;
}

const MAX_NAME = 80;
const MAX_BODY = 2000;
const MAX_SLUG = 200;
const PAGE_LIMIT = 100;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clean(s: string, max: number): string {
  // Collapse runs of whitespace but keep newlines so the body can have line
  // breaks (the frontend converts \n to <br> at render).
  return s.replace(/[ \t]+/g, " ").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

// Length-checked constant-time compare so the admin token can't be recovered
// from the timing of the `===` short-circuit.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function isAdmin(env: Env, request: Request): boolean {
  if (!env.COMMENTS_ADMIN_TOKEN) return false;
  const auth = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) return false;
  return timingSafeEqual(auth.slice(prefix.length), env.COMMENTS_ADMIN_TOKEN);
}

// Per-IP cooldown via the Cache API — blunts scripted comment spam. Per-colo and
// best-effort (fails open); a hard cap needs a Cloudflare WAF rule.
const RATE_COOLDOWN_S = 5;
async function rateLimited(ip?: string): Promise<boolean> {
  if (!ip) return false;
  try {
    const cache = caches.default;
    const key = new Request(
      `https://ratelimit.internal/comments/${encodeURIComponent(ip)}`,
    );
    if (await cache.match(key)) return true;
    await cache.put(
      key,
      new Response("1", {
        headers: { "cache-control": `max-age=${RATE_COOLDOWN_S}` },
      }),
    );
    return false;
  } catch {
    return false;
  }
}

async function verifyTurnstile(
  secret: string,
  token: string,
  remoteip?: string,
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);
  try {
    const r = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const data = (await r.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Commentaires non configurés." }, 503);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  try {
    // Admin: list pending across the whole site.
    if (status === "pending") {
      if (!isAdmin(env, request)) return json({ error: "Non autorisé." }, 401);
      const { results } = await env.DB.prepare(
        "SELECT id, slug, name, body, created_at FROM comments " +
          "WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?",
      )
        .bind(PAGE_LIMIT)
        .all<CommentRow>();
      return json({ comments: results ?? [] });
    }

    const slug = url.searchParams.get("slug");
    if (!slug) return json({ error: "slug requis." }, 400);
    const { results } = await env.DB.prepare(
      "SELECT id, name, body, created_at FROM comments " +
        "WHERE slug = ? AND status = 'approved' " +
        "ORDER BY created_at ASC LIMIT ?",
    )
      .bind(slug.slice(0, MAX_SLUG), PAGE_LIMIT)
      .all<CommentRow>();
    return json({ comments: results ?? [] });
  } catch (e) {
    console.error("comments: D1 read failed", e);
    return json({ error: "Base de commentaires indisponible." }, 503);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Commentaires non configurés." }, 503);
  let payload: {
    slug?: string;
    name?: string;
    body?: string;
    turnstileToken?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }

  const slug = clean(payload.slug ?? "", MAX_SLUG);
  const name = clean(payload.name ?? "", MAX_NAME);
  const body = clean(payload.body ?? "", MAX_BODY);
  if (!slug || !body) {
    return json({ error: "Slug et message requis." }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? undefined;
  if (await rateLimited(ip)) {
    return json({ error: "Trop de requêtes — réessaie dans un instant." }, 429);
  }

  // Moderation. When Turnstile is configured a valid token is REQUIRED — this
  // stops scripted POSTs from flooding the moderation queue with pending rows.
  // Without a Turnstile secret (local/preview) comments are accepted but held
  // for manual moderation.
  let status: "approved" | "pending";
  if (env.TURNSTILE_SECRET_KEY) {
    const ok = await verifyTurnstile(
      env.TURNSTILE_SECRET_KEY,
      payload.turnstileToken ?? "",
      ip,
    );
    if (!ok) return json({ error: "Vérification anti-robot échouée." }, 403);
    status = "approved";
  } else {
    status = "pending";
  }

  try {
    await env.DB.prepare(
      "INSERT INTO comments (slug, name, body, status, created_at) " +
        "VALUES (?, ?, ?, ?, ?)",
    )
      .bind(slug, name || null, body, status, Date.now())
      .run();
  } catch (e) {
    console.error("comments: D1 insert failed", e);
    return json({ error: "Base de commentaires indisponible." }, 503);
  }

  return json({ ok: true, status }, 201);
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DB) return json({ error: "Commentaires non configurés." }, 503);
  if (!isAdmin(env, request)) return json({ error: "Non autorisé." }, 401);
  let payload: { id?: number; action?: "approve" | "delete" };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: "id requis." }, 400);
  }
  try {
    if (payload.action === "approve") {
      await env.DB.prepare(
        "UPDATE comments SET status = 'approved' WHERE id = ?",
      )
        .bind(id)
        .run();
    } else if (payload.action === "delete") {
      await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
    } else {
      return json({ error: "Action inconnue." }, 400);
    }
  } catch (e) {
    console.error("comments: D1 write failed", e);
    return json({ error: "Base de commentaires indisponible." }, 503);
  }
  return json({ ok: true });
};
