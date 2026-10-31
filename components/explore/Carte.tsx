import { t, i18nProps } from "@/lib/i18n";
import { CARTE_BINS, carteClass, WORLD, type CarteCountry } from "@/lib/carte";
import { CarteHover } from "@/components/explore/CarteHover";
import { AppBack } from "@/components/layout/AppBack";
import { COUNTRIES } from "@/lib/countries";
import { REGION_ORDER, regionOf, type Region } from "@/lib/regions";
import type { CSSProperties } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

const ISO2 = new Map(COUNTRIES.map(([iso3, iso2]) => [iso3, iso2]));

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
  // Phones sort the list three ways (carte.css, radios + CSS order): by notes
  // (the DOM order), by name, by continent with a heading per continent.
  const byName = new Map(
    [...countries]
      .sort((a, b) => a.name.localeCompare(b.name, "fr"))
      .map((c, i) => [c.iso3, i] as const),
  );
  const regionRank = (r: Region | null) => (r ? REGION_ORDER.indexOf(r) : REGION_ORDER.length);
  const regionOfC = (c: CarteCountry) => regionOf(ISO2.get(c.iso3) ?? "");
  const regions = [...new Set(countries.map(regionOfC))].sort((a, b) => regionRank(a) - regionRank(b));
  return (
    <main className="carte-page">
      <PageHeader
        name="carte"
        back={{ href: "/notes/", labelKey: "tabbar.notes" }}
        title={t("carte.title")}
        titleProps={i18nProps("carte.title")}
        intro={t("carte.intro", { n: countries.length, notes: total })}
        introProps={i18nProps("carte.intro", { n: countries.length, notes: total })}
      />

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
            <span className="carte-legend-unit" {...i18nProps("carte.legendUnit")}>
              {t("carte.legendUnit")}
            </span>
          </span>
          <span className="carte-source" {...i18nProps("carte.source")}>
            {t("carte.source")}
          </span>
        </figcaption>
      </figure>

      <h2 className="carte-list-title" {...i18nProps("carte.listTitle")}>
        {t("carte.listTitle")}
      </h2>
      <input type="radio" name="carte-sort" id="carte-s-notes" className="carte-radio" defaultChecked />
      <input type="radio" name="carte-sort" id="carte-s-name" className="carte-radio" />
      <input type="radio" name="carte-sort" id="carte-s-region" className="carte-radio" />
      <div className="carte-sort" role="group" aria-label={t("carte.sortAria")} data-i18n-aria-label="carte.sortAria">
        {(["notes", "name", "region"] as const).map((k) => (
          <label key={k} htmlFor={`carte-s-${k}`} {...i18nProps(`carte.sort_${k}`)}>
            {t(`carte.sort_${k}`)}
          </label>
        ))}
      </div>
      <ul className="carte-list">
        {regions.map((r) => (
          <li
            key={`region-${r ?? "none"}`}
            className="carte-region"
            aria-hidden="true"
            style={{ "--o-region": regionRank(r) * 1000 } as CSSProperties}
            {...i18nProps(`carte.region_${r ?? "other"}`)}
          >
            {t(`carte.region_${r ?? "other"}`)}
          </li>
        ))}
        {countries.map((c, i) => (
          <li
            key={c.iso3}
            style={
              {
                "--o-name": byName.get(c.iso3),
                "--o-region": regionRank(regionOfC(c)) * 1000 + 1 + i,
              } as CSSProperties
            }
          >
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
                    <span className="carte-kind" {...i18nProps(`carte.kind_${n.kind}`)}>
                      {t(`carte.kind_${n.kind}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <p className="carte-how" {...i18nProps("carte.how")}>
        {t("carte.how")}
      </p>
      <CarteHover />
    </main>
  );
}

