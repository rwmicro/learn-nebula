import type { Metadata } from "next";
import { getAllPosts, getPost, INDEX_NOTE } from "@/lib/content";
import { buildMetadata, firstImage } from "@/lib/seo";
import { extractPlain, truncate } from "@/lib/markdown";
import { SITE_URL, AUTHOR, absoluteURL } from "@/lib/site";
import { graph, breadcrumbJsonLd } from "@/lib/jsonld";
import { SinglePage } from "@/components/SinglePage";

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
  });
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const doc = getPost(slugPath);
  const fm = doc.frontmatter;
  const url = absoluteURL(`/posts/${slugPath}/`);
  const iso = fm.date?.toISOString();

  const article = {
    "@type": "Article",
    headline: fm.title,
    description: truncate(extractPlain(doc.body), 160),
    url,
    mainEntityOfPage: url,
    image: firstImage(doc.body),
    ...(iso ? { datePublished: iso, dateModified: iso } : {}),
    author: { "@type": "Person", name: fm.author?.[0] ?? AUTHOR },
    publisher: { "@type": "Person", name: AUTHOR, url: `${SITE_URL}/` },
  };
  const breadcrumb = breadcrumbJsonLd(fm.title, url, INDEX_NOTE);

  return <SinglePage doc={doc} jsonLd={graph(article, breadcrumb)} note />;
}
