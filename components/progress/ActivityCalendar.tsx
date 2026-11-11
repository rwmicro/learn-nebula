"use client";

import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import {
  calendarDays,
  currentRun,
  loadActivity,
  localDay,
  ACTIVITY_KEY,
} from "@/lib/personal";
import { loadStore } from "@/lib/reading-progress";

const WEEKS = 26;

/** One day's plant, drawn in a 13 px cell: a dot for a day off, then a seed,
 *  a sprout, a young plant and a tulip as the day did more. */
function Plant({ level }: { level: number }) {
  switch (level) {
    case 0:
      return <circle className="cal-dot" cx="6.5" cy="9" r="1.4" />;
    case 1:
      return (
        <ellipse
          className="cal-leaf cal-seed"
          cx="6.5"
          cy="10"
          rx="2.6"
          ry="1.8"
        />
      );
    case 2:
      return (
        <>
          <path className="cal-stem" d="M6.5 12V6.5" />
          <path
            className="cal-leaf"
            d="M6.5 8.5q-3.6-.4-4-3.4q3.4 0 4 3.4zM6.5 7.6q3.6-.4 4-3.4q-3.4 0-4 3.4z"
          />
        </>
      );
    case 3:
      return (
        <>
          <path className="cal-stem" d="M6.5 12.5V3" />
          <path
            className="cal-leaf"
            d="M6.5 9.5q-4.6-.3-5-4.1q4.4 0 5 4.1zM6.5 6.8q4.6-.3 5-4.1q-4.4 0-5 4.1z"
          />
        </>
      );
    default:
      return (
        <>
          <path className="cal-stem" d="M6.5 12.5V6" />
          <path
            className="cal-leaf"
            d="M6.5 10.6q-4-.2-4.4-3.4q3.8 0 4.4 3.4z"
          />
          <path
            className="cal-petal"
            d="M3.6 1.6q0 4.8 2.9 4.8t2.9-4.8l-1.45 1.8L6.5 1l-1.45 2.4z"
          />
        </>
      );
  }
}

/**
 * Regularity calendar: one cell per day over the last six months, where a
 * plant grows taller the more was done (notes finished, cards and questions
 * reviewed), up to a tulip: GitHub's contributions, as a garden. Read from this browser (lib/personal.ts activity
 * log + the reading store's "read" dates), so it needs no account; with one,
 * the sync brings the other devices' days in.
 */
export function ActivityCalendar() {
  const locale = useLocale();
  const [days, setDays] = useState<Record<string, { r: number; c: number }> | null>(null);

  useEffect(() => {
    const load = () => {
      try {
        const reads = Object.values(loadStore())
          .map((e) => e.r)
          .filter((r): r is number => typeof r === "number");
        setDays(calendarDays(loadActivity(), reads));
      } catch {
        setDays({});
      }
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY || e.key === "gkReading") load();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("gk:progress-synced", load);
    window.addEventListener("gk:activity", load);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("gk:progress-synced", load);
      window.removeEventListener("gk:activity", load);
    };
  }, []);

  const grid = useMemo(() => {
    if (!days) return null;
    const today = new Date();
    // Start on the Monday WEEKS-1 weeks before this week's Monday.
    const dow = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(today.getDate() - dow - (WEEKS - 1) * 7);
    const cols: { day: string; n: number; r: number; c: number; future: boolean }[][] = [];
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    const fmt = new Intl.DateTimeFormat(locale, { month: "short" });
    for (let w = 0; w < WEEKS; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const x = new Date(start);
        x.setDate(start.getDate() + w * 7 + d);
        const key = localDay(x);
        const v = days[key] ?? { r: 0, c: 0 };
        // A note read weighs like ten reviews.
        col.push({ day: key, r: v.r, c: v.c, n: v.r * 10 + v.c, future: x > today });
        if (d === 0 && x.getMonth() !== lastMonth) {
          lastMonth = x.getMonth();
          months.push({ col: w, label: fmt.format(x) });
        }
      }
      cols.push(col);
    }
    const last30 = cols
      .flat()
      .filter((c) => !c.future)
      .slice(-30)
      .filter((c) => c.n > 0).length;
    return { cols, months, last30, run: currentRun(days) };
  }, [days, locale]);

  if (!grid) return <div className="cal cal--loading" aria-hidden="true" />;

  const level = (n: number) => (n === 0 ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 30 ? 3 : 4);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" });
  const CELL = 13;
  const GAP = 3;
  const W = WEEKS * (CELL + GAP);
  const H = 7 * (CELL + GAP) + 16;

  return (
    <div className="cal">
      <p className="cal-summary">
        <strong>{t("calendar.last30", { n: grid.last30 }, locale)}</strong>
        {grid.run > 0 && <span> · {t("calendar.run", { n: grid.run }, locale)}</span>}
      </p>
      <div className="cal-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t("calendar.aria", { n: grid.last30 }, locale)}>
          {grid.months.map((m) => (
            <text key={`${m.col}-${m.label}`} x={m.col * (CELL + GAP)} y={10} className="cal-month">
              {m.label}
            </text>
          ))}
          {grid.cols.map((col, w) =>
            col.map((c, d) =>
              c.future ? null : (
                <g
                  key={c.day}
                  transform={`translate(${w * (CELL + GAP)} ${16 + d * (CELL + GAP)})`}
                >
                  <rect width={CELL} height={CELL} className="cal-cell" />
                  <Plant level={level(c.n)} />
                  <title>
                    {dayFmt.format(new Date(`${c.day}T12:00:00`)) +
                      " · " +
                      (c.n
                        ? t("calendar.cell", { r: c.r, c: c.c }, locale)
                        : t("calendar.none", undefined, locale))}
                  </title>
                </g>
              ),
            ),
          )}
        </svg>
      </div>
      <p className="cal-legend" aria-hidden="true">
        <span>{t("calendar.less", undefined, locale)}</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <svg
            key={l}
            className="cal-key"
            viewBox="0 0 13 13"
            width="13"
            height="13"
          >
            <Plant level={l} />
          </svg>
        ))}
        <span>{t("calendar.more", undefined, locale)}</span>
      </p>
    </div>
  );
}
