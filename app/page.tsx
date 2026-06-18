import type { Metadata } from "next";
import Script from "next/script";
import { getIndexDoc, getPostTree } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { navHtml, renderNoteTree } from "@/lib/html";
import { buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PagefindAssets } from "@/components/PagefindAssets";
import { graph, personJsonLd, websiteJsonLd } from "@/lib/jsonld";

export async function generateMetadata(): Promise<Metadata> {
  const doc = getIndexDoc();
  return buildMetadata({ fm: doc.frontmatter, body: doc.body, path: "/", isArticle: false });
}

export default async function HomePage() {
  const doc = getIndexDoc();
  const { html } = await renderMarkdown(doc.body);
  const tree = renderNoteTree(getPostTree());

  // Pagefind full-text search needs the build index, so it only exists in
  // production; in dev fall back to an instant title filter over the tree.
  const searchBox =
    process.env.NODE_ENV === "production"
      ? `<div id="search" class="pf-search"></div>`
      : `<input type="search" id="note-search" class="note-search" placeholder="Filtrer les notes…" autocomplete="off" aria-label="Filtrer les notes">`;

  const main =
    `<h1>${doc.frontmatter.title}</h1>` +
    html +
    `<img src="/images/eragny.webp" alt="Image Eragny" class="notes-image" width="1200" height="950" loading="lazy" decoding="async" />` +
    searchBox +
    `<h2 id="notes">Notes <a class="anchor" href="#notes">§</a></h2>` +
    tree +
    navHtml();

  return (
    <>
      <main id="main" dangerouslySetInnerHTML={{ __html: main }} />
      <JsonLd data={graph(personJsonLd(), websiteJsonLd())} />
      <PagefindAssets />
      <Script src="/js/search.js" strategy="afterInteractive" />
    </>
  );
}
