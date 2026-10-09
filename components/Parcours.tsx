import { t, i18nAttrs, disciplineKey } from "@/lib/i18n";
import { OfflinePath } from "@/components/OfflinePath";
import type { ReadingPathView } from "@/lib/content";
import {
  edgePath,
  layoutPrereqGraph,
  type GraphLayout,
} from "@/lib/prereq-layout";
import { ReadMarks } from "@/components/ReadMarks";
import { PathZoom } from "@/components/PathZoom";
import { ParcoursStudy, type StudyNoteView } from "@/components/ParcoursStudy";
import type { PathExtras } from "@/lib/path-extras";
import { PATH_FAMILIES, pathFamily, type PathFamily } from "@/lib/path-family";
import { ParcoursBrowse, type BrowsePath } from "@/components/ParcoursBrowse";
import { fold } from "@/lib/palette-match";
import { prereqsToShow, shortNoteTitles } from "@/lib/path-titles";
import { splitMinutes } from "@/lib/path-study";
import { pathLevels } from "@/lib/path-levels";

/**
 * /parcours/ (an index of reading paths, one card each) and /parcours/<slug>/
 * (one path as a top-down prerequisite graph). Both are static: the graph is
 * laid out at build time (lib/prereq-layout.ts) into an inline SVG, and
 * <ReadMarks> only toggles read / next-to-read classes from localStorage.
 */

