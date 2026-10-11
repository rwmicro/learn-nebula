import { t, i18nAttrs } from "@/lib/i18n";
import { CARTE_BINS, carteClass, WORLD, type CarteCountry } from "@/lib/carte";
import { CarteHover } from "@/components/CarteHover";

/**
 * /carte/: the world, each country shaded by how many notes of the garden
 * are about it (lib/carte.ts), drawn at build from a pre-projected map. A
 * country with notes is a link to its entry in the list under the map, which
 * is also the map's table view: no JavaScript is needed to read it. The
 * tooltip and the opening of the entry are CarteHover's.
 */
export function Carte({ countries }: { countries: CarteCountry[] }) {
  const byId = new Map(countries.map((c) => [c.id, c]));
  const total = new Set(countries.flatMap((c) => c.notes.map((n) => n.href))).size;
  return (
    <main className="carte-page">
      <a href="/" className="carte-back">
        ← {t("nav.home")}
      </a>
      <h1 className="carte-title" {...attrs(i18nAttrs("carte.title"))}>
        {t("carte.title")}
      </h1>
      <p className="carte-intro" {...attrs(i18nAttrs("carte.intro", { n: countries.length, notes: total }))}>
        {t("carte.intro", { n: countries.length, notes: total })}
      </p>

      <figure className="carte-figure">
        <div className="carte-map-wrap">
          <svg
            className="carte-map"
            viewBox={`0 0 ${WORLD.width} ${WORLD.height}`}
            role="img"
            aria-label={t("carte.mapAria")}
            data-i18n-aria-label="carte.mapAria"
          >
            {WORLD.countries.map((g) => {
              const c = byId.get(g.id);
              if (!c) return <path key={g.id} d={g.d} className="carte-land" />;
              return (
                <a key={g.id} href={`#pays-${c.iso3}`} aria-label={`${c.name} : ${c.notes.length}`}>
                  <path
                    d={g.d}
                    className={`carte-land carte-c${carteClass(c.notes.length)}`}
                    data-name={c.name}
                    data-n={c.notes.length}
                  />
                </a>
              );
            })}
          </svg>
        </div>
        <figcaption className="carte-caption">
          <span className="carte-legend" aria-hidden="true">
            {CARTE_BINS.map((b, i) => (
              <span key={b} className="carte-legend-item">
                <i className={`carte-c${i}`} />
                {i < CARTE_BINS.length - 1 ? `${b}–${CARTE_BINS[i + 1] - 1}` : `${b}+`}
              </span>
            ))}
            <span className="carte-legend-unit" {...attrs(i18nAttrs("carte.legendUnit"))}>
              {t("carte.legendUnit")}
            </span>
          </span>
          <span className="carte-source" {...attrs(i18nAttrs("carte.source"))}>
            {t("carte.source")}
          </span>
        </figcaption>
      </figure>

      <h2 className="carte-list-title" {...attrs(i18nAttrs("carte.listTitle"))}>
        {t("carte.listTitle")}
      </h2>
      <ul className="carte-list">
        {countries.map((c) => (
          <li key={c.iso3}>
            <details id={`pays-${c.iso3}`} className="carte-country">
              <summary>
                <span className="carte-country-name">{c.name}</span>
                <span className="carte-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(2, (100 * c.notes.length) / countries[0].notes.length).toFixed(1)}%` }} />
                </span>
                <span className="carte-country-n">{c.notes.length}</span>
              </summary>
              <ul className="carte-notes">
                {c.notes.map((n) => (
                  <li key={n.href}>
                    <a href={n.href}>{n.title}</a>
                    <span className="carte-kind" {...attrs(i18nAttrs(`carte.kind_${n.kind}`))}>
                      {t(`carte.kind_${n.kind}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <p className="carte-how" {...attrs(i18nAttrs("carte.how"))}>
        {t("carte.how")}
      </p>
      <CarteHover />
    </main>
  );
}

// lib/i18n's helpers emit attribute strings for the HTML-string builders; in
// JSX they come back as a props object (same as components/Frise.tsx).
function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2].replace(/&quot;/g, '"');
  return out;
}
