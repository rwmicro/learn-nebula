// Signalling rooms for the two-player features (/duel/: a revision duel, or a
// language tandem call): pure registry logic, no sockets. The route
// (server/routes/room.ts) holds the WebSocket handles as the generic `P`.
//
// A room is two slots, host and guest. The creator gets the room code (shared
// as the guest link) and a host key kept in its own tab; whoever joins
// without the key is the guest. Messages are relayed verbatim between the two
// slots — the server never reads an SDP, it only checks the envelope. Nothing
// is persisted: rooms live in memory and expire after 10 min idle or 1 h.

import { randomBytes, timingSafeEqual } from "node:crypto";

export type RoomKind = "duel" | "tandem";
export type Role = "host" | "guest";

export const ROOM_KINDS: readonly RoomKind[] = ["duel", "tandem"];
/** Envelope types relayed peer to peer; anything else is refused. */
export const RELAY_TYPES = ["hello", "offer", "answer", "ice", "bye"] as const;

export const ROOM_IDLE_MS = 10 * 60_000;
export const ROOM_MAX_MS = 60 * 60_000;
/** One relayed message: an SDP offer with audio is ~4–6 KB. */
export const MAX_MESSAGE_BYTES = 16 * 1024;
/** Concurrent rooms on the instance (memory guard). */
export const MAX_ROOMS = 500;

/** A note slug as lib/content.ts's slugifyPath writes it. */
const REF_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
/** 24 base32 characters = 120 random bits. */
const CODE_RE = /^[a-z2-7]{24}$/;

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

/** Lower-case RFC 4648 base32 without padding (URL- and hash-safe). */
export function base32(bytes: Uint8Array): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

export const newCode = () => base32(randomBytes(15));
export const newKey = () => base32(randomBytes(20));
export const validCode = (s: unknown): s is string => typeof s === "string" && CODE_RE.test(s);
export const validRef = (s: unknown): s is string =>
  typeof s === "string" && s.length <= 300 && REF_RE.test(s);

function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface Room<P> {
  kind: RoomKind;
  /** Duel: the note whose questions are played. Tandem: the language note
   *  (optional) the prompts come from. */
  ref: string | null;
  hostKey: string;
  created: number;
  last: number;
  peers: Partial<Record<Role, P>>;
}

export type JoinResult<P> =
  | { ok: true; role: Role; room: Room<P> }
  | { ok: false; error: "gone" | "full" };

export class RoomRegistry<P> {
  private rooms = new Map<string, Room<P>>();
  constructor(
    private readonly opts = { idleMs: ROOM_IDLE_MS, maxMs: ROOM_MAX_MS, maxRooms: MAX_ROOMS },
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  /** A new empty room, or null when the instance is at capacity. */
  create(kind: RoomKind, ref: string | null, now: number): { code: string; hostKey: string } | null {
    this.sweep(now);
    if (this.rooms.size >= this.opts.maxRooms) return null;
    let code = newCode();
    while (this.rooms.has(code)) code = newCode();
    const hostKey = newKey();
    this.rooms.set(code, { kind, ref, hostKey, created: now, last: now, peers: {} });
    return { code, hostKey };
  }

  /** The live room behind a code (expired ones are dropped on the way). */
  get(code: string, now: number): Room<P> | null {
    const r = this.rooms.get(code);
    if (!r) return null;
    if (this.expired(r, now)) {
      this.rooms.delete(code);
      return null;
    }
    return r;
  }

  /** Takes the host slot with the right key, the guest slot without. A slot
   *  already held refuses a second peer ("full"): rooms are two people. */
  join(code: string, key: string | undefined, peer: P, now: number): JoinResult<P> {
    const r = this.get(code, now);
    if (!r) return { ok: false, error: "gone" };
    const role: Role = key && sameKey(key, r.hostKey) ? "host" : "guest";
    if (r.peers[role]) return { ok: false, error: "full" };
    r.peers[role] = peer;
    r.last = now;
    return { ok: true, role, room: r };
  }

  /** Frees a slot (only if `peer` still holds it). The room itself stays
   *  until it expires, so a reload can come back to it. */
  leave(code: string, role: Role, peer: P, now: number): void {
    const r = this.rooms.get(code);
    if (!r || r.peers[role] !== peer) return;
    delete r.peers[role];
    r.last = now;
  }

  /** The other slot's peer, and marks the room active. */
  other(code: string, role: Role, now: number): P | undefined {
    const r = this.get(code, now);
    if (!r) return undefined;
    r.last = now;
    return r.peers[role === "host" ? "guest" : "host"];
  }

  expired(r: Room<P>, now: number): boolean {
    return now - r.last > this.opts.idleMs || now - r.created > this.opts.maxMs;
  }

  /** Drops expired rooms; returns the peers they still held (to close). */
  sweep(now: number): P[] {
    const dropped: P[] = [];
    for (const [code, r] of this.rooms) {
      if (!this.expired(r, now)) continue;
      for (const p of Object.values(r.peers)) if (p) dropped.push(p);
      this.rooms.delete(code);
    }
    return dropped;
  }
}

/** The relayed envelope, checked but forwarded verbatim: `raw` when it is a
 *  small JSON object whose `t` is a relay type, else null. */
export function relayable(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const t = (o as { t?: unknown }).t;
  return typeof t === "string" && (RELAY_TYPES as readonly string[]).includes(t) ? raw : null;
}

/** Per-connection message budget: a token bucket (`burst` messages, refilled
 *  at `perSec`). Trickle ICE sends a dozen candidates at once; a flood
 *  closes the socket. */
export class Bucket {
  private tokens: number;
  private at: number;
  constructor(
    private readonly burst: number,
    private readonly perSec: number,
    now: number,
  ) {
    this.tokens = burst;
    this.at = now;
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.perSec);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Cloudflare's ICE list minus the port-53 URLs browsers block (they only
 *  time out), and minus anything malformed. */
export function cleanIceServers(x: unknown): RTCIceServerLike[] {
  const list = (x as { iceServers?: unknown })?.iceServers;
  if (!Array.isArray(list)) return [];
  const out: RTCIceServerLike[] = [];
  for (const s of list) {
    const raw = (s as { urls?: unknown })?.urls;
    const urls = (Array.isArray(raw) ? raw : [raw]).filter(
      (u): u is string => typeof u === "string" && /^(stun|turns?):/.test(u) && !/:53(\?|$)/.test(u),
    );
    if (!urls.length) continue;
    const { username, credential } = s as { username?: unknown; credential?: unknown };
    out.push({
      urls,
      ...(typeof username === "string" ? { username } : {}),
      ...(typeof credential === "string" ? { credential } : {}),
    });
  }
  return out;
}

export interface RTCIceServerLike {
  urls: string[];
  username?: string;
  credential?: string;
}

export const DEFAULT_STUN: RTCIceServerLike[] = [{ urls: ["stun:stun.cloudflare.com:3478"] }];
