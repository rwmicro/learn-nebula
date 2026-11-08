import { Newsreader } from "next/font/google";
import { blackletter } from "@/components/layout/Header";
import { t, i18nProps, i18nAttrProps, disciplineKey, pathName, pathNameProps, pathNameRef, splitPathName } from "@/lib/i18n";
import type { ReadingPathView } from "@/lib/content";
import type { PathExtras } from "@/lib/path-extras";
import { PATH_FAMILIES, pathFamily, type PathFamily } from "@/lib/path-family";
import { paintingFor } from "@/lib/paintings";
import { ART, levelArt } from "@/lib/road-art";
import { splitMinutes } from "@/lib/path-study";
import { fold } from "@/lib/palette-match";
import { deskLines, placeLines, timeBuckets, LANG_HELLO, type PlacedLine } from "@/lib/path-desk";
import { ParcoursDeskHero, type HeroLevels } from "@/components/paths/ParcoursDeskHero";
import { DeskFilter, DeskMarks, DeskMore, DeskDice } from "@/components/paths/ParcoursDeskBits";
import { srcSet } from "@/lib/responsive-image";

// The desktop /parcours/ (from 1024px; parcours-desk.css shows it and hides
// the list that follows it in <main>, which phones and tablets keep). A hero
// on the picture of the path in progress, then the filter bar, the lines
// (paths that follow one another), the paths by the time they take, and one
// room per colour family: its picture on the wall, its paths as cards.
// Everything here is built at fr and swapped at runtime like the rest
// (data-i18n); the reader's progress is laid on by <DeskMarks> and the hero.

// The home's editorial serif (app/page.tsx), here for the whole desktop page.
const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--gk-serif",
  fallback: ["Georgia", "serif"],
  preload: false,
});

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const TILE_DISCIPLINES = new Set(["Languages & Dialects"]);

/** "8 min", "1 h 05": text and its runtime key. */
function dur(minutes: number): [string, Record<string, string>] {
  const { h, m } = splitMinutes(minutes);
  const [key, vars] = h ? (["parcours.hm", { h: String(h), mm: String(m).padStart(2, "0") }] as const) : (["parcours.min", { m: String(m) }] as const);
  return [t(key, vars), i18nProps(key, vars)];
}
function Dur({ minutes }: { minutes: number }) {
  const [text, props] = dur(minutes);
  return <span {...props}>{text}</span>;
}
/** A key with a duration in it: the duration's text goes in as a plain var. */
function T({ k, v, as: As = "span", className }: { k: string; v?: Record<string, string | number>; as?: "span" | "b" | "i" | "small" | "h2" | "h3" | "p" | "em"; className?: string }) {
  return (
    <As className={className} {...i18nProps(k, v)}>
      {t(k, v)}
    </As>
  );
}

function Sec({ k, hint, id }: { n?: string; k: string; hint: string; id?: string }) {
  return (
    <div className="pcd-sec" id={id}>
      <span className="n" aria-hidden="true" />
      <T as="h2" k={k} />
      <T as="i" k={hint} />
    </div>
  );
}

const minutesOf = (p: ReadingPathView, extras: Record<string, PathExtras>) =>
  p.notes.reduce((s, n) => s + (extras[p.slug]?.notes[n.slug]?.minutes ?? 1), 0);

const searchText = (p: ReadingPathView) => fold([p.name, p.description ?? "", p.discipline, ...p.notes.map((n) => n.title)].join(" "));

