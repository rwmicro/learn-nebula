import { t, i18nProps, i18nAttrProps, disciplineKey, keyedProps, keyedText, levelNameKey, pathDescKey, pathName, pathNameProps, type I18nVars } from "@/lib/i18n";
import type { ReadingPathView } from "@/lib/node/content";
import { paintingKey, paintingText, type Painting } from "@/lib/paintings";
import { srcSet } from "@/lib/responsive-image";
import { splitMinutes } from "@/lib/client/path-study";
import { roman, splitTranslation } from "@/lib/path-titles";

// The path page from 1100px (parcours-detail-desk.css shows these and hides
// the phone/tablet cover): the title beside the path's picture framed with
// its museum label, then a row of the levels (ParcoursLevelsDesk picks the
// one shown below it and keeps the row in step with the reader's progress).
// Phones and tablets never see any of this.

/** A note title, its bracketed translation wrapped so the desktop page can
 *  set it apart (italic, without the brackets); the text stays the same
 *  everywhere else. */
export function NoteTitle({ title }: { title: string }) {
  const parts = splitTranslation(title);
  if (!parts) return <>{title}</>;
  return (
    <>
      {parts[0]}
      <span className="pdd-tr">
        {" "}
        <span className="pdd-p">(</span>
        {parts[1]}
        <span className="pdd-p">)</span>
      </span>
    </>
  );
}

function Minutes({ minutes }: { minutes: number }) {
  const { h, m } = splitMinutes(minutes);
  const [key, vars] = h
    ? (["parcours.hm", { h: String(h), mm: String(m).padStart(2, "0") }] as const)
    : (["parcours.min", { m: String(m) }] as const);
  return <span {...i18nProps(key, vars)}>{t(key, vars)}</span>;
}

export function DeskHead({ path, art }: { path: ReadingPathView; art: Painting }) {
  const sub = pathName(path, "sub");
  const dKey = path.discipline ? disciplineKey(path.discipline) : null;
  return (
    <header className="pdd-head">
      <div className="pdd-head-tx">
        {path.discipline && (
          <p className="pdd-kicker">
            {dKey ? <span {...i18nProps(dKey)}>{t(dKey)}</span> : path.discipline}
          </p>
        )}
        <h1 className="pdd-title">
          <span {...pathNameProps(path, "title")}>{pathName(path, "title")}</span>
          {sub && (
            <em {...pathNameProps(path, "sub")}>{sub}</em>
          )}
        </h1>
        {path.description && (
          <p className="pdd-desc" {...keyedProps(pathDescKey(path.slug, path.description))}>
            {keyedText(pathDescKey(path.slug, path.description), path.description)}
          </p>
        )}
      </div>
      <figure className="pdd-fig">
        <div className="pdd-frame">
          {/* Above the fold: fetched first and decoded with the paint that
              shows it, never a frame with an empty frame (async decoding
              let the visual test catch it blank). */}
          <picture>
            <source type="image/avif" srcSet={srcSet(art.src, "avif")} sizes="400px" />
            <img
              src={`${art.src}.webp`}
              srcSet={srcSet(art.src, "webp")}
              sizes="400px"
              alt=""
              fetchPriority="high"
              style={{ objectPosition: `${art.focus} 50%` }}
            />
          </picture>
        </div>
        <figcaption>
          <ArtCaption art={art} />
        </figcaption>
      </figure>
    </header>
  );
}

export interface DeskLevel {
  n: number;
  name: string;
  count: number;
  minutes: number;
}

const CHECK = (
  <svg className="pdd-check" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The levels in a row: a disc per level (its numeral, a check once done, a
 *  ring of progress on the current one), its name and "3/7 · 22 min". From
 *  nine levels on, only the shown level and its neighbours keep their name
 *  (ParcoursLevelsDesk), the others shrink to a numbered dot. */
export function DeskFrise({ levels }: { levels: DeskLevel[] }) {
  return (
    <nav
      className={levels.length > 8 ? "pdd-frise is-many" : "pdd-frise"}
      data-pdd-frise
      aria-label={t("parcours.levelsAria")}
      {...i18nAttrProps("aria-label", "parcours.levelsAria")}
    >
      {levels.map((lv, i) => (
        <span key={lv.n} className="pdd-step">
          {i > 0 && <i className="pdd-ln" aria-hidden="true" />}
          <button
            type="button"
            className="pdd-st"
            data-pdd-stop={lv.n}
            title={keyedText(levelNameKey(lv.name), lv.name)}
            {...(levelNameKey(lv.name) ? i18nAttrProps("title", levelNameKey(lv.name)!) : {})}
          >
            <span className="pdd-c" aria-hidden="true">
              <span className="pdd-num">{roman(lv.n)}</span>
              {CHECK}
              <svg className="pdd-ring" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="25" pathLength={100} />
              </svg>
            </span>
            <span className="pdd-name" {...keyedProps(levelNameKey(lv.name))}>{keyedText(levelNameKey(lv.name), lv.name)}</span>
            <span className="pdd-meta">
              <span data-pdd-count>0/{lv.count}</span> · <Minutes minutes={lv.minutes} />
            </span>
          </button>
        </span>
      ))}
    </nav>
  );
}

/** What goes in a level's header on the desktop: "Niveau II sur VII", its
 *  name, and the arrows to the levels around it. */
export function DeskLevelHead({ n, total, name }: { n: number; total: number; name: string }) {
  const vars: I18nVars = { n: roman(n), total: roman(total) };
  return (
    <>
      <span className="pdd-lv-k" {...i18nProps("parcours.levelOf", vars)}>
        {t("parcours.levelOf", vars)}
      </span>
      <span className="pdd-lv-name" {...keyedProps(levelNameKey(name))}>{keyedText(levelNameKey(name), name)}</span>
      <span className="pdd-lv-nav">
        <button
          type="button"
          data-pdd-nav="-1"
          aria-label={t("parcours.prevLevel")}
          {...i18nAttrProps("aria-label", "parcours.prevLevel")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button
          type="button"
          data-pdd-nav="1"
          aria-label={t("parcours.nextLevel")}
          {...i18nAttrProps("aria-label", "parcours.nextLevel")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </span>
    </>
  );
}

/** A picture's caption: its title in bold, then who made it and the note,
 *  each part following the locale (lib/paintings.ts). */
export function ArtCaption({ art }: { art: Painting }) {
  return (
    <>
      <b {...keyedProps(paintingKey(art, "title"))}>{paintingText(art, "title")}</b>
      {art.by && `${art.by}${art.note ? ", " : ""}`}
      {art.note && <span {...keyedProps(paintingKey(art, "note"))}>{paintingText(art, "note")}</span>}
    </>
  );
}
