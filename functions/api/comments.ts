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

function isAdmin(env: Env, request: Request): boolean {
  if (!env.COMMENTS_ADMIN_TOKEN) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${env.COMMENTS_ADMIN_TOKEN}`;
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
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

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
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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
  const tokenOk = env.TURNSTILE_SECRET_KEY
    ? await verifyTurnstile(
        env.TURNSTILE_SECRET_KEY,
        payload.turnstileToken ?? "",
        ip,
      )
    : false;
  const status = tokenOk ? "approved" : "pending";

  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO comments (slug, name, body, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?)",
  )
    .bind(slug, name || null, body, status, now)
    .run();

  return json({ ok: true, status }, 201);
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
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
  return json({ ok: true });
};
