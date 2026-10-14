"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { LANG_OPTIONS } from "@/components/LangSwitcher";

// "Moi" on a phone (/progression/, the avatar of the top bar): the theme and
// the interface language, which the phone layout takes out of the site bar
// and the home masthead. Hidden from 640px up (app.css), where both stay in
// the masthead. Drives /js/theme.js (window.__theme) and /js/i18n.js
// (window.__i18n.setLocale), like the controls it stands in for.

declare global {
  interface Window {
    __theme?: { set: (p: "auto" | "light" | "dark") => void; pref: () => "auto" | "light" | "dark" };
  }
}

const THEMES = ["auto", "light", "dark"] as const;

export function AppSettings() {
  const locale = useLocale();
  const tr = (k: string) => t(k, undefined, locale);
  const [theme, setTheme] = useState<(typeof THEMES)[number]>("auto");

  useEffect(() => {
    const sync = () => setTheme(window.__theme?.pref() ?? "auto");
    sync();
    document.addEventListener("theme:change", sync);
    return () => document.removeEventListener("theme:change", sync);
  }, []);

  return (
    <section className="app-settings" aria-labelledby="app-settings-h">
      <h2 id="app-settings-h" className="app-settings-h">
        {tr("settings.title")}
      </h2>
      <p className="app-settings-label">{tr("settings.theme")}</p>
      <div className="app-seg" role="radiogroup" aria-label={tr("settings.theme")}>
        {THEMES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={theme === m}
            onClick={() => {
              window.__theme?.set(m);
              setTheme(m);
            }}
          >
            {tr(`noteApp.theme_${m}`)}
          </button>
        ))}
      </div>
      <p className="app-settings-label">{tr("settings.language")}</p>
      <ul className="app-group" role="radiogroup" aria-label={tr("settings.language")}>
        {LANG_OPTIONS.map((o) => (
          <li key={o.code}>
            <button
              type="button"
              role="radio"
              aria-checked={locale === o.code}
              lang={o.code}
              onClick={() => window.__i18n?.setLocale?.(o.code)}
            >
              {o.label}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
