"use client";

import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { calendarDays, currentRun, loadActivity, localDay } from "@/lib/personal";
import { loadStore } from "@/lib/reading-progress";
import { authConfig, readHint } from "@/lib/account-client";
import { LANG_OPTIONS } from "@/components/LangSwitcher";

// "Moi" on a phone (app.css shows it below 640px, and hides there the
// desktop page's title, summary and settings it stands in for): keep one's
// progress with an account, this week in four numbers, twelve weeks of
// activity, then the theme and the language as two rows whose native picker
// opens on tap. Read from this browser, after hydration.

const THEMES = ["auto", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];
type Days = Record<string, { r: number; c: number }>;

/** Monday of this week, as a local "YYYY-MM-DD". */
function weekStart(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d);
}

const Chevron = () => (
  <svg className="moi-chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export function MoiPhone() {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [days, setDays] = useState<Days>({});
  const [week, setWeek] = useState({ read: 0, started: 0 });
  const [account, setAccount] = useState<"off" | "out" | "in">("off");
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    const load = () => {
      try {
        const store = loadStore();
        const reads = Object.values(store)
          .map((e) => e.r)
          .filter((r): r is number => typeof r === "number");
        setDays(calendarDays(loadActivity(), reads));
        const since = new Date(`${weekStart()}T00:00:00`).getTime() / 1000;
        let read = 0;
        let started = 0;
        for (const e of Object.values(store)) {
          if (e.r != null && e.r >= since) read++;
          else if (e.r == null && e.t >= since) started++;
        }
        setWeek({ read, started });
      } catch {
        /* storage blocked: zeros */
      }
    };
    load();
    const syncTheme = () => setTheme(window.__theme?.pref() ?? "auto");
    syncTheme();
    const fromHint = () => setAccount((a) => (a === "off" ? a : readHint().in ? "in" : "out"));
    void authConfig().then((c) => c.enabled && setAccount(readHint().in ? "in" : "out"));
    window.addEventListener("gk:activity", load);
    window.addEventListener("gk:progress-synced", load);
    window.addEventListener("gk:account", fromHint);
    document.addEventListener("theme:change", syncTheme);
    return () => {
      window.removeEventListener("gk:activity", load);
      window.removeEventListener("gk:progress-synced", load);
      window.removeEventListener("gk:account", fromHint);
      document.removeEventListener("theme:change", syncTheme);
    };
  }, []);

  const run = useMemo(() => currentRun(days), [days]);
  const since = weekStart();
  const cards = Object.entries(days)
    .filter(([d]) => d >= since)
    .reduce((n, [, v]) => n + v.c, 0);

  // Twelve weeks of days, oldest first; the current week runs to today.
  const heat = useMemo(() => {
    const start = new Date(`${weekStart()}T12:00:00`);
    start.setDate(start.getDate() - 7 * 11);
    const today = localDay();
    const cells: { day: string; level: number; future: boolean }[] = [];
    for (let i = 0; i < 84; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const day = localDay(d);
      const n = (days[day]?.r ?? 0) * 3 + (days[day]?.c ?? 0);
      cells.push({ day, level: n === 0 ? 0 : n < 5 ? 1 : n < 20 ? 2 : 3, future: day > today });
    }
    return cells;
  }, [days]);

  const langLabel = LANG_OPTIONS.find((o) => o.code === locale)?.label ?? locale;

  return (
    <div className="moi" data-pagefind-ignore>
      <a className="moi-gear" href="#moi-reglages" aria-label={tr("settings.title")}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      </a>
      <header className="moi-title">
        <h1>{tr("moi.title")}</h1>
        <p>{tr("moi.lede")}</p>
      </header>

      {account === "out" && (
        <a className="moi-card moi-account" href="/compte/">
          <span className="moi-account-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          </span>
          <span className="moi-account-tx">
            <b>{tr("moi.keepTitle")}</b>
            <small>{tr("moi.keepText")}</small>
          </span>
          <span className="moi-pill">{tr("moi.signIn")}</span>
        </a>
      )}
      {account === "in" && (
        <a className="moi-card moi-account" href="/compte/">
          <span className="moi-account-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          </span>
          <span className="moi-account-tx">
            <b>{tr("moi.accountTitle")}</b>
            <small>{tr("moi.accountText")}</small>
          </span>
          <Chevron />
        </a>
      )}

      <h2 className="moi-h">{tr("moi.week")}</h2>
      <div className="moi-tiles">
        <div>
          <b>{week.read}</b>
          <small>{tr("progression.statRead")}</small>
        </div>
        <div>
          <b>{week.started}</b>
          <small>{tr("progression.statStarted")}</small>
        </div>
        <a href="/defis/">
          <b>
            <svg className="moi-flame" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
            </svg>
            {run}
          </b>
          <small>{tr("dash.streak")}</small>
        </a>
        <a href="/cartes/">
          <b>{cards}</b>
          <small>{tr("moi.cards")}</small>
        </a>
      </div>

      <div className="moi-row-h">
        <h2 className="moi-h">{tr("moi.activity")}</h2>
        <span>{tr("moi.weeks", { n: 12 })}</span>
      </div>
      <div className="moi-card moi-heat" role="img" aria-label={tr("moi.activityAria", { n: Object.keys(days).filter((d) => d >= heat[0].day).length })}>
        {heat.map((c) => (
          <i key={c.day} className={c.future ? "f" : c.level ? `l${c.level}` : undefined} />
        ))}
      </div>

      <h2 className="moi-h" id="moi-reglages">
        {tr("settings.title")}
      </h2>
      <div className="moi-card moi-list">
        <label className="moi-set">
          <span>{tr("settings.theme")}</span>
          <small>{tr(`noteApp.theme_${theme}`)}</small>
          <Chevron />
          <select
            value={theme}
            onChange={(e) => {
              const v = e.target.value as Theme;
              window.__theme?.set(v);
              setTheme(v);
            }}
          >
            {THEMES.map((m) => (
              <option key={m} value={m}>
                {tr(`noteApp.theme_${m}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="moi-set">
          <span>{tr("settings.language")}</span>
          <small>{langLabel}</small>
          <Chevron />
          <select value={locale} onChange={(e) => window.__i18n?.setLocale?.(e.target.value)}>
            {LANG_OPTIONS.map((o) => (
              <option key={o.code} value={o.code} lang={o.code}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
