"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";

// UI locale → BCP-47 tag for date formatting (mirrors public/js/i18n.js).
const BCP47: Record<string, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
  zh: "zh-CN",
};

/** Masthead "edition date", localized to the active UI language. Takes the
 *  build-time ISO date as a prop so server and client hydrate to the same
 *  string (default locale), then re-formats on the i18n:change event. */
export function EditionDate({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
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

  const formatted = new Intl.DateTimeFormat(BCP47[locale] ?? locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {formatted}
    </time>
  );
}
