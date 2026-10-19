// The reminder loop: every PUSH_TICK_MS, each subscription whose local hour
// has come (and that got nothing today) is sent one short notification.
// Started by server/index.ts only when VAPID keys are configured.

import webpush from "web-push";
import { env, pushConfigured } from "./env.ts";
import { database } from "./db.ts";
import { dayIn } from "./accounts.ts";
import { publicBase } from "./session.ts";
import { MAX_PUSH_FAILURES, PUSH_TICK_MS, dueCount, pushLocale, reminderPayload, shouldSend } from "./push.ts";
import {
  allSubscriptions,
  deckValues,
  deleteSubscription,
  markFailed,
  markSent,
  scheduleOf,
  type PushRow,
} from "./push-store.ts";

let running = false;

async function sendOne(row: PushRow, now: number): Promise<void> {
  const db = database();
  const due = dueCount(deckValues(db, row.user_id), dayIn(row.tz, new Date(now)));
  // Decks synced and nothing due: no reminder today (marked, so the next
  // ticks don't recount).
  if (due === 0) {
    markSent(db, row.endpoint, now);
    return;
  }
  const payload = JSON.stringify(reminderPayload(due, pushLocale(row.locale), publicBase()));
  try {
    await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, {
      TTL: 6 * 3600,
      urgency: "normal",
      topic: "gk-review",
      timeout: 15_000,
    });
    markSent(db, row.endpoint, now);
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // Gone for good: the reader unsubscribed or the browser dropped it.
    if (status === 404 || status === 410) deleteSubscription(db, row.endpoint);
    else if (markFailed(db, row.endpoint) >= MAX_PUSH_FAILURES) deleteSubscription(db, row.endpoint);
    else console.warn("push: send failed", status ?? (e instanceof Error ? e.message : e));
  }
}

export async function pushTick(now = Date.now()): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const row of allSubscriptions(database())) {
      if (shouldSend(scheduleOf(row), now)) await sendOne(row, now);
    }
  } catch (e) {
    console.error("push: tick failed", e);
  } finally {
    running = false;
  }
}

export function startPushSender(): void {
  if (!pushConfigured()) return;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  const t = setInterval(() => void pushTick(), PUSH_TICK_MS);
  if (typeof t.unref === "function") t.unref();
  setTimeout(() => void pushTick(), 30_000).unref?.();
  console.log("server: review reminders on (Web Push)");
}
