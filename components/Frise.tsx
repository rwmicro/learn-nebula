import { t, i18nAttrs } from "@/lib/i18n";
import type { TimelineEntry } from "@/lib/content";

/**
 * A flat chronological list, oldest first, of every note that declares a
 * historical `year` in its frontmatter (see lib/content.ts's getTimeline()).
 * Deliberately not a to-scale axis: history spans millennia unevenly, and a
 * note is either from -3000 or from 1950 with nothing readable in between at
 * any sane page height. A dense list with a hairline rule reads better here
 * than a mostly-empty line with a few dots on it.
 */
export function Frise({ entries }: { entries: TimelineEntry[] }) {
  return (
    <main className="frise-page">
      <a href="/" className="frise-back">
        ← {t("nav.home")}
      </a>
      <h1 className="frise-title" {...attrs(i18nAttrs("frise.title"))}>
        {t("frise.title")}
      </h1>
      <p className="frise-intro" {...attrs(i18nAttrs("frise.intro"))}>
        {t("frise.intro")}
      </p>

      {entries.length === 0 ? (
        <p className="frise-empty" {...attrs(i18nAttrs("frise.empty"))}>
          {t("frise.empty")}
        </p>
      ) : (
        <ol className="frise-list">
          {entries.map((e) => (
            <li key={e.href} className="frise-entry">
              <span className="frise-year">
                {formatYear(e.year)}
                {e.yearEnd !== undefined ? `–${formatYear(e.yearEnd)}` : ""}
              </span>
              <div className="frise-content">
                <a href={e.href}>{e.title}</a>
                {e.period && <span className="frise-period">{e.period}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

function formatYear(year: number): string {
  return year < 0 ? t("frise.bce", { year: Math.abs(year) }) : String(year);
}

// lib/i18n's helpers emit attribute *strings* for the HTML-string builders in
// lib/html.ts; in JSX they have to come back as a props object (see
// components/RecentNotes.tsx, same pattern).
function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
