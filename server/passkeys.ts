// Passkeys for reader accounts: the pure parts (relying party, challenges,
// row mapping, device labels). The ceremonies are in server/routes/passkey.ts,
// the SQL in server/passkey-store.ts.

/** How long a registration or login challenge may be answered. */
export const CHALLENGE_TTL_MS = 5 * 60_000;
/** Most challenges held at once (one per open login form): a flood of
 *  "options" requests can't grow the map without bound. */
export const MAX_CHALLENGES = 20_000;

export interface RelyingParty {
  /** The registrable domain the passkeys are bound to (the site's host). */
  id: string;
  /** The exact origin the browser reports in clientDataJSON. */
  origin: string;
}

/** RP ID and origin from the site's public base URL. Null when it is not a
 *  URL WebAuthn accepts (https, or http on localhost for local tests). */
export function relyingParty(base: string): RelyingParty | null {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname.endsWith(".localhost");
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  // An IP address is not a valid RP ID.
  if (/^[\d.]+$/.test(u.hostname) || u.hostname.includes(":")) return null;
  return { id: u.hostname, origin: u.origin };
}

/**
 * Server-side challenges: short-lived and single-use. `take` removes the
 * entry whatever the outcome, so a challenge can never be answered twice.
 */
export class ChallengeStore {
  private map = new Map<string, { value: string; expires: number }>();
  constructor(
    private readonly ttlMs = CHALLENGE_TTL_MS,
    private readonly max = MAX_CHALLENGES,
  ) {}

  put(key: string, value: string, now = Date.now()): void {
    if (this.map.size >= this.max) this.sweep(now);
    // Still full of live entries: drop the oldest (Map keeps insertion order).
    while (this.map.size >= this.max) {
      const first = this.map.keys().next().value;
      if (first === undefined) break;
      this.map.delete(first);
    }
    this.map.delete(key); // re-insert at the end
    this.map.set(key, { value, expires: now + this.ttlMs });
  }

  /** The value if it is still live; gone from the store either way. */
  take(key: string, now = Date.now()): string | null {
    const e = this.map.get(key);
    if (!e) return null;
    this.map.delete(key);
    return e.expires > now ? e.value : null;
  }

  sweep(now = Date.now()): void {
    for (const [k, e] of this.map) if (e.expires <= now) this.map.delete(k);
  }

  get size(): number {
    return this.map.size;
  }
}

/** The challenge a WebAuthn response answers, read from its clientDataJSON
 *  (base64url JSON). Null when the response is malformed. */
export function challengeOf(response: unknown): string | null {
  const data = (response as { response?: { clientDataJSON?: unknown } } | null)?.response?.clientDataJSON;
  if (typeof data !== "string" || !data || data.length > 4096) return null;
  try {
    const c = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as { challenge?: unknown };
    return typeof c.challenge === "string" && c.challenge ? c.challenge : null;
  } catch {
    return null;
  }
}

const TRANSPORTS = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
export type Transport = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

/** Stored transports (JSON text) → the known ones. */
export function parseTransports(raw: string | null | undefined): Transport[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(v) ? (v.filter((t) => typeof t === "string" && TRANSPORTS.has(t)) as Transport[]) : [];
  } catch {
    return [];
  }
}

export interface CredentialRow {
  id: string;
  user_id: number;
  public_key: Buffer | Uint8Array;
  counter: number;
  transports: string | null;
  created_at: number;
  last_used_at: number | null;
  label: string;
}

/** What @simplewebauthn/server's verifyAuthenticationResponse wants. */
export function toCredential(r: CredentialRow): {
  id: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: Transport[];
} {
  const src = r.public_key;
  const publicKey = new Uint8Array(new ArrayBuffer(src.byteLength));
  publicKey.set(src);
  return { id: r.id, publicKey, counter: r.counter, transports: parseTransports(r.transports) };
}

export interface PasskeyView {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
}

/** What /compte lists: never the key itself. */
export function toView(r: Pick<CredentialRow, "id" | "label" | "created_at" | "last_used_at">): PasskeyView {
  return { id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at };
}

/** A short name for the device a passkey was made on, from its User-Agent,
 *  so a reader can tell two of them apart in /compte. */
export function deviceLabel(ua: string | undefined): string {
  const s = ua ?? "";
  const os = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s)
      ? "iPad"
      : /Android/.test(s)
        ? "Android"
        : /CrOS/.test(s)
          ? "ChromeOS"
          : /Mac OS X|Macintosh/.test(s)
            ? "Mac"
            : /Windows/.test(s)
              ? "Windows"
              : /Linux/.test(s)
                ? "Linux"
                : "";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /Firefox\//.test(s)
      ? "Firefox"
      : /Chrome\//.test(s)
        ? "Chrome"
        : /Safari\//.test(s)
          ? "Safari"
          : "";
  return [os, browser].filter(Boolean).join(" · ") || "Passkey";
}

/** The WebAuthn user handle for an account: opaque, no e-mail in it. */
export function userHandle(userId: number): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`gk-${userId}`) as Uint8Array<ArrayBuffer>;
}
