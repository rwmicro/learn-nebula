import { t, folderKey, i18nProps } from "@/lib/i18n";
import { familyOfFolder } from "@/lib/path-family";
import { Fragment, type ReactNode } from "react";
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
  { id: "antiquite", key: "frise.eraAncient", short: "frise.eraAncientShort", until: 476 },
  { id: "moyen-age", key: "frise.eraMedieval", short: "frise.eraMedievalShort", until: 1492 },
  { id: "moderne", key: "frise.eraModern", short: "frise.eraModernShort", until: 1789 },
  { id: "contemporaine", key: "frise.eraContemporary", short: "frise.eraContemporaryShort", until: Infinity },
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
      <h1 className="frise-title" {...i18nProps("frise.title")}>
        {t("frise.title")}
      </h1>
      <p className="frise-intro" {...i18nProps("frise.intro")}>
        {t("frise.intro")}
      </p>
      <p className="frise-count" {...i18nProps("frise.count", { n: entries.length })}>
        {t("frise.count", { n: entries.length })}
      </p>
      {/* The population curve with the notes on it (FriseCourbe), when
          built. Phones move it under the list (frise.css). */}
      {before && <div className="frise-curve-slot">{before}</div>}

      {entries.length === 0 ? (
        <p className="frise-empty" {...i18nProps("frise.empty")}>
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
                <span {...i18nProps(era.key)}>{t(era.key)}</span>
                <span className="frise-era-n">{era.entries.length}</span>
              </a>
            ))}
          </nav>
          {/* Phones: the periods filter the list instead of jumping to it.
              Plain radios, so it works without JS (frise.css :has rules). */}
          <input type="radio" name="frise-era" id="frise-f-all" className="frise-radio" defaultChecked />
          {eras.map((era) => (
            <input key={era.id} type="radio" name="frise-era" id={`frise-f-${era.id}`} className="frise-radio" />
          ))}
          <div className="frise-filter" role="group" aria-label={t("frise.erasAria")} data-i18n-aria-label="frise.erasAria">
            <label htmlFor="frise-f-all">
              <span {...i18nProps("frise.all")}>{t("frise.all")}</span>
              <span className="frise-era-n">{entries.length}</span>
            </label>
            {eras.map((era) => (
              <label key={era.id} htmlFor={`frise-f-${era.id}`}>
                <span {...i18nProps(era.short)}>{t(era.short)}</span>
                <span className="frise-era-n">{era.entries.length}</span>
              </label>
            ))}
          </div>
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
                {...i18nProps(era.key)}
              >
                {t(era.key)}
              </h2>
              <ol className="frise-list">
                {era.entries.map((e, i) => {
                  const span = e.yearEnd !== undefined ? e.yearEnd - e.year : 0;
                  const c = century(e.year);
                  const newCentury = i === 0 || century(era.entries[i - 1].year).key !== c.key;
                  const dk = e.discipline ? folderKey(e.discipline) : null;
                  const fam = e.discipline ? familyOfFolder(`x/${e.discipline}`) : null;
                  const spanPct = Math.max(6, Math.min(100, Math.sqrt(span / FULL_SPAN) * 100)).toFixed(0);
                  return (
                    <Fragment key={e.href}>
                    {/* Phones: a heading per century (hidden from 640px). */}
                    {newCentury && (
                      <li className="frise-century" aria-hidden="true" {...i18nProps(c.key, c.vars)}>
                        {t(c.key, c.vars)}
                      </li>
                    )}
                    <li className="frise-entry" data-family={fam ?? undefined}>
                      <span className="frise-start" aria-hidden="true">
                        {Math.abs(e.year)}
                        {e.year < 0 && <small {...i18nProps("frise.bceShort")}>{t("frise.bceShort")}</small>}
                      </span>
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
                        {/* Phones: "Histoire · 1760 – 1840" and the length bar. */}
                        <span className="frise-meta">
                          {dk && (
                            <>
                              <span {...i18nProps(dk)}>{t(dk)}</span>
                              {" · "}
                            </>
                          )}
                          {e.yearEnd !== undefined
                            ? `${formatYear(e.year)} – ${formatYear(e.yearEnd)}`
                            : (e.period ?? formatYear(e.year))}
                        </span>
                        {span > 0 && (
                          <span className="frise-bar" aria-hidden="true">
                            <span style={{ width: `${spanPct}%` }} />
                          </span>
                        )}
                      </div>
                    </li>
                    </Fragment>
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

/** The century (or, before 1000 BCE, the millennium) a year falls in, as
 *  an i18n key and its vars: "XVIIIe siècle", "IIe millénaire av. J.-C.". */
function century(year: number): { key: string; vars: Record<string, string | number> } {
  if (year <= -1000) {
    const n = Math.floor((-year - 1) / 1000) + 1;
    return { key: "frise.millenniumBce", vars: { r: roman(n), n } };
  }
  if (year <= 0) {
    const n = Math.floor(-year / 100) + 1;
    return { key: n === 1 ? "frise.centuryOneBce" : "frise.centuryBce", vars: { r: roman(n), n } };
  }
  const n = Math.floor((year - 1) / 100) + 1;
  return { key: n === 1 ? "frise.centuryOne" : "frise.century", vars: { r: roman(n), n } };
}

function roman(n: number): string {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, r] of table) while (n >= v) { out += r; n -= v; }
  return out;
}

function formatYear(year: number): string {
  return year < 0 ? t("frise.bce", { year: Math.abs(year) }) : String(year);
}

/** "La Révolution française (1789-1799)" → "La Révolution française", and
 *  "L'Empire russe (XVIIIe–XIXe siècle)" → "L'Empire russe": the dates are
 *  already in the column on the left. */
export function bareTitle(title: string): string {
  return title.replace(/\s*\((?:[^()]*\d{3,4}[^()]*|[^()]*\bsi[eè]cles?\b[^()]*)\)\s*$/i, "") || title;
}

