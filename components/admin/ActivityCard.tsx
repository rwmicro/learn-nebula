"use client";

// Thirty days of the site's life — GET /api/admin/activity: questions to the
// assistant, comments, sign-ups and accounts seen, one small bar chart each
// (one series per chart, same day axis, each on its own scale). Hover or tap a
// day for its value; "tableau" shows the same numbers as a table.

import { useId, useState } from "react";
import { BUTTON_CLASS, CardHeader, ErrorLine, Muted, RefreshButton, type AdminCardProps } from "./shared";
import { URLS, useAdminResource } from "./store";

export interface ActivityData {
  days: string[];
  questions: number[];
  comments: number[];
  signups: number[];
  active: number[];
}

type SeriesKey = Exclude<keyof ActivityData, "days">;

const SERIES: { key: SeriesKey; label: string; note?: string }[] = [
  { key: "questions", label: "Questions à l'assistant", note: "les 300 plus récentes seulement" },
  { key: "comments", label: "Commentaires", note: "encore en base" },
  { key: "signups", label: "Inscriptions" },
  { key: "active", label: "Comptes actifs", note: "relevé depuis la mise à jour d'oct. 2026" },
];

const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDay = (d: string) => DAY.format(new Date(`${d}T00:00:00Z`));

export function ActivityCard({ token, onUnauthorized }: AdminCardProps) {
  const res = useAdminResource<ActivityData>(URLS.activity, token, onUnauthorized);
  const [table, setTable] = useState(false);
  const d = res.data;
  return (
    <section id="admin-activity" className="admin-card admin-card--wide">
      <CardHeader title="activité · 30 jours">
        <span className="flex items-center gap-2">
          <button type="button" className={BUTTON_CLASS} aria-pressed={table} onClick={() => setTable(!table)}>
            {table ? "graphiques" : "tableau"}
          </button>
          <RefreshButton busy={res.busy} onClick={() => res.reload()} label="Actualiser l'activité" />
        </span>
      </CardHeader>
      {res.failed && <ErrorLine>{res.error ?? "Impossible de lire l'activité."}</ErrorLine>}
      {!d && !res.failed && <Muted>Chargement…</Muted>}
      {d && !table && (
        <div className="admin-spark-grid">
          {SERIES.map((s) => (
            <Spark key={s.key} label={s.label} note={s.note} days={d.days} values={d[s.key]} />
          ))}
        </div>
      )}
      {d && table && <ActivityTable d={d} />}
    </section>
  );
}

const W = 300;
const H = 72;
const GAP = 2;

function Spark({ label, note, days, values }: { label: string; note?: string; days: string[]; values: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...values);
  const step = W / Math.max(1, values.length);
  const bw = Math.max(1, step - GAP);
  const shown = hover ?? values.length - 1;

  return (
    <figure className="admin-spark m-0">
      <figcaption id={titleId} className="admin-spark-head">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular-nums text-muted-warm">
          {total.toLocaleString("fr-FR")} en {values.length} j
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={titleId}
        className="admin-spark-svg"
        onPointerLeave={() => setHover(null)}
      >
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="admin-spark-base" />
        {values.map((v, i) => {
          const h = v ? Math.max(2, ((H - 4) * v) / max) : 0;
          const x = i * step + GAP / 2;
          const r = Math.min(2, bw / 2, h);
          return (
            <g key={days[i]}>
              {h > 0 && (
                <path
                  className={`admin-spark-bar ${hover === i ? "is-hover" : ""}`}
                  d={`M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + bw - r} Q${x + bw},${H - h} ${x + bw},${H - h + r} V${H} Z`}
                />
              )}
              <rect
                x={i * step}
                y={0}
                width={step}
                height={H}
                fill="transparent"
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      <div className="admin-spark-foot tabular-nums" aria-live="polite">
        <span>
          {days[shown] ? fmtDay(days[shown]) : ""} :{" "}
          <strong className="text-ink">{(values[shown] ?? 0).toLocaleString("fr-FR")}</strong>
          {hover === null && " (aujourd'hui)"}
        </span>
        {note && <span className="text-muted-warm">{note}</span>}
      </div>
    </figure>
  );
}

function ActivityTable({ d }: { d: ActivityData }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th scope="col">Jour</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col" className="is-num">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.days
            .map((day, i) => ({ day, i }))
            .reverse()
            .map(({ day, i }) => (
              <tr key={day}>
                <th scope="row">{fmtDay(day)}</th>
                {SERIES.map((s) => (
                  <td key={s.key} className="is-num">
                    {d[s.key][i] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
