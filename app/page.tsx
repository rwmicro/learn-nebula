import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import { getAllPosts, getDisciplines, getIndexDoc, getLanguageScopes, getPost, getReadingPaths, getRecentNotes, INDEX_NOTE } from "@/lib/content";
import { HomeMore } from "@/components/HomeMore";
import { homeDataVersion, homeTreeShell } from "@/lib/home-data";
import { t } from "@/lib/i18n";
import { buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { graph, personJsonLd, websiteJsonLd } from "@/lib/jsonld";
import Header from "@/components/Header";
import { HomeContent } from "@/components/HomeContent";
import { RecentNotes } from "@/components/RecentNotes";
import { Graphiques } from "@/components/Graphiques";
import { getGraphiques } from "@/lib/graphiques";
import { HomeDashboard, type DashDayNote, type DashPath, type DashRecent } from "@/components/HomeDashboard";
import { extractPlain } from "@/lib/markdown";
import { readingMinutes } from "@/lib/path-extras";
import { familyOfPrefix, pathFamily } from "@/lib/path-family";
import "@/assets/css/graphiques.css";

// Editorial serif for the content zone. next/font self-hosts the files at build
// time, so they are served from our own origin — no Google CDN request, and the
// `font-src 'self'` CSP keeps holding. Exposed as the --gk-serif variable on
// <main>; HomeContent reads it while the masthead keeps the site's Alegreya.
const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--gk-serif",
  fallback: ["Georgia", "serif"],
  // The content-zone serif lives below the fold; preloading its 6 files just
  // triggers "preloaded but not used" console warnings. The swap fallback covers
  // the brief FOUT.
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const doc = getIndexDoc();
  return buildMetadata({
    fm: doc.frontmatter,
    body: doc.body,
    path: "/",
    isArticle: false,
  });
}

/** A note's opening, cut at a word near `max` characters. */
function excerpt(plain: string, max = 190): string {
  const text = plain.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).replace(/[\s,;:.–—-]+$/, "")}…`;
}

/** Stable pseudo-random order: a hash of the slug. */
function slugHash(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The phone dashboard's data (components/HomeDashboard.tsx): the reading
 *  paths, the latest notes with their discipline and reading time, and the
 *  notes the "note du jour" turns through (one a day, chosen in the
 *  browser from the date). */
function dashboardData(): { paths: DashPath[]; recent: DashRecent[]; dayNotes: DashDayNote[] } {
  const disciplines = getDisciplines()
    .map((d) => ({ slug: d.slug, name: d.name, count: d.count, family: familyOfPrefix(d.prefix), prefix: d.prefix }))
    .sort((a, b) => b.count - a.count);
  const builtAt = Date.now();
  const recent = getRecentNotes().map((n) => {
    const slug = n.href.replace(/^\/posts\//, "").replace(/\/$/, "");
    const d = disciplines.find((x) => slug.startsWith(x.prefix));
    return {
      title: n.title,
      href: n.href,
      discipline: d?.name ?? "",
      family: d?.family ?? null,
      minutes: readingMinutes(extractPlain(getPost(slug).body)),
      fresh: builtAt - n.at.getTime() < 14 * 86_400_000,
    };
  });
  // A month of notes of the day: a stable shuffle of the notes that sit in a
  // discipline (not folder maps), keeping those long enough to be worth it.
  const dayNotes: DashDayNote[] = [];
  const pool = getAllPosts()
    .filter((doc) => doc.rawPath !== INDEX_NOTE && !/\bindex\b/i.test(doc.frontmatter.title))
    .sort((a, b) => slugHash(a.slug) - slugHash(b.slug));
  for (const doc of pool) {
    if (dayNotes.length >= 31) break;
    const d = disciplines.find((x) => doc.slug.startsWith(x.prefix));
    if (!d) continue;
    const plain = extractPlain(doc.body);
    const minutes = readingMinutes(plain);
    if (minutes < 3 || plain.length < 400) continue;
    dayNotes.push({
      title: doc.frontmatter.title,
      href: `/posts/${doc.slug}/`,
      discipline: d.name,
      family: d.family,
      minutes,
      // The body often opens on its own title: start after it.
      excerpt: excerpt(plain.startsWith(doc.frontmatter.title) ? plain.slice(doc.frontmatter.title.length) : plain),
    });
  }
  const paths = getReadingPaths().map((p) => ({
    slug: p.slug,
    name: p.name,
    family: pathFamily(p.discipline),
    slugs: p.notes.map((n) => n.slug),
    ...(p.cible ? { cible: p.cible } : {}),
  }));
  return { paths, recent, dayNotes };
}

export default async function HomePage() {
  const doc = getIndexDoc();
  const dash = dashboardData();
  const noteCount = getAllPosts().filter((d) => d.rawPath !== INDEX_NOTE).length;
  return (
    <>
      <Header doc={doc} />
      <HomeDashboard
        dataVersion={homeDataVersion()}
        recent={dash.recent}
        paths={dash.paths}
        dayNotes={dash.dayNotes}
        noteCount={noteCount}
      />
      {/* Intro and painting: the phone dashboard shows the painting as its
          banner and moves the intro to "À propos du jardin" (app.css). */}
      <div className='home-intro w-11/12 mx-auto text-center text-lead text-muted mt-5 md:mt-10'>
      {/* The index note's text lives in messages/*.json (home.intro1-3), not in
          the vault note, so the language switcher swaps it like any UI string
          with no call to /api/translate. Edit it there in all five locales. */}
      <div className="mb-5 text-ink-2 mt-5 md:mt-10">
        <p>
          <span data-i18n="home.intro1">{t("home.intro1")}</span>{" "}
          <span data-i18n="home.intro2">{t("home.intro2")}</span>{" "}
          <span data-i18n="home.intro3">{t("home.intro3")}</span>
        </p>
        <p><em lang="en" dir="ltr">The Gardener.</em></p>
      </div>
          <div className="w-full md:w-11/12 max-w-11/12 mx-auto">
            <span className="home-frame mb-2 block">
              <picture>
                <source type="image/avif" srcSet="/images/eragny.avif" />
                <img src="/images/eragny.webp" alt="Éragny" width="1200" height="950" fetchPriority="high" decoding="async" />
              </picture>
            </span>
            <span className="text-sm text-muted" data-i18n="home.imageCaption"> Camille Pissarro, Le Jardin potager à Éragny, 1897. — La connaissance, comme un jardin, se cultive et se transmet.</span>
          </div>
      </div>
      <main id="main" className={`home-main ${newsreader.variable}`}>
        <RecentNotes notes={getRecentNotes()} />
        <Graphiques items={getGraphiques(3)} />
        {/* The full tree and the folder-graph preview
            arrive as /home-data.json (lib/home-data.ts); the shell covers the
            first paint. */}
        <HomeContent
          shell={homeTreeShell()}
          dataVersion={homeDataVersion()}
          hasPaths={getReadingPaths().length > 0}
          noteCount={noteCount}
        />
        <HomeMore notes={noteCount} paths={getReadingPaths().length} languages={getLanguageScopes().length} />
      </main>
      <JsonLd data={graph(personJsonLd(), websiteJsonLd())} />
    </>
  );
}
