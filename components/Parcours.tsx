import { t, i18nAttrs } from "@/lib/i18n";
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
  const groups = new Map<string, ReadingPathView[]>();
  for (const p of paths)
    groups.set(p.discipline, [...(groups.get(p.discipline) ?? []), p]);
  return (
    <main id="main" className="themes-page parcours-page">
      <Back href="/themes/" labelKey="nav.themes" />
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
      {[...groups.entries()].map(([discipline, list]) => (
        <section key={discipline || "_"}>
          <h2 className="themes-h2">
            {discipline || (
              <span {...attrs(i18nAttrs("parcours.other"))}>
                {t("parcours.other")}
              </span>
            )}
          </h2>
          <ul className="parcours-cards">
            {list.map((p) => (
              <li key={p.slug} className="parcours-card" data-read-group>
                <a href={`/parcours/${p.slug}/`} className="parcours-card-link">
                  <MiniGraph path={p} />
                  <span className="parcours-card-body">
                    <span className="parcours-card-title">{p.name}</span>
                    {p.description && (
                      <span className="parcours-card-desc">
                        {p.description}
                      </span>
                    )}
                    <span className="parcours-card-meta">
                      <span
                        {...attrs(
                          i18nAttrs("parcours.count", { n: p.notes.length }),
                        )}
                      >
                        {t("parcours.count", { n: p.notes.length })}
                      </span>
                      {" · "}
                      <span
                        {...attrs(
                          i18nAttrs("parcours.from", {
                            first: p.notes[0].title,
                            last: p.notes[p.notes.length - 1].title,
                          }),
                        )}
                      >
                        {t("parcours.from", {
                          first: p.notes[0].title,
                          last: p.notes[p.notes.length - 1].title,
                        })}
                      </span>
                    </span>
                    <Progress
                      slugs={p.notes.map((n) => n.slug)}
                      total={p.notes.length}
                      extras={extras[p.slug]}
                    />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="parcours-privacy" {...attrs(i18nAttrs("reading.privacy"))}>
        {t("reading.privacy")}
      </p>
      <ReadMarks />
    </main>
  );
}

export function ParcoursPage({
  path,
  extras,
}: {
  path: ReadingPathView;
  extras: PathExtras;
}) {
  const titles = new Map(path.notes.map((n) => [n.slug, n.title]));
  const order = path.notes.map((n) => n.slug);
  const titleOf = (s: string) => titles.get(s) ?? s;
  const layout = layoutPrereqGraph(order, path.edges, titleOf);
  // Phones get a tighter drawing (narrower boxes, shorter lines) so most
  // paths fit a 390px screen; wider ones zoom and pan (PathZoom), opening on
  // the next note to read. CSS shows one or the other.
  const compact = layoutPrereqGraph(order, path.edges, titleOf, COMPACT);
  const study: StudyNoteView[] = path.notes.map((n) => ({
    slug: n.slug,
    title: n.title,
    href: n.href,
    prereqs: n.prereqs,
    minutes: extras.notes[n.slug]?.minutes ?? 1,
    quiz: extras.notes[n.slug]?.quiz ?? [],
  }));
  const hasQuiz = new Set(study.filter((n) => n.quiz.length).map((n) => n.slug));
  return (
    <main
      id="main"
      className="themes-page parcours-page parcours-page--path"
      data-parcours
      data-path={path.slug}
    >
      {/* Revision answers can hold KaTeX markup from the notes. */}
      {extras.items.some((i) => /katex/.test(i.q + i.a)) && (
        <link rel="stylesheet" href="/katex/katex.min.css" />
      )}
      <Back href="/parcours/" labelKey="parcours.title" />
      {path.discipline && <p className="themes-kicker">{path.discipline}</p>}
      <h1 className="themes-title">{path.name}</h1>
      {path.description && (
        <p className="themes-intro parcours-desc">{path.description}</p>
      )}
      <div className="parcours-status" data-read-group>
        <span {...attrs(i18nAttrs("parcours.count", { n: path.notes.length }))}>
          {t("parcours.count", { n: path.notes.length })}
        </span>
        <Progress
          slugs={path.notes.map((n) => n.slug)}
          total={path.notes.length}
          extras={extras}
        />
      </div>
      <p className="parcours-next" data-parcours-next hidden>
        <span {...attrs(i18nAttrs("parcours.next"))}>{t("parcours.next")}</span>{" "}
        <a href="#">…</a>
      </p>

      <ParcoursStudy pathSlug={path.slug} notes={study} items={extras.items} />

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
        </figcaption>
      </figure>

      {/* Text alternative to the graph, and the reading order on its own. */}
      <h2 className="themes-h2" {...attrs(i18nAttrs("parcours.order"))}>
        {t("parcours.order")}
      </h2>
      <ol className="parcours-order">
        {path.notes.map((n) => (
          <li key={n.slug} data-slug={n.slug}>
            <a href={n.href}>{n.title}</a>{" "}
            <span className="parcours-state" data-state-label hidden />
            {n.prereqs.length > 0 && (
              <span className="parcours-after">
                {" — "}
                <span {...attrs(i18nAttrs("parcours.after"))}>
                  {t("parcours.after")}
                </span>{" "}
                {n.prereqs.map((p) => titles.get(p) ?? p).join(", ")}
              </span>
            )}
            <span className="parcours-li-acts">
              <button
                type="button"
                className="parcours-li-btn"
                data-act="target"
                data-slug={n.slug}
                aria-pressed="false"
              >
                {t("parcours.targetThis")}
              </button>
              <button
                type="button"
                className="parcours-li-btn"
                data-act="known"
                data-slug={n.slug}
                aria-pressed="false"
              >
                {t("parcours.know")}
              </button>
            </span>
          </li>
        ))}
      </ol>
      <p className="parcours-privacy" {...attrs(i18nAttrs("reading.privacy"))}>
        {t("reading.privacy")}
      </p>
      <ReadMarks />
    </main>
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

/** Thumbnail of a path's graph for its index card: dots and lines, same
 *  layout code with tiny boxes. Decorative (the card says it all in words). */
function MiniGraph({ path }: { path: ReadingPathView }) {
  const g = layoutPrereqGraph(
    path.notes.map((n) => n.slug),
    path.edges,
    (s) => s,
    {
      nodeWidth: 12,
      nodeHeight: 12,
      gapX: 10,
      gapY: 12,
      dummyWidth: 4,
      padding: 6,
    },
  );
  return (
    <svg
      className="pm"
      viewBox={`0 0 ${g.width} ${g.height}`}
      width={g.width}
      height={g.height}
      aria-hidden="true"
      focusable="false"
    >
      {g.edges.map((e) => (
        <path
          key={`${e.from}>${e.to}`}
          className="pm-edge"
          d={edgePath(e.points)}
        />
      ))}
      {g.nodes.map((n) => (
        <circle
          key={n.slug}
          className="pm-dot"
          data-slug={n.slug}
          cx={n.x + n.w / 2}
          cy={n.y + n.h / 2}
          r={n.w / 2 - 1}
        />
      ))}
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
