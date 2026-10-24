"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { calendarDays, loadActivity } from "@/lib/personal";
import { loadStore } from "@/lib/reading-progress";
import { NOTE_PREFIX, parseNoteDeck } from "@/lib/note-quiz";
import { disciplinesOf, longestRun, milestones, type MilestoneRow } from "@/lib/milestones";

// "Jalons" (/compte/ and Moi): a few milestones from this browser's records
// (lib/milestones.ts), each kind as one row: the thresholds reached as
// filled marks, the next one with how far it is. Nothing shows before the
// first record.

function gather(): MilestoneRow[] | null {
  const store = loadStore();
  const readSlugs = Object.entries(store)
    .filter(([, e]) => e.r != null)
    .map(([s]) => s);
  const days = calendarDays(
    loadActivity(),
    readSlugs.map((s) => store[s].r!),
  );
  let right = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(NOTE_PREFIX)) continue;
    const d = parseNoteDeck(localStorage.getItem(k));
    const ids = new Set([...Object.keys(d.ok ?? {}), ...Object.entries(d.cards).filter(([, c]) => c.reps > 0).map(([id]) => id)]);
    right += ids.size;
  }
  const input = { read: readSlugs.length, bestRun: longestRun(days), right, disciplines: disciplinesOf(readSlugs) };
  return Object.values(input).some((v) => v > 0) ? milestones(input) : null;
}

const ICON: Record<MilestoneRow["kind"], string> = {
  read: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5",
  bestRun: "M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.7 2-4.5 0 2 1 3 2 3 0-4 1-6.5 1-8.5z",
  right: "m5 12.5 4.5 4.5L19 7.5",
  disciplines: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
};

export function Milestones({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [rows, setRows] = useState<MilestoneRow[] | null>(null);
  useEffect(() => {
    const load = () => {
      try {
        setRows(gather());
      } catch {
        setRows(null);
      }
    };
    load();
    window.addEventListener("gk:activity", load);
    window.addEventListener("gk:progress-synced", load);
    return () => {
      window.removeEventListener("gk:activity", load);
      window.removeEventListener("gk:progress-synced", load);
    };
  }, []);
  if (!rows) return null;
  const label = (r: MilestoneRow) => {
    const n = r.reached.length ? r.reached[r.reached.length - 1] : (r.next ?? 0);
    return tr(n === 1 && r.kind === "read" ? "jalons.read1" : `jalons.${r.kind}`, { n });
  };
  return (
    <section className={`jalons ${className}`} aria-labelledby="jalons-h" data-pagefind-ignore>
      <h2 id="jalons-h" className="jalons-h">
        {tr("jalons.title")}
      </h2>
      <ul className="jalons-list">
        {rows.map((r) => (
          <li key={r.kind} className={r.reached.length ? "is-on" : undefined}>
            <span className="jalons-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d={ICON[r.kind]} />
              </svg>
            </span>
            <span className="jalons-tx">
              <b>{label(r)}</b>
              <small>
                {r.next === null
                  ? tr("jalons.all")
                  : tr("jalons.next", { have: r.value, next: r.next })}
              </small>
              {r.next !== null && (
                <i className="jalons-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round((100 * (r.value - r.from)) / (r.next - r.from))}%` }} />
                </i>
              )}
            </span>
            <span className="jalons-marks" aria-label={tr("jalons.reached", { n: r.reached.length, total: r.reached.length + (r.next === null ? 0 : 1) })}>
              {r.reached.map((s) => (
                <i key={s} className="on" title={String(s)} />
              ))}
              {r.next !== null && <i title={String(r.next)} />}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
