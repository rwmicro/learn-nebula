// Daily review reminders by Web Push: the pure parts (when a subscription is
// due, how many cards wait, what the notification says). The table is in
// server/push-store.ts, the sender loop in server/push-sender.ts.

import { LOCALES, t, type Locale } from "../lib/i18n.ts";
import { parseProgress } from "../lib/srs.ts";
import { dayIn } from "./accounts.ts";

/** How often the sender looks for reminders to send. */
export const PUSH_TICK_MS = 10 * 60_000;
/** Consecutive failed sends (other than 404/410) before a subscription goes. */
export const MAX_PUSH_FAILURES = 10;
/** Where a reminder opens when the payload names nothing else. */
export const PUSH_URL = "/cartes/";

/** Local hour (0–23) of `now` in `tz`. */
export function hourIn(tz: string, now: Date): number {
  const fmt = (zone: string) =>
    Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(now));
  try {
    return fmt(tz);
  } catch {
    return fmt("UTC");
  }
}

export interface Schedule {
  hour: number;
  tz: string;
  /** Last reminder sent, ms (null: never). */
  lastSentAt: number | null;
  /** When the reader last chose the hour (subscribe or change), ms. */
  updatedAt: number;
}

/**
 * Whether a reminder goes out at `now`: the chosen local hour has come today,
 * none was sent today, and the hour wasn't already past when it was chosen
 * today (subscribing at 21:00 for 08:00 starts tomorrow, not at once).
 */
export function shouldSend(s: Schedule, now: number): boolean {
  const at = new Date(now);
  if (hourIn(s.tz, at) < s.hour) return false;
  const today = dayIn(s.tz, at);
  if (s.lastSentAt != null && dayIn(s.tz, new Date(s.lastSentAt)) === today) return false;
  const set = new Date(s.updatedAt);
  if (dayIn(s.tz, set) === today && hourIn(s.tz, set) >= s.hour) return false;
  return true;
}

/**
 * Cards due today or overdue across every synced deck (`srs:*` values, the
 * Anki decks and the questions saved from notes), suspended ones left out.
 * Null when the reader has no deck progress at all: the count means nothing.
 */
export function dueCount(values: string[], today: string): number | null {
  if (!values.length) return null;
  let n = 0;
  for (const v of values) {
    for (const c of Object.values(parseProgress(v).cards)) if (c.due <= today && !c.sus) n++;
  }
  return n;
}

export function pushLocale(v: unknown): Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : "fr";
}

/** Declarative Web Push (Safari 18.4+ shows it without running the worker);
 *  the service worker reads the same shape everywhere else. */
export interface ReminderPayload {
  web_push: 8030;
  notification: { title: string; body: string; navigate: string; lang: string; tag: string };
  app_badge?: number;
}

/** The reminder: "N cartes à revoir" when the count is known, else generic. */
export function reminderPayload(due: number | null, locale: Locale, base: string): ReminderPayload {
  const body =
    due == null || due <= 0
      ? t("push.generic", undefined, locale)
      : t(due === 1 ? "push.dueOne" : "push.due", { n: due }, locale);
  const p: ReminderPayload = {
    web_push: 8030,
    notification: { title: t("push.notifTitle", undefined, locale), body, navigate: `${base}${PUSH_URL}`, lang: locale, tag: "gk-review" },
  };
  if (due != null) p.app_badge = Math.max(0, due);
  return p;
}

/** A reader's hour choice, 0–23, or null. */
export function validHour(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23 ? v : null;
}

/** Hosts of the browsers' push services (Chrome/Edge/Opera via FCM, Firefox,
 *  Safari, legacy Edge). The server POSTs to the endpoint a reader hands it,
 *  so anything else is refused: no sending to arbitrary or local addresses. */
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function pushHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return PUSH_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

/** A browser PushSubscription.toJSON(), checked: https on a known push
 *  service, base64url keys. */
export function parseSubscription(v: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 1024) return null;
  let u: URL;
  try {
    u = new URL(s.endpoint);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.port || !pushHostAllowed(u.hostname)) return null;
  const b64 = /^[A-Za-z0-9_-]+=*$/;
  const p256dh = s.keys?.p256dh;
  const auth = s.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (!b64.test(p256dh) || !b64.test(auth) || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint: s.endpoint, p256dh, auth };
}
