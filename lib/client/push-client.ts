// Browser side of the daily review reminder (server/routes/push.ts): the
// opt-in in /compte subscribes this browser's service worker to Web Push and
// tells the server the local hour chosen. The worker (public/sw.js) shows it.

export interface PushState {
  /** The server sends reminders (VAPID configured). */
  enabled: boolean;
  /** This browser can subscribe (service worker + PushManager). */
  supported: boolean;
  /** iOS/iPadOS outside the installed web app: push needs the Home Screen app. */
  needsInstall: boolean;
  publicKey?: string;
  /** The current subscription's hour, when this browser is subscribed. */
  hour: number | null;
}

export const DEFAULT_HOUR = 19;

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function standalone(): boolean {
  try {
    return (
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    // ready never settles without a worker (sw-register.js failed): cap it.
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 5000)),
    ]);
  } catch {
    return null;
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription().catch(() => null) : null;
}

export async function pushState(): Promise<PushState> {
  const off: PushState = { enabled: false, supported: false, needsInstall: false, hour: null };
  let cfg: { enabled?: boolean; publicKey?: string };
  try {
    const r = await fetch("/api/push/config", { cache: "no-store" });
    if (!r.ok) return off;
    cfg = await r.json();
  } catch {
    return off;
  }
  if (!cfg.enabled || !cfg.publicKey) return off;
  const supported = pushSupported();
  const needsInstall = isIos() && !standalone();
  let hour: number | null = null;
  const sub = supported && Notification.permission === "granted" ? await currentSubscription() : null;
  if (sub) {
    try {
      const r = await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (r.ok) hour = ((await r.json()) as { hour: number }).hour;
    } catch {
      /* unknown: shown as off */
    }
  }
  return { enabled: true, supported, needsInstall, publicKey: cfg.publicKey, hour };
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Subscribe (asks for the notification permission) or change the hour.
 *  "denied": the reader or the browser refused notifications. */
export async function subscribePush(
  publicKey: string,
  hour: number,
  locale: string,
): Promise<"ok" | "denied" | "error"> {
  if (!pushSupported()) return "error";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const reg = await registration();
    if (!reg) return "error";
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        subscription: sub.toJSON(),
        hour,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale,
      }),
    });
    return r.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function unsubscribePush(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return true;
  try {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}
