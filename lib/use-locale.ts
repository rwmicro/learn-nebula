"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./i18n";

/**
 * Track the active UI locale, following the same `i18n:change` signal that
 * /js/i18n.js emits when the reader switches language. Components call this and
 * resolve their strings through `t(key, vars, locale)` so every label re-renders
 * instead of being mutated in place by the runtime DOM swap.
 *
 * Shared by the client components that need it (Graph, HomeContent, Flashcards)
 * — the hook used to be copy-pasted in each.
 */
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    const isLocale = (s: unknown): s is Locale =>
      typeof s === "string" && (LOCALES as readonly string[]).includes(s);
    const current = window.__i18n?.locale ?? window.__i18n?.defaultLocale;
    if (isLocale(current)) setLocale(current);
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ locale: string }>).detail?.locale;
      if (isLocale(next)) setLocale(next);
    };
    document.addEventListener("i18n:change", onChange);
    return () => document.removeEventListener("i18n:change", onChange);
  }, []);
  return locale;
}
