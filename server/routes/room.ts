// Two-player rooms (/duel/): the signalling half of WebRTC. The browsers talk
// directly once connected; this only introduces them, and remembers nothing.
//
//   POST /api/room { kind: "duel"|"tandem", ref? } → { code, key }
//   GET  /api/room/ice                            → { iceServers, relay }
//   GET  /api/room/:code  (WebSocket)
//        → first message { t:"join", k? } (k = the host key, kept in the
//          creator's tab, so it never shows in a URL or a log line)
//        ← { t:"room", kind, ref, role, peer }  then  { t:"peer", on }
//        ⇄ { t:"hello"|"offer"|"answer"|"ice"|"bye", … } relayed verbatim
//
// Pure room logic: server/rooms.ts. In-memory, per-instance (one container).

import { Hono } from "hono";
import type { NodeWebSocket } from "@hono/node-ws";
import type { WSContext } from "hono/ws";
import { env } from "../env.ts";
import { getIp } from "../http.ts";
import { Quota } from "../ratelimit.ts";
import { originAllowed, publicBase } from "../session.ts";
import {
  Bucket,
  DEFAULT_STUN,
  MAX_MESSAGE_BYTES,
  ROOM_KINDS,
  RoomRegistry,
  cleanIceServers,
  relayable,
  validCode,
  validRef,
  type Role,
  type RoomKind,
} from "../rooms.ts";

type Peer = WSContext;
const rooms = new RoomRegistry<Peer>();

// Creating a room is cheap but each holds memory for up to an hour.
const createQuota = new Quota(20, 3_600_000);
// Socket attempts per IP (codes are 120-bit, this just bounds the churn).
const joinQuota = new Quota(60, 3_600_000);
// Each relay credential is a Cloudflare API call.
const iceQuota = new Quota(30, 3_600_000);

/** Credentials outlive the longest room (1 h) with margin. */
const TURN_TTL_S = 7200;

const sweeper = setInterval(() => {
  for (const p of rooms.sweep(Date.now())) {
    try {
      p.close(4009, "expired");
    } catch {
      /* already closed */
    }
  }
}, 30_000);
if (typeof sweeper.unref === "function") sweeper.unref();

function hostOf(c: { req: { header(n: string): string | undefined } }): string | undefined {
  return (env.trustProxy && c.req.header("x-forwarded-host")) || c.req.header("host");
}

export const turnConfigured = () => Boolean(env.turnKeyId && env.turnKeyApiToken);

async function mintIce(): Promise<ReturnType<typeof cleanIceServers>> {
  const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.turnKeyId)}/credentials/generate-ice-servers`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.turnKeyApiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: TURN_TTL_S }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`turn: HTTP ${r.status}`);
  return cleanIceServers(await r.json());
}

export function roomRoute(ws: NodeWebSocket): Hono {
  // One relayed message at most; ws closes the socket (1009) above it.
  ws.wss.options.maxPayload = MAX_MESSAGE_BYTES;
  const route = new Hono();

  route.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  route.get("/ice", async (c) => {
    const ip = getIp(c);
    if (!turnConfigured() || (ip !== "anon" && iceQuota.exceeded(`ice:${ip}`))) {
      return c.json({ iceServers: DEFAULT_STUN, relay: false });
    }
    try {
      const servers = await mintIce();
      const relay = servers.some((s) => s.urls.some((u) => u.startsWith("turn")));
      return c.json({ iceServers: servers.length ? servers : DEFAULT_STUN, relay });
    } catch (e) {
      console.warn("room: TURN credentials failed", e);
      return c.json({ iceServers: DEFAULT_STUN, relay: false });
    }
  });

  route.post("/", async (c) => {
    if (!originAllowed(c.req.header("origin"), hostOf(c), publicBase())) {
      return c.json({ error: "bad-origin" }, 403);
    }
    let body: { kind?: unknown; ref?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "bad-request" }, 400);
    }
    const kind = body?.kind;
    if (!ROOM_KINDS.includes(kind as RoomKind)) return c.json({ error: "bad-request" }, 400);
    const ref = body.ref == null || body.ref === "" ? null : body.ref;
    if (ref !== null && !validRef(ref)) return c.json({ error: "bad-request" }, 400);
    if (kind === "duel" && ref === null) return c.json({ error: "bad-request" }, 400);
    const ip = getIp(c);
    if (ip !== "anon" && createQuota.exceeded(`room:${ip}`)) return c.json({ error: "rate" }, 429);
    const made = rooms.create(kind as RoomKind, ref, Date.now());
    if (!made) return c.json({ error: "busy" }, 503);
    return c.json({ code: made.code, key: made.hostKey }, 201);
  });

  route.get(
    "/:code",
    async (c, next) => {
      const code = c.req.param("code");
      if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "upgrade" }, 426);
      if (!originAllowed(c.req.header("origin"), hostOf(c), publicBase())) return c.body(null, 403);
      if (!validCode(code) || !rooms.get(code, Date.now())) return c.body(null, 404);
      const ip = getIp(c);
      if (ip !== "anon" && joinQuota.exceeded(`roomws:${ip}`)) return c.body(null, 429);
      return next();
    },
    ws.upgradeWebSocket((c) => {
      const code = c.req.param("code") ?? "";
      let role: Role | null = null;
      let self: Peer | null = null;
      const bucket = new Bucket(60, 5, Date.now());
      let joinTimer: ReturnType<typeof setTimeout> | null = null;
      const send = (p: Peer | undefined, o: unknown) => {
        try {
          p?.send(JSON.stringify(o));
        } catch {
          /* peer went away */
        }
      };
      return {
        onOpen(_e, wsc) {
          // A socket that never says who it is doesn't keep its slot warm.
          joinTimer = setTimeout(() => wsc.close(4001, "join"), 5000);
        },
        onMessage(e, wsc) {
          const now = Date.now();
          if (!bucket.take(now)) return wsc.close(4008, "rate");
          if (role === null) {
            if (joinTimer) clearTimeout(joinTimer);
            let msg: { t?: unknown; k?: unknown } | null = null;
            try {
              msg = typeof e.data === "string" ? JSON.parse(e.data) : null;
            } catch {
              /* refused below */
            }
            if (!msg || msg.t !== "join") return wsc.close(4002, "join");
            const res = rooms.join(code, typeof msg.k === "string" ? msg.k : undefined, wsc, now);
            if (!res.ok) return wsc.close(res.error === "full" ? 4003 : 4004, res.error);
            role = res.role;
            self = wsc;
            const other = rooms.other(code, role, now);
            send(wsc, { t: "room", kind: res.room.kind, ref: res.room.ref, role, peer: !!other });
            send(other, { t: "peer", on: true });
            return;
          }
          const raw = relayable(e.data);
          if (raw === null) return wsc.close(4002, "message");
          const other = rooms.other(code, role, now);
          if (!other) return; // the other one left: dropped, nothing kept
          try {
            other.send(raw);
          } catch {
            /* closing */
          }
        },
        onClose() {
          if (joinTimer) clearTimeout(joinTimer);
          if (role === null || !self) return;
          const now = Date.now();
          rooms.leave(code, role, self, now);
          send(rooms.other(code, role, now), { t: "peer", on: false });
        },
      };
    }),
  );

  return route;
}