export function ParcoursIndex({
  paths,
  extras,
}: {
  paths: ReadingPathView[];
  /** Per path slug: reading times and quiz ids (for the "maîtrisées" count). */
  extras: Record<string, PathExtras>;
}) {
  // One section per colour family (sciences, informatique, vivant…), not per
  // discipline: most disciplines hold a single path, and 22 headings of one
  // card each made a very long page. The discipline moves onto the card.
  // Within a family, paths keep their discipline grouping (stable order).
  const disciplineOrder = [...new Set(paths.map((p) => p.discipline))];
  const byDiscipline = (a: ReadingPathView, b: ReadingPathView) =>
    disciplineOrder.indexOf(a.discipline) - disciplineOrder.indexOf(b.discipline);
  const families: [PathFamily | null, ReadingPathView[]][] = [
    ...PATH_FAMILIES,
    null,
  ]
    .map((f): [PathFamily | null, ReadingPathView[]] => [
      f,
      paths.filter((p) => pathFamily(p.discipline) === f).sort(byDiscipline),
    ])
    .filter(([, list]) => list.length > 0);
  const browse: BrowsePath[] = paths.map((p) => ({
    slug: p.slug,
    name: splitName(p.name)[0],
    family: pathFamily(p.discipline),
    notes: p.notes.map((n) => [n.slug, n.title]),
  }));
  return (
    <main id="main" className="themes-page parcours-page">
      <Back href="/" labelKey="nav.home" />
      <h1 className="themes-title" {...attrs(i18nAttrs("parcours.title"))}>
        {t("parcours.title")}
      </h1>
      <p className="themes-intro" {...attrs(i18nAttrs("parcours.intro"))}>
        {t("parcours.intro")}
      </p>
      {paths.length === 0 && (
        <p className="themes-intro" {...attrs(i18nAttrs("parcours.empty"))}>
          {t("parcours.empty")}
        </p>
      )}
      {paths.length > 0 && (
        <ParcoursBrowse
          paths={browse}
          families={families.map(([f, list]) => ({ id: f, count: list.length }))}
        />
      )}
      {families.map(([family, list]) => {
        // The discipline goes on each card only when the family mixes several.
        const mixed = new Set(list.map((p) => p.discipline)).size > 1;
        const tiles = list.filter((p) => TILE_DISCIPLINES.has(p.discipline));
        const cards = list.filter((p) => !TILE_DISCIPLINES.has(p.discipline));
        const label = family ? `parcours.family.${family}` : "parcours.other";
        return (
          <section
            key={family ?? "_"}
            className="parcours-family"
            data-family={family ?? undefined}
            data-path-family
          >
            <h2 className="themes-h2">
              <span {...attrs(i18nAttrs(label))}>{t(label)}</span>
              <span
                className="parcours-family-count"
                {...attrs(i18nAttrs(countKey(list.length), { n: list.length }))}
              >
                {t(countKey(list.length), { n: list.length })}
              </span>
            </h2>
            {tiles.length > 0 && (
              <div className="parcours-tiles-block" data-path-block>
                <p className="parcours-tiles-intro" {...attrs(i18nAttrs("parcours.langIntro"))}>
                  {t("parcours.langIntro")}
                </p>
                <ul className="parcours-tiles">
                  {[...tiles]
                    .sort((a, b) => splitName(a.name)[0].localeCompare(splitName(b.name)[0], "fr"))
                    .map((p) => (
                      <li
                        key={p.slug}
                        className="parcours-tile"
                        data-read-group
                        data-path-card
                        data-search={searchText(p)}
                      >
                        <a href={`/parcours/${p.slug}/`} className="parcours-tile-link" title={p.name}>
                          <span className="parcours-tile-name">{splitName(p.name)[0]}</span>
                          <Progress
                            slugs={p.notes.map((n) => n.slug)}
                            total={p.notes.length}
                            extras={extras[p.slug]}
                          />
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {cards.length > 0 && (
              <div className="parcours-cards-block" data-path-block>
                {tiles.length > 0 && (
                  <p className="parcours-cards-label" {...attrs(i18nAttrs("parcours.langAround"))}>
                    {t("parcours.langAround")}
                  </p>
                )}
                <ul className="parcours-cards">
                  {cards.map((p) => {
                    const [title, sub] = splitName(p.name);
                    return (
                      <li
                        key={p.slug}
                        className="parcours-card"
                        data-read-group
                        data-path-card
                        data-search={searchText(p)}
                      >
                        <a href={`/parcours/${p.slug}/`} className="parcours-card-link">
                          {(mixed || !family) && p.discipline && (
                            <span className="parcours-card-kicker">
                              <DisciplineName name={p.discipline} />
                            </span>
                          )}
                          <span className="parcours-card-title">{title}</span>
                          {sub && <span className="parcours-card-sub">{sub}</span>}
                          {p.description && (
                            <span className="parcours-card-desc">{p.description}</span>
                          )}
                          {/* Paths that follow one another (`suite:`): the
                              link both ways, as one quiet line. */}
                          {(p.prev || p.next) && (
                            <span className="parcours-card-chain">
                              {p.prev && (
                                <span {...attrs(i18nAttrs("parcours.followsFrom", { name: splitName(p.prev.name)[0] }))}>
                                  {t("parcours.followsFrom", { name: splitName(p.prev.name)[0] })}
                                </span>
                              )}
                              {p.prev && p.next && " · "}
                              {p.next && (
                                <span {...attrs(i18nAttrs("parcours.followedBy", { name: splitName(p.next.name)[0] }))}>
                                  {t("parcours.followedBy", { name: splitName(p.next.name)[0] })}
                                </span>
                              )}
                              {p.next && <span aria-hidden="true"> →</span>}
                            </span>
                          )}
                          <Progress
                            slugs={p.notes.map((n) => n.slug)}
                            total={p.notes.length}
                            extras={extras[p.slug]}
                          />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        );
      })}
      <p className="parcours-privacy" {...attrs(i18nAttrs("reading.privacy"))}>
        {t("reading.privacy")}
      </p>
      <ReadMarks />
    </main>
  );
}

/** Disciplines whose paths share one shape ("<Langue> : des premiers mots à
 *  la culture"): shown as small tiles under one shared line, not as cards. */
const TILE_DISCIPLINES = new Set(["Languages & Dialects"]);

const countKey = (n: number) => (n === 1 ? "parcours.familyCountOne" : "parcours.familyCount");

/** "Physique : du lycée à la prépa" → ["Physique", "du lycée à la prépa"]. */
function splitName(name: string): [string, string] {
  const i = name.indexOf(" : ");
  return i > 0 ? [name.slice(0, i), name.slice(i + 3)] : [name, ""];
}

/** What the index filter matches against: the path's name, its discipline
 *  (folder and French name) and its notes' titles, folded like the query. */
function searchText(p: ReadingPathView): string {
  const key = disciplineKey(p.discipline);
  return fold(
    [p.name, p.discipline, key ? t(key) : "", ...p.notes.map((n) => n.title)].join(" "),
  );
}

export function ParcoursPage({
  path,
  extras,
}: {
  path: ReadingPathView;
  extras: PathExtras;
}) {
  // " — Arabe Libanais" on every note of the Lebanese Arabic path is noise
  // here: the page shows the shorter titles (lib/path-titles.ts).
  const titles = shortNoteTitles(path.name, path.notes);
  const order = path.notes.map((n) => n.slug);
  const titleOf = (s: string) => titles.get(s) ?? s;
  const layout = layoutPrereqGraph(order, path.edges, titleOf);
  // Phones get a tighter drawing (narrower boxes, shorter lines) so most
  // paths fit a 390px screen; wider ones zoom and pan (PathZoom), opening on
  // the next note to read. CSS shows one or the other.
  const compact = layoutPrereqGraph(order, path.edges, titleOf, COMPACT);
  const minutesOf = (s: string) => extras.notes[s]?.minutes ?? 1;
  const study: StudyNoteView[] = path.notes.map((n) => ({
    slug: n.slug,
    title: titleOf(n.slug),
    href: n.href,
    prereqs: n.prereqs,
    minutes: minutesOf(n.slug),
    quiz: extras.notes[n.slug]?.quiz ?? [],
  }));
  const hasQuiz = new Set(study.filter((n) => n.quiz.length).map((n) => n.slug));
  const totalMinutes = study.reduce((sum, n) => sum + n.minutes, 0);
  const levels = pathLevels(path.notes);
  const figure = (
    <figure className="parcours-figure">
      <PathZoom label={t("parcours.graphAria")}>
        <ArrowDefs />
        <PathSvg path={path} layout={layout} variant="wide" quiz={hasQuiz} />
        <PathSvg
          path={path}
          layout={compact}
          variant="compact"
          lineH={15}
          quiz={hasQuiz}
        />
      </PathZoom>
      <figcaption className="parcours-legend" aria-hidden="true">
        {(
          [
            ["unread", "parcours.unread"],
            ["next", "parcours.nextShort"],
            ["read", "reading.read"],
            ["known", "parcours.known"],
            ["mastered", "parcours.mastered"],
            ["target", "parcours.targetBadge"],
          ] as const
        ).map(([k, key]) => (
          <span key={k} className="parcours-legend-item">
            <span className={`parcours-swatch parcours-swatch--${k}`} />
            <span {...attrs(i18nAttrs(key))}>{t(key)}</span>
          </span>
        ))}
        {hasQuiz.size > 0 && (
          <span className="parcours-legend-item">
            <span className="parcours-swatch parcours-swatch--quiz">?</span>
            <span {...attrs(i18nAttrs("parcours.quizMark"))}>{t("parcours.quizMark")}</span>
          </span>
        )}
      </figcaption>
      <p className="parcours-tip">
        <TargetIcon />
        <span {...attrs(i18nAttrs("parcours.targetTip"))}>{t("parcours.targetTip")}</span>
      </p>
    </figure>
  );
  return (
    <main
      id="main"
      className="themes-page parcours-page parcours-page--path"
      data-parcours
      data-path={path.slug}
      data-family={pathFamily(path.discipline) ?? undefined}
    >
      {/* Revision answers can hold KaTeX markup from the notes. */}
      {extras.items.some((i) => /katex/.test(i.q + i.a)) && (
        <link rel="stylesheet" href="/katex/katex.min.css" />
      )}
      <Back href="/parcours/" labelKey="parcours.title" />
      {path.discipline && (
        <p className="themes-kicker">
          <DisciplineName name={path.discipline} />
        </p>
      )}
      <h1 className="themes-title">{path.name}</h1>
      {path.description && (
        <p className="themes-intro parcours-desc">{path.description}</p>
      )}
      <div className="parcours-status" data-read-group>
        <span>
          <span {...attrs(i18nAttrs("parcours.count", { n: path.notes.length }))}>
            {t("parcours.count", { n: path.notes.length })}
          </span>
          {" · "}
          <Duration minutes={totalMinutes} approx />
          {levels.length > 1 && (
            <>
              {" · "}
              <span {...attrs(i18nAttrs("parcours.levels", { n: levels.length }))}>
                {t("parcours.levels", { n: levels.length })}
              </span>
            </>
          )}
        </span>
        <Progress
          slugs={path.notes.map((n) => n.slug)}
          total={path.notes.length}
          extras={extras}
        />
        <OfflinePath slug={path.slug} hrefs={path.notes.map((n) => n.href)} />
      </div>

      <ParcoursStudy
        pathSlug={path.slug}
        notes={study}
        items={extras.items}
        levels={levels.length > 1 ? levels.map((l) => path.notes.slice(l.from, l.to).map((n) => n.slug)) : []}
        nextPath={path.next ?? null}
      />

      {/* Text alternative to the graph, and the reading order on its own:
          a path of discs, cut into levels on a long path (lib/path-levels.ts),
          each closing on a review of its questions. */}
      {/* Level heads name the list on a long path; a short one keeps its title. */}
      <h2
        className={levels.length > 1 ? "visually-hidden" : "themes-h2"}
        {...attrs(i18nAttrs("parcours.order"))}
      >
        {t("parcours.order")}
      </h2>
      <div className="parcours-levels" data-levels={levels.length}>
        {levels.map((lv) => {
          const notes = path.notes.slice(lv.from, lv.to);
          const minutes = notes.reduce((sum, n) => sum + minutesOf(n.slug), 0);
          const quizCount = notes.reduce((sum, n) => sum + (extras.notes[n.slug]?.quiz.length ?? 0), 0);
          const list = (
            <ol className="parcours-order parcours-path" start={lv.from + 1}>
              {notes.map((n, k) => {
                const i = lv.from + k;
                return (
                  <OrderItem
                    key={n.slug}
                    n={n}
                    i={i}
                    title={titleOf(n.slug)}
                    minutes={minutesOf(n.slug)}
                    after={prereqsToShow(n.prereqs, i > 0 ? path.notes[i - 1].slug : null).map(titleOf)}
                  />
                );
              })}
              {quizCount > 0 && (
                <li className="parcours-review-stop" data-level-review={lv.n}>
                  <span className="parcours-disc parcours-disc--review" aria-hidden="true">
                    <span>★</span>
                  </span>
                  <button type="button" className="parcours-review-btn" data-level-review-btn={lv.n} disabled>
                    <span
                      className="parcours-review-name"
                      {...attrs(i18nAttrs(levels.length > 1 ? "parcours.levelReview" : "parcours.review", { n: lv.n }))}
                    >
                      {t(levels.length > 1 ? "parcours.levelReview" : "parcours.review", { n: lv.n })}
                    </span>
                    <span className="parcours-review-meta" data-level-review-meta>
                      {t("parcours.levelReviewLocked")}
                    </span>
                  </button>
                </li>
              )}
            </ol>
          );
          if (levels.length === 1) return <div key={lv.n}>{list}</div>;
          return (
            <details
              key={lv.n}
              className="parcours-level"
              data-level={lv.n}
              data-slugs={notes.map((n) => n.slug).join(" ")}
              open
            >
              <summary className="parcours-level-head">
                <span className="parcours-level-name" {...attrs(i18nAttrs("parcours.level", { n: lv.n }))}>
                  {t("parcours.level", { n: lv.n })}
                </span>
                <span
                  className="parcours-level-span"
                  {...attrs(
                    i18nAttrs("parcours.levelSpan", {
                      from: titleOf(notes[0].slug),
                      to: titleOf(notes[notes.length - 1].slug),
                    }),
                  )}
                >
                  {t("parcours.levelSpan", {
                    from: titleOf(notes[0].slug),
                    to: titleOf(notes[notes.length - 1].slug),
                  })}
                </span>
                <span className="parcours-level-meta">
                  <span className="parcours-level-done" data-level-done>
                    0/{notes.length}
                  </span>
                  {" · "}
                  <Duration minutes={minutes} approx />
                </span>
              </summary>
              {list}
            </details>
          );
        })}
      </div>
      {path.next && (
        <a className="parcours-next-path" href={`/parcours/${path.next.slug}/`}>
          <span className="parcours-next-path-k" {...attrs(i18nAttrs("parcours.nextPath"))}>
            {t("parcours.nextPath")}
          </span>
          <span className="parcours-next-path-name">{path.next.name}</span>
          <span className="parcours-next-path-meta">
            <span {...attrs(i18nAttrs("parcours.count", { n: path.next.count }))}>
              {t("parcours.count", { n: path.next.count })}
            </span>{" "}
            →
          </span>
        </a>
      )}
      {/* The graph of prerequisites, folded under the list: the levels are
          the way in, the graph the map for who wants it (and for aiming at
          a note, ◎). */}
      <details className="parcours-graph-fold">
        <summary {...attrs(i18nAttrs("parcours.graphAll"))}>{t("parcours.graphAll")}</summary>
        {figure}
      </details>

      <p className="parcours-privacy" {...attrs(i18nAttrs("reading.privacy"))}>
        {t("reading.privacy")}
      </p>
      <ReadMarks />
    </main>
  );
}

/** One note of the "Dans l'ordre" list: its disc (number, or a check once
 *  read — ParcoursStudy sets the state classes on the <li>), its link and
 *  time, and the two actions behind "⋯" on touch screens. */
function OrderItem({
  n,
  i,
  title,
  minutes,
  after,
}: {
  n: ReadingPathView["notes"][number];
  i: number;
  title: string;
  minutes: number;
  after: string[];
}) {
  return (
    <li data-slug={n.slug}>
      <span className="parcours-disc" aria-hidden="true">
        <span className="parcours-disc-n">{i + 1}</span>
      </span>
      <span className="parcours-li-main">
        <a href={n.href}>{title}</a>
        <span className="parcours-state" data-state-label hidden />
        {after.length > 0 && (
          <span className="parcours-after">
            <span {...attrs(i18nAttrs("parcours.after"))}>{t("parcours.after")}</span> {after.join(", ")}
          </span>
        )}
      </span>
      <span className="parcours-dur">
        <Duration minutes={minutes} />
      </span>
      {/* Touch screens: the two actions sit behind one "⋯" button. */}
      <button
        type="button"
        className="parcours-li-more"
        data-li-more
        aria-expanded="false"
        aria-label={`${t("parcours.liMore")} : ${title}`}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      <span className="parcours-li-acts">
        <button type="button" className="parcours-li-btn" data-act="target" data-slug={n.slug} aria-pressed="false">
          {t("parcours.targetThis")}
        </button>
        <button type="button" className="parcours-li-btn" data-act="known" data-slug={n.slug} aria-pressed="false">
          {t("parcours.know")}
        </button>
      </span>
    </li>
  );
}

/** A reading time, "8 min" or "5 h 20" ("≈ 5 h 20" for a total), swapped at
 *  runtime with the locale like the rest. */
function Duration({ minutes, approx = false }: { minutes: number; approx?: boolean }) {
  const { h, m } = splitMinutes(minutes);
  const [key, vars] = h
    ? (["parcours.hm", { h, mm: String(m).padStart(2, "0") }] as const)
    : (["parcours.min", { m }] as const);
  return (
    <>
      {approx && "≈ "}
      <span {...attrs(i18nAttrs(key, vars))}>{t(key, vars)}</span>
    </>
  );
}

function TargetIcon() {
  return (
    <svg className="parcours-target-icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8" />
      <circle cx="10" cy="10" r="4.5" />
      <circle cx="10" cy="10" r="1.6" className="dot" />
    </svg>
  );
}

const COMPACT = {
  nodeWidth: 140,
  nodeHeight: 50,
  gapX: 14,
  gapY: 34,
  lineChars: 17,
  padding: 10,
};

/** Arrowheads, shared by both drawings: kept in their own always-rendered
 *  (zero-size) SVG, since markers inside a display:none SVG don't paint. */
function ArrowDefs() {
  return (
    <svg
      className="pg-defs"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <marker
          id="pg-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,1 L9,5 L0,9 z" className="pg-arrowhead" />
        </marker>
        {/* Same head in the "read" colour (an edge leaving a read note); CSS
              swaps marker-end, since a marker can't inherit its edge's stroke. */}
        <marker
          id="pg-arrow-read"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M0,1 L9,5 L0,9 z"
            className="pg-arrowhead pg-arrowhead--read"
          />
        </marker>
      </defs>
    </svg>
  );
}

function PathSvg({
  path,
  layout,
  variant,
  lineH = 17,
  quiz,
}: {
  path: ReadingPathView;
  layout: GraphLayout;
  variant: "wide" | "compact";
  lineH?: number;
  /** Notes that have `[!quiz]` questions (a small "?" mark). */
  quiz: Set<string>;
}) {
  const prereqs = new Map(path.notes.map((n) => [n.slug, n.prereqs]));
  return (
    <svg
      className={`pg pg--${variant}`}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="pg-edges">
        {layout.edges.map((e) => (
          <path
            key={`${e.from}>${e.to}`}
            className="pg-edge"
            d={edgePath(e.points)}
            data-from={e.from}
            data-to={e.to}
          />
        ))}
      </g>
      <g className="pg-nodes">
        {layout.nodes.map((n) => {
          const cx = n.x + n.w / 2;
          const y0 = n.y + n.h / 2 - ((n.lines.length - 1) * lineH) / 2;
          return (
            // One group per note: the link (plain click opens the note) and,
            // beside it, two small buttons: "viser" (target, bottom right)
            // and "je connais déjà" (top left). Buttons can't nest in a
            // link, hence siblings; ParcoursStudy wires and labels them.
            <g key={n.slug} className="pg-item" data-slug={n.slug}>
              <a
                href={`/posts/${n.slug}/`}
                className="pg-node"
                data-slug={n.slug}
                data-prereqs={(prereqs.get(n.slug) ?? []).join(" ")}
                aria-label={n.title}
              >
                <title>{n.title}</title>
                <rect
                  className="pg-box"
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx="7"
                />
                <text
                  className="pg-label"
                  x={cx}
                  y={y0}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {n.lines.map((l, i) => (
                    <tspan key={i} x={cx} dy={i === 0 ? 0 : lineH}>
                      {l}
                    </tspan>
                  ))}
                </text>
                {quiz.has(n.slug) && (
                  <text className="pg-quiz" x={n.x + 7} y={n.y + n.h - 6} aria-hidden="true">
                    ?
                  </text>
                )}
                {/* State badge, top right: a check (lue), a dashed check
                    (connue) or a star (maîtrisée). */}
                <g
                  className="pg-badge"
                  transform={`translate(${n.x + n.w - 1} ${n.y + 1})`}
                >
                  <circle r="9" />
                  <path className="pg-badge-check" d="M-4 0.5l2.6 2.6 5.4-5.4" />
                  <path
                    className="pg-badge-star"
                    d="M0,-5.6 L1.6,-1.8 L5.4,-1.7 L2.5,0.8 L3.4,4.6 L0,2.6 L-3.4,4.6 L-2.5,0.8 L-5.4,-1.7 L-1.6,-1.8 Z"
                  />
                </g>
              </a>
              <g
                className="pg-act pg-act--target"
                role="button"
                tabIndex={0}
                data-act="target"
                data-slug={n.slug}
                aria-pressed="false"
                aria-label={`${t("parcours.targetThis")} : ${n.title}`}
                transform={`translate(${n.x + n.w - 2} ${n.y + n.h - 2})`}
              >
                <title>{t("parcours.targetThis")}</title>
                <circle className="pg-act-bg" r="11" />
                <circle className="pg-act-ring" r="6.5" />
                <circle className="pg-act-ring" r="3" />
                <circle className="pg-act-dot" r="1.2" />
              </g>
              <g
                className="pg-act pg-act--known"
                role="button"
                tabIndex={0}
                data-act="known"
                data-slug={n.slug}
                aria-pressed="false"
                aria-label={`${t("parcours.know")} : ${n.title}`}
                transform={`translate(${n.x + 2} ${n.y + 2})`}
              >
                <title>{t("parcours.know")}</title>
                <circle className="pg-act-bg" r="11" />
                <path className="pg-act-tick" d="M-4.5 0.5l3 3 6-6" />
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function Progress({
  slugs,
  total,
  extras,
}: {
  slugs: string[];
  total: number;
  extras?: PathExtras;
}) {
  // Quiz ids of the notes that have some: ReadMarks derives "maîtrisée".
  const quiz: Record<string, string[]> = {};
  for (const s of slugs) {
    const q = extras?.notes[s]?.quiz;
    if (q?.length) quiz[s] = q;
  }
  return (
    <span
      className="parcours-progress"
      data-read-progress
      data-path-progress
      data-slugs={slugs.join(" ")}
      data-quiz={Object.keys(quiz).length ? JSON.stringify(quiz) : undefined}
    >
      <span className="parcours-bar" aria-hidden="true">
        <span className="parcours-bar-done" />
        <span className="parcours-bar-mastered" />
      </span>
      <span className="parcours-progress-text" data-read-count>
        {t("reading.count", { read: 0, total })}
      </span>
    </span>
  );
}

/** A discipline's localized name ("Philosophy" → "Philosophie"), swapped at
 *  runtime like the rest; the folder name as is when there is no key. */
function DisciplineName({ name }: { name: string }) {
  const key = disciplineKey(name);
  if (!key) return <>{name}</>;
  return <span {...attrs(i18nAttrs(key))}>{t(key)}</span>;
}

function Back({ href, labelKey }: { href: string; labelKey: string }) {
  return (
    <a href={href} className="themes-back">
      ← <span {...attrs(i18nAttrs(labelKey))}>{t(labelKey)}</span>
    </a>
  );
}

// lib/i18n's helpers emit attribute *strings*; in JSX they come back as props
// (same helper as components/Themes.tsx).
function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/ ([\w-]+)="([^"]*)"/g)) {
    out[m[1]] = m[2].replace(/&quot;/g, '"');
  }
  return out;
}
