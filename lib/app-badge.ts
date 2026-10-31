// The installed site's icon badge (Badging API): the number of cards and
// questions due, set wherever the client counts them (useReviewDue in
// components/account/AccountChip.tsx). Silent where unsupported — most browsers
// outside an installed web app — and when the call is refused.

type BadgeNav = Navigator & {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

let last: number | null = null;

/** Shows `n` on the app icon, or clears it at 0. Repeats are skipped. */
export function setDueBadge(n: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as BadgeNav;
  if (typeof nav.setAppBadge !== "function") return;
  const v = Math.max(0, Math.floor(n) || 0);
  if (v === last) return;
  last = v;
  try {
    const p =
      v > 0
        ? nav.setAppBadge(v)
        : nav.clearAppBadge
          ? nav.clearAppBadge()
          : nav.setAppBadge(0);
    p?.catch(() => {});
  } catch {
    /* refused (not installed, policy) */
  }
}

/** Test hook: forget the last value sent. */
export function resetDueBadge(): void {
  last = null;
}
