"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { calendarDays, currentRun, loadActivity, localDay } from "@/lib/personal";
import { loadStore } from "@/lib/reading-progress";
import { loadLog } from "@/lib/srs-log";
import { dayKey } from "@/lib/srs";
import { authConfig, fetchMe, readHint } from "@/lib/account-client";
import { AppBack } from "@/components/AppBack";

// /defis/ — the day run and three small goals for today, from this browser's
// own records (lib/personal.ts's activity, the reading store, the review
// log): 20 cards, a note read to the end, 5 right answers; and one for the
// month, two reading paths finished. Coins show only for a signed-in reader,
// at the server's own scale (server/accounts.ts: 1 per review, 5 per note
// read), and the streak freezes come from the account too.

export interface DefisPath {
  slug: string;
  slugs: string[];
}

const GOALS = { cards: 20, read: 1, right: 5, paths: 2 } as const;
/** server/accounts.ts COINS: review 1, read 5. */
const COIN = { review: 1, read: 5 } as const;

const svg = (d: React.ReactNode, w = 1.8) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);
const ICON = {
  cards: svg(
    <>
      <rect x="4" y="6" width="13" height="15" rx="2" />
      <path d="M8 3h10a2 2 0 0 1 2 2v12" />
    </>,
  ),
  book: svg(
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    </>,
  ),
  quiz: svg(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" />
    </>,
  ),
  star: svg(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />),
  check: svg(<path d="m5 12.5 4.5 4.5L19 7.5" />, 2.6),
  flame: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z" />
    </svg>
  ),
};

interface Data {
  run: number;
  week: ("y" | "t" | "f" | "")[];
  cards: number;
  read: number;
  right: number;
  paths: number;
}

function load(paths: DefisPath[]): Data {
  const store = loadStore();
  const reads = Object.values(store)
    .map((e) => e.r)
    .filter((r): r is number => typeof r === "number");
  const days = calendarDays(loadActivity(), reads);
  const today = localDay();
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const k = localDay(d);
    const on = !!days[k] && (days[k].r > 0 || days[k].c > 0);
    return on ? "y" : k === today ? "t" : k > today ? "f" : "";
  }) as Data["week"];
  const [n, f] = loadLog()[dayKey()] ?? [0, 0];
  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const since = month.getTime() / 1000;
  const finished = paths.filter((p) => {
    let last = 0;
    for (const s of p.slugs) {
      const r = store[s]?.r;
      if (r == null) return false;
      last = Math.max(last, r);
    }
    return p.slugs.length > 0 && last >= since;
  }).length;
  return {
    run: currentRun(days),
    week,
    cards: days[today]?.c ?? 0,
    read: days[today]?.r ?? 0,
    right: n - f,
    paths: finished,
  };
}

export function Defis({ paths }: { paths: DefisPath[] }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [d, setD] = useState<Data | null>(null);
  const [account, setAccount] = useState<{ freezes: number } | null>(null);
  const [left, setLeft] = useState("");

  useEffect(() => {
    const refresh = () => {
      try {
        setD(load(paths));
      } catch {
        /* storage blocked: the page stays empty */
      }
      const now = new Date();
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      const h = Math.floor((end.getTime() - now.getTime()) / 3_600_000);
      setLeft(h >= 1 ? tr("defis.hoursLeft", { n: h }) : tr("defis.lastHour"));
    };
    refresh();
    void authConfig().then(async (c) => {
      if (!c.enabled || !readHint().in) return;
      const me = await fetchMe();
      if (me) setAccount({ freezes: me.streak.freezes });
    });
    window.addEventListener("gk:activity", refresh);
    return () => window.removeEventListener("gk:activity", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths]);

  const day = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const names = Array.from({ length: 7 }, (_, i) => day.format(new Date(2024, 0, 1 + i)));
  const monthName = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date());

  const goal = (
    key: string,
    icon: React.ReactNode,
    fam: string,
    have: number,
    want: number,
    coins: number,
  ) => {
    const done = have >= want;
    return (
      <li className="defi" data-family={fam || undefined}>
        <span className="defi-ico">{icon}</span>
        <span className="defi-tx">
          <b>{tr(`defis.${key}`, { n: want })}</b>
          <span
            className="defi-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={want}
            aria-valuenow={Math.min(have, want)}
            aria-label={tr(`defis.${key}`, { n: want })}
          >
            <i style={{ width: `${Math.min(100, (100 * have) / want)}%` }} />
            <em className={have / want > 0.45 ? "in" : undefined}>
              {done ? tr("defis.done") : `${have} / ${want}`}
            </em>
          </span>
        </span>
        {account && (
          <span className={`defi-coin${done ? " got" : ""}`} aria-label={tr("defis.coins", { n: coins })}>
            {done ? ICON.check : coins}
          </span>
        )}
      </li>
    );
  };

  return (
    <main className="defis" data-pagefind-ignore>
      <AppBack href="/progression/" labelKey="moi.title" />
      <h1 className="defis-title">{tr("defis.title")}</h1>

      <section className="defis-run">
        <div>
          <p className="defis-run-n">
            {d?.run ?? 0} <span>{tr("defis.days", { n: d?.run ?? 0 })}</span>
          </p>
          <p className="defis-run-tx">{tr(d && d.week.includes("y") && d.run > 0 ? "defis.keep" : "defis.start")}</p>
        </div>
        {ICON.flame}
      </section>

      <section className="defis-card">
        <ol className="defis-week" aria-label={tr("defis.week")}>
          {names.map((n, i) => {
            const s = d?.week[i] ?? "";
            return (
              <li key={i} className={s || undefined}>
                <i>{s === "y" && ICON.check}</i>
                {n}
              </li>
            );
          })}
        </ol>
        {account && (
          <p className="defis-freeze">
            <span aria-hidden="true">❄</span>
            {tr(account.freezes ? "defis.freezes" : "defis.noFreeze", { n: account.freezes })}
          </p>
        )}
      </section>

      <div className="defis-h">
        <h2>{tr("defis.today")}</h2>
        <span>{left}</span>
      </div>
      <ul className="defis-list">
        {goal("cards", ICON.cards, "", d?.cards ?? 0, GOALS.cards, GOALS.cards * COIN.review)}
        {goal("read", ICON.book, "langues", d?.read ?? 0, GOALS.read, GOALS.read * COIN.read)}
        {goal("right", ICON.quiz, "sciences", d?.right ?? 0, GOALS.right, GOALS.right * COIN.review)}
      </ul>

      <div className="defis-h">
        <h2>{tr("defis.month", { month: monthName })}</h2>
      </div>
      <ul className="defis-list">
        <li className="defi defi-month" data-family="pensee">
          <span className="defi-ico">{ICON.star}</span>
          <span className="defi-tx">
            <b>{tr("defis.paths", { n: GOALS.paths })}</b>
            <span className="defi-bar" role="progressbar" aria-valuemin={0} aria-valuemax={GOALS.paths} aria-valuenow={Math.min(d?.paths ?? 0, GOALS.paths)} aria-label={tr("defis.paths", { n: GOALS.paths })}>
              <i style={{ width: `${Math.min(100, (100 * (d?.paths ?? 0)) / GOALS.paths)}%` }} />
              <em className={(d?.paths ?? 0) / GOALS.paths > 0.45 ? "in" : undefined}>
                {(d?.paths ?? 0) >= GOALS.paths ? tr("defis.done") : `${d?.paths ?? 0} / ${GOALS.paths}`}
              </em>
            </span>
          </span>
        </li>
      </ul>
      <p className="defis-note">{tr("defis.note")}</p>
    </main>
  );
}
