"use client";

import { useEffect, useState } from "react";

/** The index note's text on the home page, following the interface language.
 * The masthead switcher (FR · EN · ES · AR · 中文) only swaps the `data-i18n`
 * UI strings; the note itself is vault content written in one language, so on
 * every locale that isn't the note's own it goes through /api/translate (the
 * same endpoint as the notes' "Traduire" button). Cached per locale and content
 * hash in localStorage, so only the first visit per language waits. If the
 * server can't translate, the original text simply stays. */
export function HomeIntro({
  html,
  markdown,
  sourceLang,
  className,
}: {
  html: string;
  markdown: string;
  sourceLang: string;
  className?: string;
}) {
  const [shown, setShown] = useState({ html, lang: sourceLang });

  useEffect(() => {
    let ctrl: AbortController | null = null;
    // The locale being shown or fetched: /js/i18n.js announces the stored
    // locale on load too, which must not restart a request already under way.
    let current = "";

    async function follow(locale: string) {
      if (locale === current) return;
      current = locale;
      ctrl?.abort();
      if (locale === sourceLang) {
        setShown({ html, lang: sourceLang });
        return;
      }
      const hash = window.__i18n?.hash?.(markdown) ?? String(markdown.length);
      const key = `translate:/:${locale}:${hash}`;
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          setShown({ html: cached, lang: locale });
          return;
        }
      } catch {
        /* localStorage unavailable */
      }
      ctrl = new AbortController();
      try {
        const r = await fetch("/api/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markdown, dir: "", sourceLang, targetLang: locale }),
          signal: ctrl.signal,
        });
        const data = (await r.json().catch(() => ({}))) as { html?: string };
        if (!r.ok || !data.html) return;
        try {
          localStorage.setItem(key, data.html);
        } catch {
          /* quota exceeded */
        }
        setShown({ html: data.html, lang: locale });
      } catch {
        /* aborted by a newer switch, or offline: keep what's shown */
      }
    }

    const onChange = (e: Event) => {
      const locale = (e as CustomEvent<{ locale: string }>).detail?.locale;
      if (locale) void follow(locale);
    };
    document.addEventListener("i18n:change", onChange);
    // /js/i18n.js may already have announced the stored locale before this
    // mounted; resolve it ourselves (defaultLocale comes from the inline bootstrap).
    const i18n = window.__i18n;
    let initial = i18n?.locale;
    if (!initial) {
      try {
        initial = localStorage.getItem("locale") ?? undefined;
      } catch {
        /* ignore */
      }
    }
    initial = initial && i18n?.bundles[initial] ? initial : i18n?.defaultLocale;
    if (initial) void follow(initial);
    return () => {
      document.removeEventListener("i18n:change", onChange);
      ctrl?.abort();
    };
  }, [html, markdown, sourceLang]);

  return (
    <div
      lang={shown.lang}
      className={className}
      dangerouslySetInnerHTML={{ __html: shown.html }}
    />
  );
}