export function ParcoursDesk({
  paths,
  extras,
  levels,
  noteCount,
  dataVersion,
}: {
  paths: ReadingPathView[];
  extras: Record<string, PathExtras>;
  levels: HeroLevels;
  noteCount: number;
  dataVersion: string;
}) {
  const mins = new Map(paths.map((p) => [p.slug, minutesOf(p, extras)]));
  const fam = (p: ReadingPathView) => pathFamily(p.discipline);
  const rooms = PATH_FAMILIES.map((f) => ({ f, list: paths.filter((p) => fam(p) === f) })).filter((r) => r.list.length);
  const totalMinutes = [...mins.values()].reduce((a, b) => a + b, 0);

  const { lines, height } = placeLines(
    deskLines(
      paths.map((p) => ({ slug: p.slug, name: p.name, discipline: p.discipline, family: fam(p), minutes: mins.get(p.slug)!, prev: p.prev?.slug, next: p.next?.slug })),
      ["langues"],
    ),
  );
  // A short name ("Sociologie") unless another path shares it ("Philosophie").
  const titleCount = new Map<string, number>();
  for (const p of paths) titleCount.set(splitPathName(p.name)[0], (titleCount.get(splitPathName(p.name)[0]) ?? 0) + 1);
  const ambiguous = (p: ReadingPathView) => (titleCount.get(splitPathName(p.name)[0]) ?? 0) > 1;
  const timed = paths.map((p) => ({ p, slug: p.slug, minutes: mins.get(p.slug)! }));
  const buckets = timeBuckets(timed);
  const nRooms = rooms.length;

  // Sections are numbered; the first visit adds "how it works" before them
  // (the hero swaps the numbers through data-pcd-n).
  const rooms8 = rooms.map(({ f, list }) => ({ f, count: list.length, src: paintingFor(f).src, focus: paintingFor(f).focus }));

  return (
    <div className={`pcd ${newsreader.variable}`} data-first="" data-pagefind-ignore>
      <ParcoursDeskHero
        rooms={rooms8}
        levels={levels}
        counts={{ paths: paths.length, rooms: nRooms }}
        dataVersion={dataVersion}
        logoClass={blackletter.className}
      />

      <DeskFilter
        total={paths.length}
        families={rooms.map(({ f, list }) => ({ id: f, count: list.length }))}
      />

      <div className="pcd-in">
        {/* First visit: three gestures (shown by .pcd[data-first]). */}
        <div className="pcd-first-only">
          <Sec n="I" k="pcd.secHow" hint="pcd.secHowHint" />
          <div className="pcd-how">
            <div>
              <span className="num">1</span>
              <T as="h3" k="pcd.how1" />
              <T as="p" k="pcd.how1Text" />
              <span className="pcd-mini" aria-hidden="true">
                <i className="d" />
                <i className="d" />
                <i className="c" />
                <i />
                <i />
                <i />
              </span>
            </div>
            <div>
              <span className="num">2</span>
              <T as="h3" k="pcd.how2" />
              <T as="p" k="pcd.how2Text" />
              <span className="pcd-q" aria-hidden="true">
                <T as="b" k="pcd.how2Q" />
                <span className="ok">Malinowski</span>
                <span>Boas</span>
              </span>
            </div>
            <div>
              <span className="num">3</span>
              <T as="h3" k="pcd.how3" />
              <T as="p" k="pcd.how3Text" />
              <span className="pcd-cards" aria-hidden="true">
                <i />
                <i />
                <T as="i" k="pcd.how3Cards" v={{ n: 12, m: 5 }} />
              </span>
            </div>
          </div>
        </div>

        {lines.length > 0 && (
          <>
            <Sec n="I" k="pcd.secLines" hint="pcd.secLinesHint" id="pcd-lignes" />
            <div className="pcd-metro-w">
              <Metro lines={lines} height={height} paths={paths} />
              <p className="pcd-legend pcd-back-only">
                <span>
                  <i className="dn" />
                  <T k="pcd.legendRead" />
                </span>
                <span>
                  <i className="cur" />
                  <T k="pcd.legendCur" />
                </span>
                <span>
                  <i />
                  <T k="pcd.legendNext" />
                </span>
              </p>
              <T as="p" className="pcd-legend pcd-first-only" k="pcd.legendFirst" />
            </div>
          </>
        )}

        <Sec n="II" k="pcd.secTime" hint="pcd.secTimeHint" id="pcd-duree" />
        <div className="pcd-time">
          {buckets.map((b, i) => (
            <div key={i}>
              <T as="small" k={`pcd.t${i + 1}k`} />
              <T as="h3" k={`pcd.t${i + 1}`} />
              <ol>
                {b.map(({ p, minutes }) => (
                  <li key={p.slug}>
                    <a href={`/parcours/${p.slug}/`}>
                      <b {...pathNameProps(p, ambiguous(p) ? "full" : "title")}>{ambiguous(p) ? p.name.replace(" : ", ", ") : pathName(p, "title")}</b>
                      <Dur minutes={minutes} />
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <div className="dice">
            <T as="small" k="pcd.diceK" />
            <T as="h3" k="pcd.dice" />
            <T as="p" className="pcd-back-only" k="pcd.diceText" />
            <T as="p" className="pcd-first-only" k="pcd.diceTextFirst" />
            <DeskDice slugs={paths.map((p) => [p.slug, p.notes.map((n) => n.slug)])} />
          </div>
        </div>

        <Sec n="III" k="pcd.secRooms" hint="pcd.secRoomsHint" id="pcd-salles" />
        {rooms.map(({ f, list }, i) => {
          const art = paintingFor(f);
          const tiles = list.filter((p) => TILE_DISCIPLINES.has(p.discipline));
          const cards = list.filter((p) => !TILE_DISCIPLINES.has(p.discipline));
          const roomMinutes = list.reduce((s, p) => s + mins.get(p.slug)!, 0);
          const shown = f === "informatique" ? 8 : cards.length;
          const [d] = dur(roomMinutes);
          return (
            <section key={f} className="pcd-room" data-family={f} id={`salle-${f}`} data-pcd-room>
              <aside className="pcd-wall">
                <T as="small" k="pcd.room" v={{ n: ROMAN[i] }} />
                <T as="h2" k={`parcours.family.${f}`} />
                <T as="p" k="pcd.roomMeta" v={{ n: list.length, d }} />
                <figure>
                  <span className="pcd-fr">
                    <picture>
                      <source type="image/avif" srcSet={srcSet(art.src, "avif")} sizes="160px" />
                      <img src={`${art.src}.webp`} srcSet={srcSet(art.src, "webp")} sizes="160px" alt="" loading="lazy" decoding="async" style={{ objectPosition: `${art.focus} 50%` }} />
                    </picture>
                  </span>
                  <figcaption>{art.credit}</figcaption>
                </figure>
              </aside>
              <div className="pcd-body">
                {tiles.length > 0 && (
                  <div className="pcd-langs">
                    {[...tiles]
                      .sort((a, b) => {
                        const ta = !LANG_HELLO[splitPathName(a.name)[0]];
                        const tb = !LANG_HELLO[splitPathName(b.name)[0]];
                        return Number(ta) - Number(tb) || splitPathName(a.name)[0].localeCompare(splitPathName(b.name)[0], "fr");
                      })
                      .map((p) => {
                        const hello = LANG_HELLO[splitPathName(p.name)[0]];
                        return (
                          <a
                            key={p.slug}
                            className={hello ? "pcd-lang" : "pcd-lang tool"}
                            href={`/parcours/${p.slug}/`}
                            data-pcd-card
                            data-slugs={p.notes.map((n) => n.slug).join(" ")}
                            data-search={searchText(p)}
                          >
                            {hello ? (
                              <span className={`g ${hello[1] ?? ""}`} dir="auto">
                                {hello[0]}
                              </span>
                            ) : (
                              <T className="g x" k="pcd.method" />
                            )}
                            <b {...pathNameProps(p, "title")}>{pathName(p, "title")}</b>
                            <small>
                              <span {...i18nProps("dash.notes", { n: p.notes.length })}>{t("dash.notes", { n: p.notes.length })}</span> · <Dur minutes={mins.get(p.slug)!} />
                            </small>
                            <i className="bar" />
                          </a>
                        );
                      })}
                  </div>
                )}
                {cards.length > 0 && (
                  <div className={tiles.length ? "pcd-grid after" : "pcd-grid"}>
                    {cards.map((p, j) => (
                      <Card key={p.slug} p={p} family={f} minutes={mins.get(p.slug)!} more={j >= shown} />
                    ))}
                  </div>
                )}
                {cards.length > shown && <DeskMore n={cards.length - shown} />}
              </div>
            </section>
          );
        })}

        <div className="pcd-colo">
          <p>
            <T k="pcd.quote" />
            <T as="span" k="pcd.quoteBy" />
          </p>
          <div>
            <b>{paths.length}</b>
            <T k="pcd.statPaths" />
            <b>{new Intl.NumberFormat("fr-FR").format(noteCount)}</b>
            <T k="pcd.statNotes" />
            <b>≈ {Math.round(totalMinutes / 60)} h</b>
            <T k="pcd.statTime" />
          </div>
        </div>
      </div>
      <DeskMarks />
    </div>
  );
}

function Card({ p, family, minutes, more }: { p: ReadingPathView; family: PathFamily; minutes: number; more: boolean }) {
  const sub = pathName(p, "sub");
  return (
    <a
      className="pcd-card"
      href={`/parcours/${p.slug}/`}
      data-pcd-card
      data-slugs={p.notes.map((n) => n.slug).join(" ")}
      data-search={searchText(p)}
      data-more={more ? "" : undefined}
    >
      <span className="pcd-ic deco" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ART[levelArt(p.name, "", family, p.discipline)[0]] }} />
      <span className="pcd-tx">
        <b {...pathNameProps(p, "title")}>{pathName(p, "title")}</b>
        {sub && <em {...pathNameProps(p, "sub")}>{sub}</em>}
        {p.description && <span className="pcd-desc">{p.description}</span>}
        {(p.prev || p.next) && (
          <span className="pcd-chain">
            {p.prev && <span {...i18nProps("parcours.followsFrom", { name: pathNameRef(p.prev, "title") })}>{t("parcours.followsFrom", { name: pathNameRef(p.prev, "title") })}</span>}
            {p.prev && p.next && " · "}
            {p.next && <span {...i18nProps("parcours.followedBy", { name: pathNameRef(p.next, "title") })}>{t("parcours.followedBy", { name: pathNameRef(p.next, "title") })}</span>}
          </span>
        )}
        <span className="pcd-foot">
          <span className="pcd-meta">
            <span {...i18nProps("dash.notes", { n: p.notes.length })}>{t("dash.notes", { n: p.notes.length })}</span> · <Dur minutes={minutes} />
          </span>
          <T className="pcd-go" k="pcd.start" />
          <span className="pcd-bar" aria-hidden="true">
            <i />
          </span>
          <span className="pcd-st" data-pcd-st />
        </span>
      </span>
      <T className="pcd-seal" k="pcd.seal" />
    </a>
  );
}

function Metro({ lines, height, paths }: { lines: PlacedLine[]; height: number; paths: ReadingPathView[] }) {
  const bySlug = new Map(paths.map((p) => [p.slug, p]));
  return (
    <svg className="pcd-metro" viewBox={`0 0 1070 ${height}`} role="img" {...i18nAttrProps("aria-label", "pcd.secLines")} aria-label={t("pcd.secLines")}>
      {lines.map((l) => {
        const n = l.stations.length;
        const step = (l.x1 - l.x0) / (n - 1);
        const disc = l.mixed ? null : disciplineKey(l.discipline);
        const name = l.mixed && l.family ? t(`parcours.family.${l.family}`) : disc ? t(disc) : l.discipline;
        const first = bySlug.get(l.stations[0].slug)!;
        const last = bySlug.get(l.stations[n - 1].slug)!;
        const [d] = dur(l.minutes);
        const long = n >= 6;
        return (
          <g key={l.stations[0].slug} data-family={l.family ?? undefined} data-pcd-line>
            <text x={l.tx} y={l.ty} className="ttl" {...i18nProps("pcd.line", { l: name.charAt(0).toUpperCase(), name })}>
              {t("pcd.line", { l: name.charAt(0).toUpperCase(), name })}
            </text>
            {long && (
              <text
                x={1070}
                y={l.ty}
                className="sub2"
                textAnchor="end"
                {...i18nProps("pcd.lineMeta", { n, d, a: pathNameRef(first, "title"), b: pathNameRef(last, "title") })}
              >
                {t("pcd.lineMeta", { n, d, a: pathName(first, "title"), b: pathName(last, "title") })}
              </text>
            )}
            <line x1={l.x0} y1={l.y} x2={l.x1} y2={l.y} className="ln" />
            {l.stations.slice(1).map((s, j) => (
              <line key={s.slug} x1={l.x0 + step * j} y1={l.y} x2={l.x0 + step * (j + 1)} y2={l.y} className="seg" data-to={s.slug} />
            ))}
            {l.stations.map((s, j) => {
              const x = l.x0 + j * step;
              const up = j % 2 === 0;
              const p = bySlug.get(s.slug)!;
              return (
                <a key={s.slug} href={`/parcours/${s.slug}/`} data-pcd-station={s.slug} data-slugs={p.notes.map((nn) => nn.slug).join(" ")}>
                  <circle cx={x} cy={l.y} r={7} className="st" />
                  <text x={x} y={up ? l.y - 20 : l.y + 30} className="lb" {...(s.sub ? pathNameProps(p, "sub") : pathNameProps(p, "title"))}>
                    {s.label}
                  </text>
                </a>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

