// Browser side of the optional account (server/routes/auth.ts, account.ts):
// whether login is offered, who is signed in, and the progress sync.
//
// The site stays static: nothing at build time knows about the reader. Pages
// ask the server, and when it doesn't answer (no server under `next dev`,
// mail not configured, network down) everything behaves as before, with the
// progress kept in this browser only.
//
// To avoid a request on every page for the many readers who never sign in, a
// small hint in localStorage remembers whether this browser has a session;
// /api/me is only asked when it does (or on /compte/).

import {
  collectProgress,
  planImport,
  applyPlan,
  progressStorage,
} from "./progress-transfer";
import type { Look } from "./avatar";

export interface Me {
  id: number;
  email: string;
  createdAt: number;
  timezone: string;
  look: Look;
  coins: number;
  todayCoins?: number;
  streak: { current: number; best: number; freezes: number; lastDay: string };
}

export interface Earned {
  kind: string;
  amount: number;
  ref?: string;
}

const HINT_KEY = "gkAccount";
const CFG_KEY = "gkAuthCfg";
const SYNC_EVERY_MS = 5 * 60_000;

interface Hint {
  /** This browser holds a session cookie (as far as we know). */
  in: boolean;
  look?: Look;
  coins?: number;
  /** Last successful sync, ms. */
  sync?: number;
  /** Hash of the last payload sent, to skip identical syncs. */
  sent?: string;
}

function readJson<T>(store: Storage | undefined, key: string): T | null {
  try {
    return JSON.parse(store?.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
function writeJson(store: Storage | undefined, key: string, v: unknown) {
  try {
    store?.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}
const ls = () => (typeof localStorage === "undefined" ? undefined : localStorage);
const ss = () => (typeof sessionStorage === "undefined" ? undefined : sessionStorage);

export function readHint(): Hint {
  return readJson<Hint>(ls(), HINT_KEY) ?? { in: false };
}
export function writeHint(h: Hint): void {
  writeJson(ls(), HINT_KEY, h);
  try {
    window.dispatchEvent(new CustomEvent("gk:account", { detail: h }));
  } catch {
    /* no window */
  }
}

export interface AuthConfig {
  enabled: boolean;
  /** Passkeys offered beside the magic link (server/routes/passkey.ts). */
  passkey?: boolean;
  turnstileSiteKey?: string;
}

/** Whether the server offers accounts. Cached for the tab's session. */
export async function authConfig(): Promise<AuthConfig> {
  const cached = readJson<AuthConfig & { at: number }>(ss(), CFG_KEY);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached;
  try {
    const r = await fetch("/api/auth/config", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const c = (await r.json()) as AuthConfig;
    const out = { enabled: !!c.enabled, passkey: !!c.passkey, turnstileSiteKey: c.turnstileSiteKey };
    writeJson(ss(), CFG_KEY, { ...out, at: Date.now() });
    return out;
  } catch {
    const out = { enabled: false };
    writeJson(ss(), CFG_KEY, { ...out, at: Date.now() });
    return out;
  }
}

/** The signed-in reader, or null. Keeps the hint in step. */
export async function fetchMe(): Promise<Me | null> {
  try {
    const r = await fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
    if (!r.ok) throw new Error(String(r.status));
    const { user } = (await r.json()) as { user: Me | null };
    const h = readHint();
    if (user) writeHint({ ...h, in: true, look: user.look, coins: user.coins });
    else if (h.in) writeHint({ in: false });
    return user;
  } catch {
    return null;
  }
}

export async function requestLink(
  email: string,
  turnstileToken: string,
  next = "/compte/",
): Promise<"sent" | "invalid" | "limited" | "disabled" | "error"> {
  try {
    const r = await fetch("/api/auth/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The mail goes out in the UI language (public/js/i18n.js keeps <html lang>).
      body: JSON.stringify({ email, turnstileToken, next, locale: document.documentElement.lang }),
    });
    if (r.ok) return "sent";
    if (r.status === 400) return "invalid";
    if (r.status === 429) return "limited";
    if (r.status === 503) return "disabled";
    return "error";
  } catch {
    return "error";
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    writeHint({ in: false });
  }
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}

export interface SyncResult {
  earned: Earned[];
  coins: number;
}

let inflight: Promise<SyncResult | null> | null = null;

/**
 * Send this browser's progress, get the merged copy back and apply it: the
 * same merge as the /progression/ import, so two devices converge. The server
 * decides the coins from what changed. `keepalive` for the page-hide sync.
 */
export function syncNow(opts: { keepalive?: boolean; force?: boolean } = {}): Promise<SyncResult | null> {
  if (inflight) return inflight;
  const store = progressStorage();
  if (!store) return Promise.resolve(null);
  const items = collectProgress(store);
  const body = JSON.stringify({ items });
  const h = readHint();
  if (!h.in) return Promise.resolve(null);
  const sig = hash(body);
  if (!opts.force && h.sent === sig && h.sync && Date.now() - h.sync < SYNC_EVERY_MS)
    return Promise.resolve(null);
  inflight = (async () => {
    try {
      const r = await fetch("/api/progress/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive: opts.keepalive && body.length < 60_000,
        body,
      });
      if (r.status === 401) {
        writeHint({ in: false });
        return null;
      }
      if (!r.ok) return null;
      const res = (await r.json()) as {
        items: Record<string, unknown>;
        coins: number;
        earned?: Earned[];
      };
      // Apply what the server merged: only additions and newer copies.
      const plan = planImport(collectProgress(store), res.items ?? {}, "merge");
      applyPlan(store, plan);
      const after = hash(JSON.stringify({ items: collectProgress(store) }));
      writeHint({ ...readHint(), in: true, coins: res.coins, sync: Date.now(), sent: after });
      const earned = res.earned ?? [];
      if (earned.length) {
        window.dispatchEvent(
          new CustomEvent("gk:coins", { detail: { earned, coins: res.coins } }),
        );
      }
      if (Object.keys(plan.write).length) {
        window.dispatchEvent(new CustomEvent("gk:progress-synced"));
      }
      return { earned, coins: res.coins };
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Sync if signed in and the last sync is old enough (page load). */
export function maybeSync(): void {
  const h = readHint();
  if (!h.in) return;
  if (!h.sync || Date.now() - h.sync > SYNC_EVERY_MS) void syncNow();
}

/** Coins earned shown as a short toast; `kind` → i18n key `coins.kind.*`. */
export function totalEarned(e: Earned[]): number {
  return e.reduce((n, x) => n + (x.amount > 0 ? x.amount : 0), 0);
}
