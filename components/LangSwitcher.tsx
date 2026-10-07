"use client";

import { Fragment, useEffect, useState } from "react";

declare global {
  interface Window {
    __i18n?: {
      locale?: string;
      defaultLocale: string;
      bundles: Record<string, unknown>;
      setLocale?: (locale: string) => void;
      t?: (key: string, vars?: Record<string, string | number>) => string;
      applyAll?: (root?: ParentNode) => void;
      hash?: (s: string) => string;
    };
  }
}

// Interface "editions". Codes for Latin scripts, native glyph for Chinese.
const OPTIONS = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
] as const;

/** Inline language switcher (FR · EN · ES · 中文) driven by /js/i18n.js. The
 * script applies the stored locale on load; this component renders the toggle
 * and persists the choice via window.__i18n.setLocale, which fires the swap. */
export function LangSwitcher() {
  const [locale, setLocale] = useState<string>("fr");

  useEffect(() => {
    const initial =
      window.__i18n?.locale ?? window.__i18n?.defaultLocale ?? "fr";
    setLocale(initial);
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ locale: string }>).detail;
      if (detail?.locale) setLocale(detail.locale);
    };
    document.addEventListener("i18n:change", onChange);
    return () => document.removeEventListener("i18n:change", onChange);
  }, []);

  function pick(next: string) {
    if (next === locale) return;
    window.__i18n?.setLocale?.(next);
  }

  // Black & white, to sit in the masthead dateline.
  const btn = (active: boolean) =>
      ` 
  inline-block
  cursor-pointer
  border-0
  px-1
  py-0.5
  rounded
  text-micro
  font-semibold
  uppercase
  tracking-[0.08em]
  leading-none
  whitespace-nowrap
  underline-offset-[3px]
  hover:underline
  focus-visible:underline
  ${
          active
              ? "bg-[#ffcf33] text-[#1a1a1a] underline"
              : "bg-transparent text-muted-warm"
      }
  `;

  return (
    <span
      className="inline-flex items-baseline gap-1.5"
      role="group"
      aria-label="Langue / Language"
    >
      {OPTIONS.map((o, i) => (
        <Fragment key={o.code}>
          {i > 0 && (
            <span className="text-muted-warm" aria-hidden="true">
              ·
            </span>
          )}
          <button
            type="button"
            className={btn(locale === o.code)}
            aria-pressed={locale === o.code}
            onClick={() => pick(o.code)}
          >
            {o.label}
          </button>
        </Fragment>
      ))}
    </span>
  );
}