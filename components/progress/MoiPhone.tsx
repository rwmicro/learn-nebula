"use client";

import { SCENES } from "@/lib/deco-art";
import { Fragment, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { calendarDays, currentRun, loadActivity, localDay } from "@/lib/personal";
import { loadStore, nowPlaying, NOW_KEY, parseNow } from "@/lib/reading-progress";
import { authConfig, readHint } from "@/lib/account-client";
import { LANG_OPTIONS } from "@/components/layout/LangSwitcher";
import { themePref } from "@/components/layout/AppSettings";
import { Avatar } from "@/components/account/Avatar";
import type { Look } from "@/lib/avatar";
import { Milestones } from "@/components/progress/Milestones";
import { longestRun } from "@/lib/milestones";
import { ago } from "@/components/account/shared";

/** The reader closed the "Garder ma progression" card (this browser). */
const KEEP_HIDDEN_KEY = "gkKeepHidden";

// "Moi" on a phone (app.css shows it below 640px, and hides there the
// desktop page's title, summary and settings it stands in for): who keeps
// this garden (a guest card offering an account, or the account), this week
// (its days, the run, three numbers, what to read next), twelve weeks of
// activity as a calendar, the milestones closest first, then the settings
// rows whose native picker opens on tap. Read from this browser, after
// hydration.

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
  const [open, setOpen] = useState(0);
  const [next, setNext] = useState<ReturnType<typeof nowPlaying>>(null);
  const [account, setAccount] = useState<"off" | "out" | "in">("off");
  const [look, setLook] = useState<Look | undefined>(undefined);
  const [hint, setHint] = useState<{ coins?: number; sync?: number }>({});
  const [keepHidden, setKeepHidden] = useState(true);
  const [theme, setTheme] = useState<Theme>("auto");
  // Nothing recorded in this browser yet: one invitation stands in for the
  // four zero tiles and the empty calendar.
  const [fresh, setFresh] = useState(false);

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
        setOpen(Object.values(store).filter((e) => e.r == null).length);
        setNext(nowPlaying(parseNow(localStorage.getItem(NOW_KEY)), store));
        setFresh(Object.keys(store).length === 0 && Object.keys(loadActivity()).length === 0);
      } catch {
        /* storage blocked: zeros */
      }
    };
    load();
    const syncTheme = () => setTheme(themePref());
    syncTheme();
    const fromHint = () => {
      const h = readHint();
      setLook(h.look);
      setHint({ coins: h.coins, sync: h.sync });
      setAccount((a) => (a === "off" ? a : h.in ? "in" : "out"));
    };
    try {
      setKeepHidden(localStorage.getItem(KEEP_HIDDEN_KEY) === "1");
    } catch {
      setKeepHidden(false);
    }
    void authConfig().then((c) => {
      if (!c.enabled) return;
      const h = readHint();
      setLook(h.look);
      setHint({ coins: h.coins, sync: h.sync });
      setAccount(h.in ? "in" : "out");
    });
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
  const best = useMemo(() => longestRun(days), [days]);
  const today = localDay();
  const since = weekStart();
  const active = (d: string) => !!days[d] && (days[d].r > 0 || days[d].c > 0);
  const cards = Object.entries(days)
    .filter(([d]) => d >= since)
    .reduce((n, [, v]) => n + v.c, 0);

  // This week, Monday first: active days filled, today ringed.
  const weekDays = useMemo(() => {
    const start = new Date(`${weekStart()}T12:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { day: localDay(d), letter: d.toLocaleDateString(locale, { weekday: "narrow" }) };
    });
  }, [locale]);

  // Twelve weeks as columns, Monday to Sunday down each; the current week
  // runs to today. A month's name heads the first week that starts in it.
  const heat = useMemo(() => {
    const start = new Date(`${weekStart()}T12:00:00`);
    start.setDate(start.getDate() - 7 * 11);
    const cells: { day: string; level: number; future: boolean }[] = [];
    const months: string[] = [];
    let lastMonth = -1;
    for (let i = 0; i < 84; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const day = localDay(d);
      if (i % 7 === 0) {
        months.push(d.getMonth() === lastMonth ? "" : d.toLocaleDateString(locale, { month: "short" }));
        lastMonth = d.getMonth();
      }
      const n = (days[day]?.r ?? 0) * 3 + (days[day]?.c ?? 0);
      cells.push({ day, level: n === 0 ? 0 : n < 5 ? 1 : n < 20 ? 2 : 3, future: day > today });
    }
    // Rows are weekdays: cell (week w, day d) is cells[w * 7 + d].
    const grid = Array.from({ length: 7 }, (_, d) => Array.from({ length: 12 }, (_, w) => cells[w * 7 + d]));
    return { months, grid, first: cells[0].day };
  }, [days, locale, today]);
  const activeDays = Object.keys(days).filter((d) => d >= heat.first && active(d)).length;

  const langLabel = LANG_OPTIONS.find((o) => o.code === locale)?.label ?? locale;
  // The line under the week's numbers: what to do today for the run, and
  // the note to pick up (or the paths when there is none).
  const nextLine = active(today) ? "moi.nextMore" : run > 0 ? "moi.nextKeep" : "moi.nextRestart";
  const hide = () => {
    setKeepHidden(true);
    try {
      localStorage.setItem(KEEP_HIDDEN_KEY, "1");
    } catch {
      /* hidden for this visit only */
    }
  };

  return (
    <div className="moi" data-pagefind-ignore>
      <header className="moi-top">
        <div>
          <p className="moi-kick">{tr("moi.kicker")}</p>
          <h1>{tr("moi.title")}</h1>
        </div>
        <a className="moi-gear" href="#moi-reglages" aria-label={tr("settings.title")}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>
        </a>
      </header>

      {account === "out" && !keepHidden && (
        <div className="moi-card moi-keep">
          <div className="moi-who">
            <span className="moi-keep-av" aria-hidden="true">
              <Avatar size={60} still />
              <span className="moi-keep-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
            </span>
            <span className="moi-keep-tx">
              <b>{tr("moi.guestTitle")}</b>
              <small>{open > 0 ? tr("moi.guestText", { n: open }) : tr("moi.guestTextEmpty")}</small>
            </span>
          </div>
          <div className="moi-keep-row">
            <a href="/compte/" className="moi-keep-go">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              {tr("moi.keepTitle")}
            </a>
            <button type="button" className="moi-keep-later" onClick={hide}>
              {tr("moi.later")}
            </button>
          </div>
          <p className="moi-keep-note">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" />
            </svg>
            {tr("moi.keepText")}
          </p>
        </div>
      )}
      {account === "in" && (
        <a className="moi-card moi-keep moi-keep--in" href="/compte/">
          <span className="moi-keep-av" aria-hidden="true">
            <Avatar look={look} size={60} still />
            <span className="moi-keep-badge moi-keep-badge--ok">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
          </span>
          <span className="moi-keep-tx">
            <b>{tr("moi.accountTitle")}</b>
            <small>{hint.sync ? `${tr("compte.synced")} · ${ago(hint.sync, locale)}` : tr("moi.accountText")}</small>
            {hint.coins != null && (
              <span className="moi-coins">
                <i aria-hidden="true" />
                {hint.coins} {tr("coins.unit")}
              </span>
            )}
          </span>
          <Chevron />
        </a>
      )}

      {fresh ? (
        <div className="moi-fresh">
          {/* A seed packet (lib/deco-art.ts). */}
          <div className="moi-fresh-scene deco" dangerouslySetInnerHTML={{ __html: SCENES.packet }} />
          <b>{tr("moi.freshTitle")}</b>
          <p>{tr("moi.freshText")}</p>
          <a className="moi-fresh-go" href="/parcours/">
            {tr("progression.welcomePaths")}
          </a>
        </div>
      ) : (
        <>
          <div className="moi-row-h">
            <h2 className="moi-h">{tr("moi.week")}</h2>
            <a className="moi-row-link" href="/defis/">
              {tr("defis.title")}
            </a>
          </div>
          <div className="moi-card moi-week">
            <div className="moi-week-top">
              <ol className="moi-days">
                {weekDays.map((d) => (
                  <li key={d.day} className={[active(d.day) && "on", d.day === today && "now"].filter(Boolean).join(" ") || undefined}>
                    <i aria-hidden="true" />
                    {d.letter}
                  </li>
                ))}
              </ol>
              <a className="moi-run" href="/defis/">
                <b>
                  <svg className="moi-flame" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
                  </svg>
                  {run}
                </b>
                <small>
                  {tr("dash.streak")}
                  {best > run && <span>{tr("moi.record", { n: best })}</span>}
                </small>
              </a>
            </div>
            <div className="moi-stats">
              <div>
                <b className={week.read ? undefined : "zero"}>{week.read}</b>
                <small>{tr("progression.statRead")}</small>
              </div>
              <div>
                <b className={week.started ? undefined : "zero"}>{week.started}</b>
                <small>{tr("moi.started")}</small>
              </div>
              <a href="/cartes/">
                <b className={cards ? undefined : "zero"}>{cards}</b>
                <small>{tr("moi.cards")}</small>
              </a>
            </div>
            <a className="moi-next" href={next ? `/posts/${next.note.s}/` : "/parcours/"}>
              <span className="moi-next-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
                </svg>
              </span>
              <span className="moi-next-tx">
                <b>{tr(nextLine)}</b>
                <small>{next ? `« ${next.note.title} » · ${tr("moi.minutes", { n: next.left })}` : tr("progression.welcomePaths")}</small>
              </span>
              <Chevron />
            </a>
          </div>

          <div className="moi-row-h">
            <h2 className="moi-h">{tr("moi.activity")}</h2>
            <span>{tr("moi.weeks", { n: 12 })}</span>
          </div>
          <div className="moi-card moi-cal">
            <div className="moi-heat" role="img" aria-label={tr("moi.activityAria", { n: activeDays })}>
              <span />
              {heat.months.map((m, w) => (
                <span key={`m${w}`} className="moi-heat-m">
                  {m}
                </span>
              ))}
              {heat.grid.map((row, d) => (
                <Fragment key={d}>
                  <span className="moi-heat-d">{d % 2 === 0 && d < 6 ? weekDays[d].letter : ""}</span>
                  {row.map((c) => (
                    <i key={c.day} className={[c.future ? "f" : c.level ? `l${c.level}` : "", c.day === today ? "t" : ""].filter(Boolean).join(" ") || undefined} />
                  ))}
                </Fragment>
              ))}
            </div>
            <div className="moi-cal-foot">
              <span>{tr("moi.activeDays", { n: activeDays })}</span>
              <span className="moi-legend" aria-hidden="true">
                {tr("moi.less")}
                <i />
                <i className="l1" />
                <i className="l2" />
                <i className="l3" />
                {tr("moi.more")}
              </span>
            </div>
          </div>
          <Milestones variant="moi" />
        </>
      )}

      <h2 className="moi-h" id="moi-reglages">
        {tr("settings.title")}
      </h2>
      <div className="moi-card moi-list">
        <label className="moi-set">
          <i className="moi-set-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
            </svg>
          </i>
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
          <i className="moi-set-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h8M8 3v2c0 4-2 7-4.5 8.5M6 9c1 2 3 3.5 5 4.5M13 21l4-9 4 9M14.5 18h5" />
            </svg>
          </i>
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
        <button
          type="button"
          className="moi-set moi-set--btn"
          onClick={() => {
            // The export / import / link cards stay folded under this row
            // (app.css) until asked for.
            document.querySelector("main.progression")?.classList.add("moi-transfer-open");
            document.querySelector(".progression-actions")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          <i className="moi-set-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
          </i>
          <span>
            {tr("moi.transfer")}
            <small>{tr("moi.transferSub")}</small>
          </span>
          <Chevron />
        </button>
      </div>
      {account !== "in" && <p className="moi-foot">{tr("moi.localOnly")}</p>}
    </div>
  );
}
