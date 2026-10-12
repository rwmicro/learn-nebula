"use client";

// A tiny shared cache for the /admin endpoints, so the dashboard tiles and the
// cards below read the SAME response (one request per endpoint, not one per
// consumer) and a card's refresh updates its tile too. Module-level state +
// useSyncExternalStore; cleared on disconnect.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Unauthorized, authHeader } from "./shared";

export interface Resource<T> {
  data: T | null;
  /** Last non-silent load failed (not a 401, not a 404). */
  failed: boolean;
  /** 404: the build-time report isn't on this server. */
  missing: boolean;
  /** A visible (non-silent) load is running. */
  busy: boolean;
  /** At least one load finished (successfully or not). */
  settled: boolean;
  /** The server's own reason for the last failure (a JSON `{ error }` body,
   *  as the admin tool routes send), when it gave one. */
  error: string | null;
}

interface Entry {
  snap: Resource<unknown>;
  listeners: Set<() => void>;
  inflight: Promise<void> | null;
}

const EMPTY: Resource<never> = { data: null, failed: false, missing: false, busy: false, settled: false, error: null };
const entries = new Map<string, Entry>();

/** A failure the server explained in its `{ error }` body. */
class ServerReason extends Error {}

function entry(url: string): Entry {
  let e = entries.get(url);
  if (!e) {
    e = { snap: EMPTY, listeners: new Set(), inflight: null };
    entries.set(url, e);
  }
  return e;
}

function patch(url: string, p: Partial<Resource<unknown>>) {
  const e = entry(url);
  e.snap = { ...e.snap, ...p };
  e.listeners.forEach((l) => l());
}

/** Fetch `url` into the cache. Concurrent calls share one request. Throws
 *  Unauthorized on a 401 so the caller can hand the session back. */
export function loadResource(url: string, token: string, opts: { silent?: boolean } = {}): Promise<void> {
  const e = entry(url);
  if (e.inflight) return e.inflight;
  if (!opts.silent) patch(url, { busy: true });
  e.inflight = (async () => {
    try {
      const r = await fetch(url, { headers: authHeader(token) });
      if (r.status === 401) throw new Unauthorized();
      if (r.status === 404) {
        patch(url, { missing: true, failed: false, data: null, error: null });
        return;
      }
      if (!r.ok) {
        let reason: string | null = null;
        try {
          const body = (await r.json()) as { error?: unknown };
          if (typeof body?.error === "string") reason = body.error;
        } catch {
          /* not JSON */
        }
        throw reason ? new ServerReason(reason) : new Error(`HTTP ${r.status}`);
      }
      patch(url, { data: await r.json(), failed: false, missing: false, error: null });
    } catch (err) {
      if (err instanceof Unauthorized) throw err;
      if (!opts.silent) patch(url, { failed: true, error: err instanceof ServerReason ? err.message : null });
    } finally {
      e.inflight = null;
      patch(url, { busy: false, settled: true });
    }
  })();
  return e.inflight;
}

/** Seed or update cached data locally (after a mutation, or a login check that
 *  already fetched it). */
export function setResource<T>(url: string, update: T | ((prev: T | null) => T)) {
  const prev = entry(url).snap.data as T | null;
  const data = typeof update === "function" ? (update as (p: T | null) => T)(prev) : update;
  patch(url, { data, failed: false, missing: false, settled: true, error: null });
}

/** Re-read every endpoint some card has loaded (the "r" shortcut). */
export function reloadAll(token: string): Promise<void> {
  const loads = [...entries.entries()]
    .filter(([, e]) => e.snap.settled && e.listeners.size > 0)
    .map(([url]) => loadResource(url, token));
  return Promise.all(loads).then(() => undefined);
}

/** Forget everything (disconnect): the next token starts from scratch. */
export function clearResources() {
  for (const [url, e] of entries) {
    e.snap = EMPTY;
    e.listeners.forEach((l) => l());
    if (!e.listeners.size) entries.delete(url);
  }
}

/**
 * Read an admin endpoint through the cache. Loads once on first use (shared by
 * every consumer), optionally re-polls silently. `reload()` is the card's ↻.
 */
