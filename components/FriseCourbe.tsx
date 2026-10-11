import { t, i18nAttrs } from "@/lib/i18n";
import type { FriseCurve } from "@/lib/frise-data";
import { bareTitle } from "@/components/Frise";

/**
 * Above the list on /frise/: world population since 1500 on a true time
 * scale, and every dated note of that span as a dot on the curve (a link to
 * the note, its title on hover and focus). The list below stays the full,
 * readable timeline; this shows where the garden's history sits against the
 * one number everything else in those five centuries leans on.
 *
 * The curve is an SVG stretched to the box (non-scaling stroke); the labels
 * and the dots are HTML placed in percent, so text keeps its size on a phone.
 */
const W = 1000;
const H = 300;

export function FriseCourbe({ curve }: { curve: FriseCurve }) {
  const top = Math.ceil(curve.max / 2e9) * 2e9;
  const x = (yr: number) => ((yr - curve.from) / (curve.to - curve.from)) * 100;
  const y = (v: number) => 100 - (v / top) * 100;
  const d = curve.points
    .map(([yr, v], i) => `${i ? "L" : "M"}${((x(yr) * W) / 100).toFixed(1)},${((y(v) * H) / 100).toFixed(1)}`)
    .join("");
  const yTicks = [];
  for (let v = 0; v <= top; v += 2e9) yTicks.push(v);
  const xTicks = [];
  for (let yr = Math.ceil(curve.from / 100) * 100; yr <= curve.to; yr += 100) xTicks.push(yr);
  const fmtBn = (v: number) => (v === 0 ? "0" : `${v / 1e9} Md`);
  return (
    <figure className="fc">
      <p className="fc-title" {...attrs(i18nAttrs("friseCourbe.title"))}>
        {t("friseCourbe.title")}
      </p>
      <p className="fc-sub" {...attrs(i18nAttrs("friseCourbe.sub", { n: curve.dots.length }))}>
        {t("friseCourbe.sub", { n: curve.dots.length })}
      </p>
      <div className="fc-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {yTicks.map((v) => (
            <line key={v} x1="0" x2={W} y1={(y(v) * H) / 100} y2={(y(v) * H) / 100} className={v ? "fc-grid" : "fc-base"} />
          ))}
          <path d={d} className="fc-line" />
        </svg>
        {yTicks.slice(1).map((v) => (
          <span key={v} className="fc-ytick" style={{ top: `${y(v)}%` }}>
            {fmtBn(v)}
          </span>
        ))}
        {xTicks.map((yr) => (
          <span key={yr} className="fc-xtick" style={{ left: `${x(yr)}%` }}>
            {yr}
          </span>
        ))}
        {curve.dots.map((dot) => (
          <a
            key={dot.href}
            href={dot.href}
            className={`fc-dot${x(dot.year) < 20 ? " fc-dot-l" : x(dot.year) > 80 ? " fc-dot-r" : ""}`}
            style={{ left: `${x(dot.year)}%`, top: `${y(dot.value)}%` }}
            data-label={`${dot.year} · ${bareTitle(dot.title)}`}
            aria-label={`${dot.year} : ${bareTitle(dot.title)}`}
          />
        ))}
      </div>
      <p className="fc-source">
        <span {...attrs(i18nAttrs("friseCourbe.source"))}>{t("friseCourbe.source")}</span>{" "}
        <a href={curve.url}>Our World in Data</a>, {curve.source}. CC BY 4.0.
        {curve.before > 0 && (
          <>
            {" "}
            <span {...attrs(i18nAttrs("friseCourbe.before", { n: curve.before, from: curve.from }))}>
              {t("friseCourbe.before", { n: curve.before, from: curve.from })}
            </span>
          </>
        )}
      </p>
    </figure>
  );
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&quot;/g, '"');
  return out;
}
