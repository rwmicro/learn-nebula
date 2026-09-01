import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import { getIndexDoc, getHomeTree, getPdfAssets, getDomains, getLangs } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { buildGraph } from "@/lib/graph-data";
import { buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { graph, personJsonLd, websiteJsonLd } from "@/lib/jsonld";
import Header from "@/components/Header";
import { HomeContent } from "@/components/HomeContent";

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
});

// Corner flourish for the home hero image (#10): sepia scrollwork + a few green
// leaves that hug one corner. Drawn once for the top-left; CSS mirrors it into
// the other three corners. Purely decorative → aria-hidden.
function CornerOrnament({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M8 8 C 40 10 58 24 60 58" />
        <path d="M8 8 C 10 40 24 58 58 60" />
        <path d="M8 8 C 30 12 44 26 46 48" opacity="0.7" />
        <path d="M8 8 C 12 30 26 44 48 46" opacity="0.7" />
        <path d="M60 58 c 6 4 12 2 14 -4 c -6 0 -11 1 -14 4" />
        <path d="M58 60 c 4 6 2 12 -4 14 c 0 -6 1 -11 4 -14" />
      </g>
      <g fill="#5f7d4f">
        <path d="M46 26 c 10 -8 22 -7 30 -1 c -9 5 -20 6 -30 1 z" />
        <path d="M26 46 c -8 10 -7 22 -1 30 c 5 -9 6 -20 1 -30 z" />
        <ellipse cx="70" cy="20" rx="6" ry="3.4" transform="rotate(-28 70 20)" />
        <ellipse cx="20" cy="70" rx="3.4" ry="6" transform="rotate(-28 20 70)" />
      </g>
    </svg>
  );
}

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
      <div className='w-11/12 mx-auto text-center text-lead text-neutral-500 mt-10'>
      <div dangerouslySetInnerHTML={{ __html: html }} className="mb-5 text-neutral-700 mt-10" />
          <div className="w-full md:w-11/12 max-w-11/12 mx-auto">
            <span className="home-hero mb-2 block">
              <img src="/images/eragny.webp" alt="Éragny" width="1200" height="950" fetchPriority="high" decoding="async" />
              <CornerOrnament className="corner-orn corner-tl" />
              <CornerOrnament className="corner-orn corner-tr" />
              <CornerOrnament className="corner-orn corner-bl" />
              <CornerOrnament className="corner-orn corner-br" />
            </span>
            <span className="text-sm text-neutral-500"> Camille Pissarro, Le Jardin potager à Éragny, 1897. — La connaissance, comme un jardin, se cultive et se transmet.</span>
          </div>
      </div>
      <main id="main" className={newsreader.variable}>
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
