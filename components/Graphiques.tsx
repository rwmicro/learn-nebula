import { formatDateLong } from "@/lib/content";
import { t, i18nAttrs } from "@/lib/i18n";
import type { Graphique } from "@/lib/graphiques";

/**
 * Home: the latest "un graphique, trois paragraphes" notes (lib/graphiques.ts),
 * a title and the first sentence each, and their RSS feed. Absent while the
 * vault has none.
 */
export function Graphiques({ items }: { items: Graphique[] }) {
  if (!items.length) return null;
  return (
    <section className="graphiques" data-pagefind-ignore>
      <h2 className="graphiques-title" {...attrs(i18nAttrs("graphiques.title"))}>
        {t("graphiques.title")}
      </h2>
      <ul className="graphiques-list">
        {items.map((g) => (
          <li key={g.href}>
            <a href={g.href} className="graphiques-link">
              {g.title}
            </a>
            <p className="graphiques-lede">{g.lede}</p>
            <time dateTime={g.at.toISOString()} data-i18n-date>
              {formatDateLong(g.at)}
            </time>
          </li>
        ))}
      </ul>
      <a href="/graphiques.xml" className="graphiques-rss" {...attrs(i18nAttrs("graphiques.rss"))}>
        {t("graphiques.rss")}
      </a>
    </section>
  );
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
