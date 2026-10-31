import type { Metadata } from "next";
import { getAllPosts, getPost, INDEX_NOTE } from "@/lib/content";
import { buildMetadata, firstImage } from "@/lib/seo";
import { extractPlain, truncate } from "@/lib/markdown";
import { SITE_URL, AUTHOR, absoluteURL } from "@/lib/site";
import { graph, breadcrumbJsonLd } from "@/lib/jsonld";
import { SinglePage } from "@/components/SinglePage";
import { ogCardFor, ogImagePath } from "@/lib/og";
import { NoteScripts } from "@/components/NoteScripts";
// Article typography + note-widget styles, scoped to this route only.
import "@/assets/css/note";
import "@/assets/css/syntax.css";
import "@/assets/css/note-paths.css";
import "@/assets/css/path-step.css";
// Widget packs (lib/widgets-extra.ts): data figures, sciences, languages.
import "@/assets/css/widgets-extra.css";
import "@/assets/css/widgets-sci.css";
import "@/assets/css/widgets-lang.css";
import "@/assets/css/cite.css";

type Params = { params: Promise<{ slug: string[] }> };

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug.split("/") }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const doc = getPost(slugPath);
  return buildMetadata({
    fm: doc.frontmatter,
    body: doc.body,
    path: `/posts/${slugPath}/`,
    isArticle: true,
    fallbackImage: ogImagePath(ogCardFor(doc)),
  });
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const doc = getPost(slugPath);
  const fm = doc.frontmatter;
  const url = absoluteURL(`/posts/${slugPath}/`);
  const published = fm.date?.toISOString();
  // Fall back to datePublished when the note has never been re-tended — but
  // never the other way around: a dateModified that's actually earlier than
  // datePublished (a stale build vs. a since-edited note) would be a worse
  // signal to send than omitting it.
  const modified = (fm.updated ?? fm.date)?.toISOString();

  const article = {
    "@type": "Article",
    headline: fm.title,
    description: truncate(extractPlain(doc.body), 160),
    url,
    mainEntityOfPage: url,
    image: firstImage(doc.body),
    inLanguage: fm.lang || "fr",
    isPartOf: { "@type": "WebSite", url: `${SITE_URL}/` },
    ...(fm.tags?.length ? { keywords: fm.tags.join(", ") } : {}),
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    author: { "@type": "Person", name: AUTHOR },
    publisher: { "@type": "Person", name: AUTHOR, url: `${SITE_URL}/` },
  };
  const breadcrumb = breadcrumbJsonLd(fm.title, url, INDEX_NOTE);

  return (
    <>
      <SinglePage doc={doc} jsonLd={graph(article, breadcrumb)} note />
      <NoteScripts />
    </>
  );
}
