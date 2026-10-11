"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    __i18n?: {
      locale?: string;
      defaultLocale: string;
      bundles: Record<string, unknown>;
      setLocale?: (locale: string) => void;
      t?: (key: string, vars?: Record<string, string | number>) => string;
      applyAll?: (root?: ParentNode) => void;
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

/** Language switcher driven by /js/i18n.js. The script applies the stored
 * locale on load; this component renders the toggle and persists the choice
 * via window.__i18n.setLocale, which fires the swap. Inline list
 * (FR · EN · ES · العربية · 中文) from `sm` up; on phones it folds into a small
 * dropdown showing the current language, so the masthead's utility bar fits
 * on one line next to the theme toggle and the search. */
export function LangSwitcher() {
  const [locale, setLocale] = useState<string>("fr");
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

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

  // Close the phone dropdown on an outside tap or Escape (focus back on the
  // toggle, so keyboard users aren't dropped at the top of the page).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: string) {
    setOpen(false);
    if (next === locale) return;
    window.__i18n?.setLocale?.(next);
  }

  const current = OPTIONS.find((o) => o.code === locale) ?? OPTIONS[0];

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
    <>
      {/* Phones: current language + chevron, the others in a dropdown. Logical
        `start-0` anchors it under the toggle in RTL (Arabic) too. */}
      <span ref={rootRef} className="relative sm:hidden">
        <button
          ref={toggleRef}
          type="button"
          // Same pill as the search trigger next to it (.palette-btn, palette.css),
          // so the three controls read as one row.
          className="palette-btn font-semibold tracking-[0.06em]"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Langue / Language : ${current.label}`}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{current.code.toUpperCase()}</span>
          <svg
            viewBox="0 0 12 12"
            width="9"
            height="9"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </button>
        <ul
          id={menuId}
          hidden={!open}
          className="absolute start-0 top-full z-40 mt-1.5 min-w-full list-none rounded-md border border-rule-strong bg-paper p-1 shadow-lg"
        >
          {OPTIONS.map((o) => (
            <li key={o.code} className="m-0 p-0">
              <button
                type="button"
                lang={o.code}
                className={`${btn(locale === o.code)} block w-full px-2 py-1.5 text-start`}
                aria-current={locale === o.code ? "true" : undefined}
                onClick={() => pick(o.code)}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      </span>
      <span
        className="hidden sm:inline-flex items-baseline gap-1.5"
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
    </>
  );
}