export function useAdminResource<T>(
  url: string,
  token: string,
  onUnauthorized: () => void,
  opts: { pollMs?: number; enabled?: boolean } = {},
): Resource<T> & { reload: (o?: { silent?: boolean }) => void } {
  const enabled = opts.enabled ?? true;
  const subscribe = useCallback(
    (l: () => void) => {
      const e = entry(url);
      e.listeners.add(l);
      return () => {
        e.listeners.delete(l);
      };
    },
    [url],
  );
  const snap = useSyncExternalStore(
    subscribe,
    () => entry(url).snap,
    () => EMPTY,
  ) as Resource<T>;

  const reload = useCallback(
    (o: { silent?: boolean } = {}) => {
      loadResource(url, token, o).catch((err) => {
        if (err instanceof Unauthorized) onUnauthorized();
      });
    },
    [url, token, onUnauthorized],
  );

  useEffect(() => {
    if (!enabled) return;
    const e = entry(url);
    if (!e.snap.settled && !e.inflight) reload();
  }, [enabled, url, reload]);

  const pollMs = opts.pollMs;
  useEffect(() => {
    if (!enabled || !pollMs) return;
    const id = setInterval(() => reload({ silent: true }), pollMs);
    return () => clearInterval(id);
  }, [enabled, pollMs, reload]);

  return { ...snap, reload };
}

// --- Change counters: "something changed, re-read" signals between cards
// (e.g. approving a pending comment refreshes the published list).

const ticks = new Map<string, number>();
const tickListeners = new Set<() => void>();

export function bump(key: string) {
  ticks.set(key, (ticks.get(key) ?? 0) + 1);
  tickListeners.forEach((l) => l());
}

export function useTick(key: string): number {
  return useSyncExternalStore(
    (l) => {
      tickListeners.add(l);
      return () => {
        tickListeners.delete(l);
      };
    },
    () => ticks.get(key) ?? 0,
    () => 0,
  );
}

// --- Endpoints, in one place so the cards and the dashboard agree.

export const URLS = {
  health: "/healthz",
  version: "/api/admin/version",
  pending: "/api/comments?status=pending",
  questions: "/api/questions",
  vaultHealth: "/api/admin/vault-health",
  prereqs: "/api/admin/prereq-suggestions",
  blockedWords: "/api/admin/blocked-words",
  searchMisses: "/api/admin/search-misses",
  facts: "/api/admin/facts",
  builds: "/api/admin/builds",
  ragDebug: "/api/admin/rag-debug",
  accounts: "/api/admin/accounts",
  usage: "/api/admin/usage",
  activity: "/api/admin/activity",
  events: "/api/admin/events",
  prereqIgnored: "/api/admin/prereq-ignored",
} as const;

// --- Ignored prerequisite suggestions: kept on the server (GET/PUT
// /api/admin/prereq-ignored) so they follow the owner from one device to the
// next; shared between the card (which edits it) and the dashboard (which
// counts without). Older builds kept them in this browser's localStorage:
// that list is merged in once, then dropped.

const LEGACY_IGNORED_KEY = "gkPrereqIgnored";
let ignored: Set<string> | null = null;
let ignoredToken: string | null = null;
const ignoredListeners = new Set<() => void>();
const NO_IGNORED = new Set<string>();

function readIgnored(): Set<string> {
  return ignored ?? NO_IGNORED;
}

function setIgnored(next: Set<string>) {
  ignored = next;
  ignoredListeners.forEach((l) => l());
}

function saveIgnored(keys: Set<string>) {
  if (ignoredToken === null) return;
  fetch(URLS.prereqIgnored, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authHeader(ignoredToken) },
    body: JSON.stringify({ keys: [...keys] }),
  }).catch(() => {
    /* kept for this visit; the next toggle retries */
  });
}

/** Load the server's list once logged in (`token` is "" for an account
 *  session), merging and clearing the old per-browser one. */
export async function syncIgnored(token: string): Promise<void> {
  ignoredToken = token;
  let legacy: string[] = [];
  try {
    const v = JSON.parse(localStorage.getItem(LEGACY_IGNORED_KEY) ?? "[]");
    legacy = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    /* storage blocked */
  }
  try {
    const r = await fetch(URLS.prereqIgnored, { headers: authHeader(token) });
    if (!r.ok) throw new Error(String(r.status));
    const { keys } = (await r.json()) as { keys?: string[] };
    const merged = new Set([...(keys ?? []), ...legacy]);
    setIgnored(merged);
    if (legacy.length) {
      saveIgnored(merged);
      try {
        localStorage.removeItem(LEGACY_IGNORED_KEY);
      } catch {
        /* ignore */
      }
    }
  } catch {
    // Older server without the route: fall back to what this browser had.
    setIgnored(new Set(legacy));
  }
}

export function forgetIgnored() {
  ignoredToken = null;
  setIgnored(new Set());
  ignored = null;
}

export const ignoredKey = (note: string, prereq: string) => `${note}>${prereq}`;

export function toggleIgnored(k: string) {
  const next = new Set(readIgnored());
  if (next.has(k)) next.delete(k);
  else next.add(k);
  setIgnored(next);
  saveIgnored(next);
}

export function useIgnoredPrereqs(): Set<string> {
  return useSyncExternalStore(
    (l) => {
      ignoredListeners.add(l);
      return () => {
        ignoredListeners.delete(l);
      };
    },
    readIgnored,
    () => NO_IGNORED,
  );
}
