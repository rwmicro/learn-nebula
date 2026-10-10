import { formatDateLong, type RecentNote } from "@/lib/content";
import { t, i18nAttrs, i18nAttr } from "@/lib/i18n";

/**
 * "Latest growth" on the home page: the handful of notes most recently planted
 * or re-tended. The garden isn't browsed reverse-chronologically, so this is
 * deliberately short — a way back into what is currently being worked on, not
 * an index. Readers who want to follow along get the longer list (same
 * getRecentNotes() ranking) from the RSS feed, app/feed.xml. Rendered on the server (no client JS): the dates carry
 * `data-i18n-date` so /js/i18n.js reformats them on a locale switch, like
 * every other date on the site.
 */
export function RecentNotes({ notes }: { notes: RecentNote[] }) {
  if (!notes.length) return null;
  return (
    <section className="recent-notes" data-pagefind-ignore>
      <h2 className="recent-notes-title" {...i18nDataAttrs("home.recentTitle")}>
        {t("home.recentTitle")}
      </h2>
      <ul className="recent-notes-list">
        {notes.map((n) => {
          const key = n.tended ? "home.recentTended" : "home.recentPlanted";
          return (
            <li key={n.href}>
              <a href={n.href}>{n.title}</a>
              <span className="recent-meta">
                {n.stage && (
                  <span
                    className={`growth-stage growth-${n.stage}`}
                    {...attrs(i18nAttr("title", "growth.stageAria"))}
                    title={t("growth.stageAria")}
                  >
                    <span className="growth-dot" aria-hidden="true" />
                    <span {...i18nDataAttrs(`growth.${n.stage}`)}>
                      {t(`growth.${n.stage}`)}
                    </span>
                  </span>
                )}
                <span {...i18nDataAttrs(key)}>{t(key)}</span>{" "}
                <time dateTime={n.at.toISOString()} data-i18n-date>
                  {formatDateLong(n.at)}
                </time>
              </span>
            </li>
          );
        })}
      </ul>
      <a href="/jardin/" className="recent-notes-more">
        <span {...i18nDataAttrs("home.recentStats")}>{t("home.recentStats")}</span> →
      </a>
    </section>
  );
}

// lib/i18n's helpers emit attribute *strings* for the HTML-string builders in
// lib/html.ts; in JSX they have to come back as a props object.
function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function i18nDataAttrs(key: string): Record<string, string> {
  return attrs(i18nAttrs(key));
}
