import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReadingPaths } from "@/lib/content";
import { ParcoursPage } from "@/components/Parcours";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/themes.css";
import "@/assets/css/parcours.css";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  const slugs = getReadingPaths().map((p) => ({ slug: p.slug }));
  // `output: "export"` refuses a dynamic route with no params (a vault with no
  // `prerequis:` yet): one placeholder that renders as a 404, as /themes/ does.
  return slugs.length ? slugs : [{ slug: "_" }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = getReadingPaths().find((x) => x.slug === slug);
  return {
    title: `${p?.name ?? "Parcours"} · ${SITE_TITLE}`,
    description:
      p?.description ??
      (p
        ? `Parcours de lecture en ${p.notes.length} notes : ${p.notes.map((n) => n.title).join(", ")}.`
        : undefined),
  };
}

export default async function Page({ params }: Params) {
  const { slug } = await params;
  const path = getReadingPaths().find((x) => x.slug === slug);
  if (!path) notFound();
  return <ParcoursPage path={path} />;
}
