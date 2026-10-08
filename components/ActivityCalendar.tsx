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

/**
 * Regularity calendar: one square per day over the last six months, darker
 * the more was done (notes finished, cards and questions reviewed), like
 * GitHub's contributions. Read from this browser (lib/personal.ts activity
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
                <rect
                  key={c.day}
                  x={w * (CELL + GAP)}
                  y={16 + d * (CELL + GAP)}
                  width={CELL}
                  height={CELL}
                  rx={3}
                  className={`cal-cell cal-l${level(c.n)}`}
                >
                  <title>
                    {dayFmt.format(new Date(`${c.day}T12:00:00`)) +
                      " · " +
                      (c.n
                        ? t("calendar.cell", { r: c.r, c: c.c }, locale)
                        : t("calendar.none", undefined, locale))}
                  </title>
                </rect>
              ),
            ),
          )}
        </svg>
      </div>
      <p className="cal-legend" aria-hidden="true">
        <span>{t("calendar.less", undefined, locale)}</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`cal-key cal-l${l}`} />
        ))}
        <span>{t("calendar.more", undefined, locale)}</span>
      </p>
    </div>
  );
}
