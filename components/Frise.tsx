import { t, i18nAttrs } from "@/lib/i18n";
import type { ReactNode } from "react";
import type { TimelineEntry } from "@/lib/content";
import { AppBack } from "@/components/AppBack";

/**
 * Every note that declares a historical `year` in its frontmatter (see
 * lib/content.ts's getTimeline()), oldest first, on a vertical line cut into
 * the four usual periods. Deliberately not a to-scale axis: history spans
 * millennia unevenly, and a note is either from -3000 or from 1950 with
 * nothing readable in between at any sane page height. A period's length
 * shows instead as a short bar under its dates (square-root scale, so a
 * decade still shows next to a millennium).
 */
const ERAS = [
  { id: "antiquite", key: "frise.eraAncient", until: 476 },
  { id: "moyen-age", key: "frise.eraMedieval", until: 1492 },
  { id: "moderne", key: "frise.eraModern", until: 1789 },
  { id: "contemporaine", key: "frise.eraContemporary", until: Infinity },
] as const;

/** A span this long or more fills the bar. */
const FULL_SPAN = 1000;

export function Frise({ entries, before }: { entries: TimelineEntry[]; before?: ReactNode }) {
  const eras = ERAS.map((era, i) => ({
    ...era,
    entries: entries.filter(
      (e) => e.year < era.until && (i === 0 || e.year >= ERAS[i - 1].until),
    ),
  })).filter((era) => era.entries.length > 0);
  return (
    <main className="frise-page">
      <AppBack href="/notes/" labelKey="tabbar.notes" />
      <a href="/" className="old-back frise-back">
        ← {t("nav.home")}
      </a>
      <h1 className="frise-title" {...attrs(i18nAttrs("frise.title"))}>
        {t("frise.title")}
      </h1>
      <p className="frise-intro" {...attrs(i18nAttrs("frise.intro"))}>
        {t("frise.intro")}
      </p>
      {/* The population curve with the notes on it (FriseCourbe), when built. */}
      {before}

      {entries.length === 0 ? (
        <p className="frise-empty" {...attrs(i18nAttrs("frise.empty"))}>
          {t("frise.empty")}
        </p>
      ) : (
        <>
          <nav
            className="frise-eras"
            aria-label={t("frise.erasAria")}
            data-i18n-aria-label="frise.erasAria"
          >
            {eras.map((era) => (
              <a key={era.id} href={`#${era.id}`} className="frise-era-chip">
                <span {...attrs(i18nAttrs(era.key))}>{t(era.key)}</span>
                <span className="frise-era-n">{era.entries.length}</span>
              </a>
            ))}
          </nav>
          {eras.map((era) => (
            <section
              key={era.id}
              id={era.id}
              className="frise-era"
              aria-labelledby={`${era.id}-h`}
            >
              <h2
                id={`${era.id}-h`}
                className="frise-era-title"
                {...attrs(i18nAttrs(era.key))}
              >
                {t(era.key)}
              </h2>
              <ol className="frise-list">
                {era.entries.map((e) => {
                  const span = e.yearEnd !== undefined ? e.yearEnd - e.year : 0;
                  return (
                    <li key={e.href} className="frise-entry">
                      <span className="frise-year">
                        {formatYear(e.year)}
                        {e.yearEnd !== undefined && (
                          <>
                            –<wbr />
                            {formatYear(e.yearEnd)}
                          </>
                        )}
                        {span > 0 && (
                          <span
                            className="frise-span"
                            style={{
                              width: `${Math.max(6, Math.min(100, Math.sqrt(span / FULL_SPAN) * 100)).toFixed(0)}%`,
                            }}
                            title={t("frise.span", { n: span })}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <div className="frise-content">
                        <a href={e.href}>{bareTitle(e.title)}</a>
                        {e.period && (
                          <span className="frise-period">{e.period}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </>
      )}
    </main>
  );
}

function formatYear(year: number): string {
  return year < 0 ? t("frise.bce", { year: Math.abs(year) }) : String(year);
}

/** "La Révolution française (1789-1799)" → "La Révolution française": the
 *  dates are already in the column on the left. */
export function bareTitle(title: string): string {
  return title.replace(/\s*\([^()]*\d{3,4}[^()]*\)\s*$/, "") || title;
}

// lib/i18n's helpers emit attribute *strings* for the HTML-string builders in
// lib/html.ts; in JSX they have to come back as a props object (see
// components/RecentNotes.tsx, same pattern).
function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
