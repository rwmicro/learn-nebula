"use client";

import type { CSSProperties, ReactNode } from "react";
import { MILESTONE_ICON } from "@/components/progress/Milestones";
import { progressToNext, type MilestoneRow } from "@/lib/milestones";

// The pieces of Moi's garden (MoiPhone.tsx): this week as a row of seven
// pots (a day read grows a tulip, a day of cards only a sprout, today
// waits as a dashed seedling), and the milestones as round badges. Colours
// are CSS (assets/css/phone/moi.css), so they follow light and dark.

export type PotDay = {
  day: string;
  letter: string;
  read: boolean;
  cards: boolean;
  today: boolean;
  past: boolean;
};

const W = 390;
const H = 232;
const GROUND = 200;
const potX = (i: number) => 30 + i * 40;

function Pot({ d, i }: { d: PotDay; i: number }) {
  const x = potX(i);
  const y = GROUND;
  let plant: ReactNode = null;
  if (d.read) {
    plant = (
      <g className="moi-bed-plant">
        <path className="stem" d={`M${x} ${y - 27}v-40`} />
        <path className="leaf2" d={`M${x} ${y - 44}q-14-5-16-18q12 4 16 16z`} />
        <path className="leaf" d={`M${x} ${y - 38}q12-4 14-14q-10 2-14 12z`} />
        <path className="bloom" d={`M${x - 8} ${y - 83}q0 16 8 18q8-2 8-18l-4 5.5-4-7-4 7z`} />
      </g>
    );
  } else if (d.cards) {
    plant = (
      <g className="moi-bed-plant">
        <path className="stem" d={`M${x} ${y - 27}v-18`} />
        <path className="leaf2" d={`M${x} ${y - 40}q-9-3-10-10q9 2 10 9z`} />
        <path className="leaf" d={`M${x} ${y - 42}q9-3 10-10q-9 2-10 9z`} />
      </g>
    );
  } else if (d.today) {
    plant = (
      <g className="moi-bed-wait">
        <path d={`M${x} ${y - 28}v-22M${x} ${y - 42}q-9-3-10-10q9 2 10 9M${x} ${y - 44}q9-3 10-10q-9 2-10 9`} />
        <circle cx={x} cy={y - 27} r="3.5" />
      </g>
    );
  } else if (d.past) {
    plant = <path className="moi-bed-dry" d={`M${x - 5} ${y - 28}q5-3 10 0`} />;
  }
  return (
    <g>
      <path className="moi-bed-pot" d={`M${x - 14} ${y - 22}h28l-3.5 22h-21z`} />
      <rect className="moi-bed-rim" x={x - 16.5} y={y - 27} width="33" height="7" rx="2" />
      {plant}
      <text className={d.today ? "moi-bed-day now" : "moi-bed-day"} x={x} y={H - 9} textAnchor="middle">
        {d.letter}
      </text>
    </g>
  );
}

// Fixed stars, so the server and the browser draw the same night.
const STARS = Array.from({ length: 26 }, (_, i) => ({
  x: (i * 97) % W,
  y: 8 + ((i * 53) % 90),
  r: 0.6 + (i % 3) * 0.4,
}));

/** The bed itself: sky (a sun, or a moon and stars in dark), soil, pots. */
export function GardenBed({ days, label }: { days: PotDay[]; label: string }) {
  return (
    <svg className="moi-bed-scene" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <g className="moi-bed-sun">
        <circle cx="260" cy="44" r="30" opacity="0.25" />
        <circle cx="260" cy="44" r="18" />
      </g>
      <g className="moi-bed-night">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} />
        ))}
        <path d="M262 32a12 12 0 1 0 6 22a10.5 10.5 0 0 1-6-22z" />
      </g>
      <path className="moi-bed-soil" d={`M0 ${GROUND}Q195 ${GROUND - 18} ${W} ${GROUND}V${H}H0Z`} />
      {days.map((d, i) => (
        <Pot key={d.day} d={d} i={i} />
      ))}
    </svg>
  );
}

type Tr = (k: string, v?: Record<string, string | number>) => string;

/** Milestones as badges, closest first: a ring for the one under way, a
 *  gold medal once every threshold of its kind is reached. */
export function MilestoneBadges({ rows, tr }: { rows: MilestoneRow[]; tr: Tr }) {
  const label = (r: MilestoneRow) => {
    const n = r.next ?? r.reached[r.reached.length - 1];
    return tr(n === 1 && r.kind === "read" ? "jalons.read1" : `jalons.${r.kind}`, { n });
  };
  return (
    <ul className="moi-badges">
      {rows.map((r) => {
        const done = r.next === null;
        const started = r.value > r.from || r.reached.length > 0;
        return (
          <li key={r.kind} className={done ? "got" : started ? "next" : "lock"}>
            <span
              className={`moi-badge moi-badge--${r.kind}`}
              style={
                {
                  "--p": `${Math.round(100 * progressToNext(r))}%`,
                } as CSSProperties
              }
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24">
                <path d={MILESTONE_ICON[r.kind]} />
              </svg>
            </span>
            <b>{label(r)}</b>
            <small>{done ? tr("jalons.all") : `${r.value} / ${r.next}`}</small>
          </li>
        );
      })}
    </ul>
  );
}

/** Notes read per colour family, the largest first, as bars. */
export function Growing({ rows, tr }: { rows: { family: string; n: number }[]; tr: Tr }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="moi-card moi-grow">
      {rows.map((r) => (
        <li key={r.family} data-family={r.family}>
          <span className="moi-grow-dot" aria-hidden="true" />
          <span>{tr(`parcours.family.${r.family}`)}</span>
          <small>{tr(r.n === 1 ? "moi.notes1" : "moi.notesN", { n: r.n })}</small>
          <i className="moi-grow-bar" aria-hidden="true">
            <i
              style={{
                width: `${Math.max(4, Math.round((100 * r.n) / max))}%`,
              }}
            />
          </i>
        </li>
      ))}
    </ul>
  );
}
