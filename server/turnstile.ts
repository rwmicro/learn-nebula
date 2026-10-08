// Cloudflare Turnstile server-side check, shared by the comment form and the
// login form. Only called when TURNSTILE_SECRET_KEY is set.

import { env } from "./env.ts";

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
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
