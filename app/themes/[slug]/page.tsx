import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTags } from "@/lib/content";
import { TagPage } from "@/components/Themes";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/themes.css";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  const slugs = getTags().map((g) => ({ slug: g.slug }));
  // `output: "export"` refuses a dynamic route with no params (an empty
  // content/posts): one placeholder that renders as a 404, as /cartes/ does.
  return slugs.length ? slugs : [{ slug: "_" }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const tag = getTags().find((g) => g.slug === slug);
  return {
    title: `${tag?.name ?? "Thème"} · ${SITE_TITLE}`,
    // A list of links to notes that are indexed themselves: useful to
    // readers, thin to a search engine.
    robots: { index: false },
  };
}

export default async function ThemePage({ params }: Params) {
  const { slug } = await params;
  const tag = getTags().find((g) => g.slug === slug);
  if (!tag) notFound();
  return <TagPage tag={tag} />;
}
