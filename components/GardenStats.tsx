import { t, i18nAttrs, folderKey } from "@/lib/i18n";
import { formatDateLong } from "@/lib/content";
import type { GardenStats as Stats, MonthCount } from "@/lib/garden-stats";

/**
 * /jardin/: the vault in numbers (lib/garden-stats.ts), rendered on the
 * server with no client JS. The growth chart is a plain SVG: running total
 * as an area, notes planted each month as bars underneath, on one time axis.
 */
export function GardenStats({ stats, builtAt }: { stats: Stats; builtAt: Date }) {
  const disc = (name: string) => {
    const k = folderKey(name);
    return k ? <span {...attrs(i18nAttrs(k))}>{t(k)}</span> : <>{name}</>;
  };
  const maxDisc = Math.max(1, ...stats.byDiscipline.map((d) => d.notes));
  return (
    <main className="jardin-page">
      <a href="/" className="jardin-back">
        ← <span {...attrs(i18nAttrs("nav.home"))}>{t("nav.home")}</span>
      </a>
      <p className="jardin-kicker">
        <span {...attrs(i18nAttrs("jardin.updated"))}>{t("jardin.updated")}</span>{" "}
        <time dateTime={builtAt.toISOString()} data-i18n-date>
          {formatDateLong(builtAt)}
        </time>
      </p>
      <h1 className="jardin-title" {...attrs(i18nAttrs("jardin.title"))}>
        {t("jardin.title")}
      </h1>
      <p className="jardin-intro" {...attrs(i18nAttrs("jardin.intro"))}>
        {t("jardin.intro")}
      </p>

      <dl className="jardin-figs">
        <Fig n={fmtInt(stats.notes)} k="jardin.statNotes" />
        <Fig n={fmtWords(stats.words)} k="jardin.statWords" />
        <Fig n={fmtInt(stats.disciplines)} k="jardin.statDisciplines" />
        {stats.clips > 0 && <Fig n={fmtInt(stats.clips)} k="jardin.statClips" />}
      </dl>

      {stats.months.length > 1 && (
        <section className="jardin-section" aria-labelledby="jardin-growth">
          <h2 id="jardin-growth" className="jardin-h" {...attrs(i18nAttrs("jardin.growthTitle"))}>
            {t("jardin.growthTitle")}
          </h2>
          <GrowthChart months={stats.months} />
          {stats.peak && (
            <p
              className="jardin-note"
              {...attrs(i18nAttrs("jardin.peak", { n: stats.peak.planted, month: monthLabel(stats.peak.month) }))}
            >
              {t("jardin.peak", { n: stats.peak.planted, month: monthLabel(stats.peak.month) })}
            </p>
          )}
        </section>
      )}

      <div className="jardin-cols">
        <section className="jardin-section" aria-labelledby="jardin-disc">
          <h2 id="jardin-disc" className="jardin-h" {...attrs(i18nAttrs("jardin.disciplinesTitle"))}>
            {t("jardin.disciplinesTitle")}
          </h2>
          <ul className="jardin-bars">
            {stats.byDiscipline.map((d) => (
              <li key={d.name || "_rest"} className={d.name ? undefined : "is-rest"}>
                <span className="jardin-bar-label">
                  {d.name ? (
                    disc(d.name)
                  ) : (
                    <span {...attrs(i18nAttrs("jardin.others"))}>{t("jardin.others")}</span>
                  )}
                </span>
                <span className="jardin-bar-track" aria-hidden="true">
                  <span className="jardin-bar-fill" style={{ width: `${((d.notes / maxDisc) * 100).toFixed(1)}%` }} />
                </span>
                <span className="jardin-bar-n">{d.notes}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="jardin-side">
          {stats.cited.length > 0 && (
            <section className="jardin-section" aria-labelledby="jardin-cited">
              <h2 id="jardin-cited" className="jardin-h" {...attrs(i18nAttrs("jardin.citedTitle"))}>
                {t("jardin.citedTitle")}
              </h2>
              <ol className="jardin-cited">
                {stats.cited.map((c) => (
                  <li key={c.slug}>
                    <a href={`/posts/${c.slug}/`}>{c.title}</a>
                    <span {...attrs(i18nAttrs("jardin.links", { n: c.links }))}>
                      {t("jardin.links", { n: c.links })}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {stats.growing.length > 0 && (
            <section className="jardin-section" aria-labelledby="jardin-growing">
              <h2 id="jardin-growing" className="jardin-h" {...attrs(i18nAttrs("jardin.growingTitle"))}>
                {t("jardin.growingTitle")}
              </h2>
              <ul className="jardin-cited">
                {stats.growing.map((g) => (
                  <li key={g.name}>
                    <span>{disc(g.name)}</span>
                    <span {...attrs(i18nAttrs("jardin.newNotes", { n: g.notes }))}>
                      {t("jardin.newNotes", { n: g.notes })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function Fig({ n, k }: { n: string; k: string }) {
  return (
    <div>
      <dt {...attrs(i18nAttrs(k))}>{t(k)}</dt>
      <dd>{n}</dd>
    </div>
  );
}

function GrowthChart({ months }: { months: MonthCount[] }) {
  const W = 760;
  const H = 250;
  const L = 44;
  const R = 52;
  const T = 12;
  const BH = 60;
  const GAP = 16;
  const A = H - T - BH - GAP - 22;
  const n = months.length;
  const last = months[n - 1];
  const maxTotal = niceMax(last.total);
  const maxPlanted = Math.max(1, ...months.map((m) => m.planted));
  const step = (W - L - R) / n;
  const x = (i: number) => L + (i + 0.5) * step;
  const bw = Math.max(1, step - 4);
  const yC = (v: number) => T + A - (v / maxTotal) * A;
  const base = T + A + GAP + BH;
  const yB = (v: number) => base - (v / maxPlanted) * BH;
  const pts = months.map((m, i) => `${x(i).toFixed(1)},${yC(m.total).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxTotal * f));
  const peakI = months.reduce((b, m, i) => (m.planted > months[b].planted ? i : b), 0);
  return (
    <div className="jardin-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t("jardin.chartAria", { n: last.total, from: months[0].month, to: last.month })}
        data-i18n-aria-label="jardin.chartAria"
        data-i18n-vars={JSON.stringify({ n: last.total, from: months[0].month, to: last.month })}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={yC(v)} y2={yC(v)} className="jardin-grid" />
            <text x={L - 6} y={yC(v) + 4} textAnchor="end">
              {fmtInt(v)}
            </text>
          </g>
        ))}
        <polygon points={`${x(0)},${yC(0)} ${pts} ${x(n - 1)},${yC(0)}`} className="jardin-area" />
        <polyline points={pts} className="jardin-line" />
        <circle cx={x(n - 1)} cy={yC(last.total)} r={4} className="jardin-dot" />
        <text x={x(n - 1) + 8} y={yC(last.total) + 4} className="jardin-ann">
          {fmtInt(last.total)}
        </text>
        <text x={x(0)} y={T + 10} className="jardin-ann" {...attrs(i18nAttrs("jardin.cumul"))}>
          {t("jardin.cumul")}
        </text>
        <line x1={L} x2={W - R} y1={base} y2={base} className="jardin-axis" />
        {months.map((m, i) => {
          const h = m.planted ? Math.max(1.5, (m.planted / maxPlanted) * BH) : 0;
          return (
            <rect key={m.month} x={x(i) - bw / 2} y={base - h} width={bw} height={h} className="jardin-bar">
              <title>{`${m.month} : ${m.planted}`}</title>
            </rect>
          );
        })}
        <text x={x(peakI)} y={yB(months[peakI].planted) - 4} textAnchor="middle" className="jardin-ann">
          {months[peakI].planted}
        </text>
        <text x={L - 6} y={base - BH / 2 + 4} textAnchor="end" {...attrs(i18nAttrs("jardin.perMonth"))}>
          {t("jardin.perMonth")}
        </text>
        {months.map((m, i) =>
          i === 0 || m.month.endsWith("-01") ? (
            <text key={m.month} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : "middle"}>
              {m.month.slice(0, 4)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/** "2026-02" → "février 2026" (build-time text is French, like every date). */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** A round axis top just above `v` (1 / 2 / 2.5 / 5 × 10ⁿ). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * p >= v) return f * p;
  return 10 * p;
}

const fmtInt = (n: number) => new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ");

function fmtWords(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (n >= 1e4) return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k`;
  return fmtInt(n);
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&quot;/g, '"');
  return out;
}
