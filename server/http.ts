import type { Context } from "hono";
import { env } from "./env.ts";

/** Client IP for rate-limiting. Behind a reverse proxy (the norm for a
 *  self-hosted deploy) X-Forwarded-For is authoritative; otherwise fall back to
 *  the socket address. */
export function getIp(c: Context): string {
  if (env.trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const real = c.req.header("x-real-ip") || c.req.header("cf-connecting-ip");
    if (real) return real;
  }
  // @hono/node-server exposes the raw node request on c.env.incoming.
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } })?.incoming;
  return incoming?.socket?.remoteAddress || "anon";
}

/** One JSON object per line — the assistant's NDJSON wire format. */
export const ndLine = (o: unknown) => JSON.stringify(o) + "\n";
