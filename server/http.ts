import type { Context } from "hono";
import { env } from "./env.ts";

/** Client IP for rate-limiting. Behind a reverse proxy (the norm for a
 *  self-hosted deploy) a proxy-set header is authoritative; otherwise fall
 *  back to the socket address.
 *
 *  CF-Connecting-IP first: when Cloudflare proxies the site, it always
 *  overwrites this header itself from the actual edge connection — a client
 *  can send its own CF-Connecting-IP, but Cloudflare discards it, so this one
 *  can't be spoofed the way X-Forwarded-For can. X-Real-IP is the same idea
 *  for a plain nginx/Caddy front (set once, not a comma-appended list).
 *
 *  X-Forwarded-For only as a last resort, and its LAST entry, not the first:
 *  a proxy that appends (Caddy/nginx's default `X-Forwarded-For: $client_ip,
 *  ...` — it never replaces a value the client already sent) puts the one
 *  honest hop — what it actually observed on the socket — at the end. The
 *  first entry is whatever the client put there, so trusting it let anyone
 *  bypass every per-IP cooldown/quota below just by sending a different fake
 *  leading value each request (confirmed live: same real IP, different
 *  X-Forwarded-For prefix, every request treated as a new client). This still
 *  assumes exactly one untrusted hop before the trusted proxy and that the
 *  app is unreachable except through it — not a substitute for also
 *  firewalling direct access to the container's port. */
export function getIp(c: Context): string {
  if (env.trustProxy) {
    // Pinned single header (recommended): trust only the one header the
    // trusted proxy sets itself, nothing the client can pre-populate.
    if (env.clientIpHeader) {
      const v = c.req.header(env.clientIpHeader);
      // Only this header is trusted. If it's missing, fall through to the
      // socket address rather than the cascade — never to a header a client
      // could have set — so pinning can't be bypassed by simply omitting it.
      if (v) {
        // XFF-style lists: the last hop is the one the trusted proxy observed.
        const parts = v.split(",");
        return parts[parts.length - 1].trim();
      }
      const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } })?.incoming;
      return incoming?.socket?.remoteAddress || "anon";
    }
    const cf = c.req.header("cf-connecting-ip");
    if (cf) return cf;
    const real = c.req.header("x-real-ip");
    if (real) return real;
    const xff = c.req.header("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",");
      return parts[parts.length - 1].trim();
    }
  }
  // @hono/node-server exposes the raw node request on c.env.incoming.
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } })?.incoming;
  return incoming?.socket?.remoteAddress || "anon";
}

/** One JSON object per line — the assistant's NDJSON wire format. */
export const ndLine = (o: unknown) => JSON.stringify(o) + "\n";
