import type { Context } from "hono";
import { env } from "./env.ts";

/** Client IP for rate-limiting. Behind a reverse proxy (the norm for a
 *  self-hosted deploy) X-Forwarded-For is authoritative; otherwise fall back to
 *  the socket address.
 *
 *  Takes the LAST entry of X-Forwarded-For, not the first: a proxy that
 *  appends (Caddy/nginx's default `X-Forwarded-For: $client_ip, ...` — it
 *  never replaces a value the client already sent) puts the one honest hop —
 *  what it actually observed on the socket — at the end. The first entry is
 *  whatever the client put there, so trusting it let anyone bypass every
 *  per-IP cooldown/quota below just by sending a different fake leading value
 *  each request (confirmed: same real IP, different X-Forwarded-For prefix,
 *  every request treated as a new client). This assumes exactly one trusted
 *  proxy hop and that the app is unreachable except through it — true for the
 *  documented single-reverse-proxy deployment, not a substitute for also
 *  firewalling direct access to the container's port. */
export function getIp(c: Context): string {
  if (env.trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",");
      return parts[parts.length - 1].trim();
    }
    const real = c.req.header("x-real-ip") || c.req.header("cf-connecting-ip");
    if (real) return real;
  }
  // @hono/node-server exposes the raw node request on c.env.incoming.
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } })?.incoming;
  return incoming?.socket?.remoteAddress || "anon";
}

/** One JSON object per line — the assistant's NDJSON wire format. */
export const ndLine = (o: unknown) => JSON.stringify(o) + "\n";
