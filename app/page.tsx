import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import {
  getIndexDoc,
  getHomeTree,
  getPdfAssets,
  getDomains,
  getLangs,
  getRecentNotes,
} from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { buildGraph } from "@/lib/graph-data";
import { buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { graph, personJsonLd, websiteJsonLd } from "@/lib/jsonld";
import Header from "@/components/Header";
import { HomeContent } from "@/components/HomeContent";
import { RecentNotes } from "@/components/RecentNotes";

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

export default async function HomePage() {
  const doc = getIndexDoc();
  const { html, hasMath } = await renderMarkdown(doc.body);

  // Masthead body (rendered Markdown + intro image) — kept as HTML since
  // Markdown→HTML can't become components. The <h1> lives in <Header>.
  const masthead =
    (hasMath ? `<link rel="stylesheet" href="/katex/katex.min.css">` : "");

  // Lightweight folder-only graph for the home preview (the full graph with all
  // notes lives on /graph).
  const graphData = buildGraph({ foldersOnly: true });

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: masthead }} />
      <Header doc={doc} />
      <div className='w-11/12 mx-auto text-center text-lead text-muted mt-5 md:mt-10'>
      <div dangerouslySetInnerHTML={{ __html: html }} className="mb-5 text-ink-2 mt-5 md:mt-10" />
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
      <main id="main" className={newsreader.variable}>
        <RecentNotes notes={getRecentNotes()} />
        <HomeContent
          tree={getHomeTree()}
          pdfs={getPdfAssets()}
          domains={getDomains()}
          langs={getLangs()}
          graphData={graphData}
        />
      </main>
      <JsonLd data={graph(personJsonLd(), websiteJsonLd())} />
    </>
  );
}
