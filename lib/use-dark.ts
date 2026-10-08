"use client";

import { useSyncExternalStore } from "react";

/**
 * Is the site in dark mode right now: the reader's pick (`<html data-theme>`,
 * set by public/js/theme.js) or else the OS preference — the same rule as
 * global.css. For markup that has to switch on it, like the Anki card's
 * night-mode classes (components/DeckFace.tsx).
 */
export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}

const QUERY = "(prefers-color-scheme: dark)";

function isDark(): boolean {
  const pick = document.documentElement.getAttribute("data-theme");
  return pick ? pick === "dark" : window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    mq.removeEventListener("change", onChange);
    mo.disconnect();
  };
}
