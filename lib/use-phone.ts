"use client";

import { useSyncExternalStore } from "react";

/** Below Tailwind's `sm` (640px): the width at which assets/css/app.css lays
 *  the site out as a phone app. False on the server and before hydration. */
const QUERY = "(max-width: 639.98px)";

function subscribe(cb: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
