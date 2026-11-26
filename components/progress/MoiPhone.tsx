"use client";

import { SCENES } from "@/lib/deco-art";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/client/use-locale";
import { calendarDays, currentRun, loadActivity, localDay } from "@/lib/personal";
import { loadStore, nowPlaying, NOW_KEY, parseNow } from "@/lib/reading-progress";
import { authConfig, readHint } from "@/lib/client/account-client";
import { LANG_OPTIONS } from "@/components/layout/LangSwitcher";
import { themePref, THEMES, type ThemeChoice } from "@/components/layout/AppSettings";
import { Avatar } from "@/components/account/Avatar";
import { defaultLook, type Look } from "@/lib/avatar";
import { gatherMilestones } from "@/components/progress/Milestones";
import { GardenBed, Growing, MilestoneBadges, type PotDay } from "@/components/progress/MoiGarden";
import { byProximity, longestRun, type MilestoneRow } from "@/lib/milestones";
import { familyOfPrefix } from "@/lib/path-family";
import { useReviewDue } from "@/components/account/AccountChip";
import { ago } from "@/components/account/shared";

// "Moi" on a phone (phone/moi.css shows it below 640px, and hides there the
// desktop page's title, summary and settings it stands in for). One card
// holds the garden: this week as seven pots with the run above them, the
// reader's gardener beside them (their look once signed in), who keeps the
// garden (guest, or the account and its last sync) and four totals. Then a
// sentence on the week, what to do today (the note to water the day's pot
// with, the cards due), the milestones as badges, twelve weeks of activity
// as a bed of flowers, the notes read per family, and the settings rows
// whose native picker opens on tap. Read from this browser, after hydration.

type Theme = ThemeChoice;
type Days = Record<string, { r: number; c: number }>;

/** Monday of this week, as a local "YYYY-MM-DD". */
function weekStart(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d);
}

