// Shared admin-token check for every owner-only endpoint (comments moderation,
// the questions log). One timing-safe comparison, one place to get it right.

import { env } from "./env.ts";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function isAdmin(auth: string | undefined): boolean {
  if (!env.adminToken) return false;
  const prefix = "Bearer ";
  if (!auth || !auth.startsWith(prefix)) return false;
  return timingSafeEqual(auth.slice(prefix.length), env.adminToken);
}
