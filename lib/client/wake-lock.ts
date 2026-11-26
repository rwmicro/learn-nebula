// Screen Wake Lock for the review session (components/review/ReviewSession.tsx) and
// the lesson mode (public/js/lesson.js): on a phone the screen used to go dark
// between two cards, or while the reader thought over a `[!predict]`.
// The browser drops the lock whenever the page is hidden, so it is asked for
// again each time the page comes back. Silent when the API is absent or the
// request is refused (low battery, no user activation, permissions policy).

interface Sentinel {
  release(): Promise<void>;
}
interface WakeLockApi {
  request(type: "screen"): Promise<Sentinel>;
}

function api(): WakeLockApi | null {
  if (typeof navigator === "undefined") return null;
  const w = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
  return w && typeof w.request === "function" ? w : null;
}

export function wakeLockSupported(): boolean {
  return api() !== null;
}

/** Keeps the screen on until the returned function is called. */
export function keepAwake(): () => void {
  const wl = api();
  if (!wl || typeof document === "undefined") return () => {};
  let sentinel: Sentinel | null = null;
  let done = false;

  const ask = () => {
    if (done || sentinel || document.visibilityState !== "visible") return;
    wl.request("screen").then(
      (s) => {
        if (done) s.release().catch(() => {});
        else sentinel = s;
      },
      () => {},
    );
  };
  const onVisible = () => {
    // A hidden page has already lost its lock: forget it, ask anew.
    if (document.visibilityState === "visible") {
      sentinel = null;
      ask();
    }
  };

  document.addEventListener("visibilitychange", onVisible);
  ask();
  return () => {
    if (done) return;
    done = true;
    document.removeEventListener("visibilitychange", onVisible);
    sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
