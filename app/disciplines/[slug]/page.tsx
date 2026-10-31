import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDisciplines } from "@/lib/content";
import { DisciplinePage } from "@/components/explore/Themes";
import { disciplineKey, t } from "@/lib/i18n";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/themes.css";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  const slugs = getDisciplines().map((d) => ({ slug: d.slug }));
  // `output: "export"` refuses a dynamic route with no params (an empty
  // content/posts): one placeholder that renders as a 404, as /cartes/ does.
  return slugs.length ? slugs : [{ slug: "_" }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = getDisciplines().find((x) => x.slug === slug);
  const key = d ? disciplineKey(d.name) : null;
  const name = key ? t(key) : d?.name;
  return {
    title: `${name ?? "Discipline"} · ${SITE_TITLE}`,
    description: d ? `Les ${d.count} notes du jardin en ${name}.` : undefined,
  };
}

export default async function Page({ params }: Params) {
  const { slug } = await params;
  const discipline = getDisciplines().find((x) => x.slug === slug);
  if (!discipline) notFound();
  return <DisciplinePage discipline={discipline} />;
}