const FIXED_MONDAY = new Date("2026-01-05T12:00:00");

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
  const [readSlugs, setReadSlugs] = useState<string[]>([]);
  const [jalons, setJalons] = useState<MilestoneRow[] | null>(null);
  const [next, setNext] = useState<ReturnType<typeof nowPlaying>>(null);
  const [account, setAccount] = useState<"off" | "out" | "in">("off");
  const [look, setLook] = useState<Look | undefined>(undefined);
  const [hint, setHint] = useState<{ coins?: number; sync?: number }>({});
  const [theme, setTheme] = useState<Theme>("auto");
  // Nothing recorded in this browser yet: one invitation stands in for the
  // week's sentence, the totals and the empty flowers.
  const [fresh, setFresh] = useState(false);
  const due = useReviewDue();

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
        setReadSlugs(Object.keys(store).filter((s) => store[s].r != null));
        setNext(nowPlaying(parseNow(localStorage.getItem(NOW_KEY)), store));
        setFresh(Object.keys(store).length === 0 && Object.keys(loadActivity()).length === 0);
        setJalons(gatherMilestones());
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
  // The calendar is drawn from the reader's today, known only once mounted:
  // drawn from the build's day on the server, its month labels differed from
  // the browser's and React threw a hydration error (#418). Until then, a
  // fixed Monday and no month names.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const anchor = now ?? FIXED_MONDAY;
  const today = localDay(anchor);
  const since = weekStart(anchor);
  const active = (d: string) => !!days[d] && (days[d].r > 0 || days[d].c > 0);

  // This week, Monday first, as pots: a day with a note read grows a tulip,
  // a day of cards only a sprout; today waits for its water.
  const pots = useMemo<PotDay[]>(() => {
    const start = new Date(`${since}T12:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const day = localDay(d);
      return {
        day,
        letter: d.toLocaleDateString(locale, { weekday: "narrow" }),
        read: (days[day]?.r ?? 0) > 0,
        cards: (days[day]?.c ?? 0) > 0,
        today: day === today,
        past: day < today,
      };
    });
  }, [locale, since, days, today]);

  // Twelve weeks as columns, Monday to Sunday down each; the current week
  // runs to today. A month's name heads the first week that starts in it.
  const heat = useMemo(() => {
    const start = new Date(`${since}T12:00:00`);
    start.setDate(start.getDate() - 7 * 11);
    const cells: { day: string; level: number; future: boolean }[] = [];
    const months: string[] = [];
    let lastMonth = -1;
    for (let i = 0; i < 84; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const day = localDay(d);
      if (i % 7 === 0) {
        months.push(!now || d.getMonth() === lastMonth ? "" : d.toLocaleDateString(locale, { month: "short" }));
        lastMonth = d.getMonth();
      }
      const n = (days[day]?.r ?? 0) * 3 + (days[day]?.c ?? 0);
      cells.push({
        day,
        level: n === 0 ? 0 : n < 5 ? 1 : n < 20 ? 2 : 3,
        future: day > today,
      });
    }
    return { months, cells, first: cells[0].day };
  }, [days, locale, today, since, now]);
  const activeDays = Object.keys(days).filter((d) => d >= heat.first && active(d)).length;
  const allActive = Object.keys(days).filter(active).length;
  const cardsAll = Object.values(days).reduce((n, v) => n + v.c, 0);
  const jalonsReached = jalons?.reduce((n, r) => n + r.reached.length, 0) ?? 0;
  const jalonsTotal = jalons?.reduce((n, r) => n + r.reached.length + (r.next === null ? 0 : 1), 0) ?? 0;

  // Notes read per colour family (lib/path-family.ts), the largest first.
  const growing = useMemo(() => {
    const by = new Map<string, number>();
    for (const s of readSlugs) {
      const f = familyOfPrefix(s);
      if (f) by.set(f, (by.get(f) ?? 0) + 1);
    }
    return [...by]
      .map(([family, n]) => ({ family, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 4);
  }, [readSlugs]);

  const langLabel = LANG_OPTIONS.find((o) => o.code === locale)?.label ?? locale;
  const watered = active(today);
  // "Cette semaine, 1 note lue jusqu'au bout et 4 commencées." with the
  // counts in bold, then where today's pot stands.
  const rich = (s: string, parts: Record<string, ReactNode>) => s.split(/\{(\w+)\}/).map((x, i) => (i % 2 ? <b key={i}>{parts[x]}</b> : x));
  const weekLine =
    week.read || week.started
      ? rich(tr("moi.say"), {
          read: tr(week.read === 1 ? "moi.sayRead1" : "moi.sayReadN", {
            n: week.read,
          }),
          started: tr(week.started === 1 ? "moi.sayStarted1" : "moi.sayStartedN", { n: week.started }),
        })
      : tr("moi.sayNone");
  const potLine = watered ? "moi.potDone" : run > 0 ? "moi.potWait" : "moi.potFirst";
  const gardenerLook = {
    ...(account === "in" && look ? look : defaultLook()),
    background: "none",
  };
  const dueMin = due ? Math.max(1, Math.round(due.n / 3)) : 0;

  return (
    <div className="moi" data-pagefind-ignore>
      <header className="moi-top">
        <div>
          <p className="moi-kick">{tr("moi.kicker")}</p>
          <h1>{tr("moi.title")}</h1>
        </div>
        <div className="moi-top-r">
          {account === "in" && hint.coins != null && (
            <a className="moi-coins" href="/compte/#pieces" aria-label={`${hint.coins} ${tr("coins.unit")}`}>
              <i aria-hidden="true" />
              {hint.coins}
            </a>
          )}
          <a className="moi-gear" href="#moi-reglages" aria-label={tr("settings.title")}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </svg>
          </a>
        </div>
      </header>

      <section className="moi-card moi-plot">
        <div className="moi-bed">
          <GardenBed
            days={pots}
            label={tr("moi.bedAria", {
              n: pots.filter((p) => p.read || p.cards).length,
            })}
          />
          {best > 0 && (
            <a className="moi-run" href="/defis/">
              <b>
                {run}
                <svg className="moi-flame" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
                </svg>
              </b>
              <small>
                {tr("dash.streak")}
                {best > run && <> · {tr("moi.record", { n: best })}</>}
              </small>
            </a>
          )}
          {account === "in" ? (
            <a className="moi-gardener" href="/compte/#jardinier" aria-label={tr("moi.wardrobe")}>
              <Avatar look={gardenerLook} size={96} />
              <span className="moi-gardener-edit" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                </svg>
              </span>
            </a>
          ) : (
            <span className="moi-gardener">
              <Avatar look={gardenerLook} size={96} />
            </span>
          )}
        </div>
        <div className="moi-who">
          <span className="moi-who-tx">
            <b>{tr(account === "out" ? "moi.guestTitle" : "moi.gardener")}</b>
            <small>
              {account === "in" && <i className="moi-ok" aria-hidden="true" />}
              {account === "in"
                ? hint.sync
                  ? `${tr("compte.synced")} · ${ago(hint.sync, locale)}`
                  : tr("moi.accountText")
                : open > 0
                  ? tr("moi.guestText", { n: open })
                  : tr("moi.guestTextEmpty")}
            </small>
          </span>
          {account === "in" && (
            <a className="moi-who-go" href="/compte/#jardinier">
              {tr("moi.wardrobe")}
            </a>
          )}
          {account === "out" && (
            <a className="moi-who-go moi-who-go--in" href="/compte/">
              {tr("moi.signIn")}
            </a>
          )}
        </div>
        {!fresh && (
          <div className="moi-stats">
            <div>
              <b>{readSlugs.length}</b>
              <small>{tr("progression.statRead")}</small>
            </div>
            <a href="/cartes/">
              <b>{cardsAll}</b>
              <small>{tr("moi.cards")}</small>
            </a>
            <div>
              <b>{allActive}</b>
              <small>{tr("moi.statDays")}</small>
            </div>
            <div>
              <b>{jalonsReached}</b>
              <small>{tr("moi.statJalons")}</small>
            </div>
          </div>
        )}
      </section>

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
          <p className="moi-say">
            {weekLine} {tr(potLine)}
          </p>
          <a className="moi-do" href={next ? `/posts/${next.note.s}/` : "/parcours/"}>
            <span className="moi-do-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 14h11l3-4h2M7 14v5h7v-5M15 10V6" />
              </svg>
            </span>
            <span className="moi-do-tx">
              <b>{tr(watered ? "moi.nextMore" : "moi.water")}</b>
              <small>{next ? `${next.note.title} · ${tr("moi.minutes", { n: next.left })}` : tr("progression.welcomePaths")}</small>
            </span>
            <span className="moi-do-btn">{tr(next ? "moi.read" : "moi.choose")}</span>
          </a>
          {due && (
            <a className="moi-do moi-do--due" href={due.href}>
              <span className="moi-do-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="4" y="8" width="11" height="12" rx="2" />
                  <path d="M9 8V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3" />
                </svg>
              </span>
              <span className="moi-do-tx">
                <b>{tr(due.n === 1 ? "moi.due1" : "moi.dueN", { n: due.n })}</b>
                <small>{tr("moi.dueMin", { n: dueMin })}</small>
              </span>
              <span className="moi-do-btn">{tr("moi.review")}</span>
            </a>
          )}

          {jalons && (
            <section aria-labelledby="moi-jalons">
              <div className="moi-row-h">
                <h2 className="moi-h" id="moi-jalons">
                  {tr("jalons.title")}
                </h2>
                <span>{tr("jalons.count", { n: jalonsReached, total: jalonsTotal })}</span>
              </div>
              <MilestoneBadges rows={byProximity(jalons)} tr={tr} />
            </section>
          )}

          <div className="moi-row-h">
            <h2 className="moi-h">{tr("moi.seasons")}</h2>
            <span>{tr("moi.weeks", { n: 12 })}</span>
          </div>
          <div className="moi-card moi-cal">
            <div className="moi-heat-ms" aria-hidden="true">
              {heat.months.map((m, w) => (
                <span key={`m${w}`}>{m}</span>
              ))}
            </div>
            <div className="moi-heat" role="img" aria-label={tr("moi.activityAria", { n: activeDays })}>
              {heat.cells.map((c) => (
                <i key={c.day} className={[c.future ? "f" : c.level ? `l${c.level}` : "", c.day === today ? "t" : ""].filter(Boolean).join(" ") || undefined} />
              ))}
            </div>
            <p className="moi-cal-foot">{tr("moi.bloomDays", { n: activeDays })}</p>
          </div>

          {growing.length > 0 && (
            <>
              <div className="moi-row-h">
                <h2 className="moi-h">{tr("moi.growing")}</h2>
                <a className="moi-row-link" href="/disciplines/">
                  {tr("moi.disciplines")}
                </a>
              </div>
              <Growing rows={growing} tr={tr} />
            </>
          )}
        </>
      )}

      <h2 className="moi-h" id="moi-reglages">
        {tr("settings.title")}
      </h2>
      <div className="moi-card moi-list">
        {account !== "off" && (
          <a className="moi-set moi-set--btn" href="/compte/">
            <i className="moi-set-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
            </i>
            <span>
              {tr(account === "in" ? "moi.accountTitle" : "moi.signIn")}
              <small>{tr(account === "in" ? "moi.accountText" : "moi.signInSub")}</small>
            </span>
            <Chevron />
          </a>
        )}
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
