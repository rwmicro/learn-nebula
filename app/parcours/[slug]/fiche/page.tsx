import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPost, getReadingPaths } from "@/lib/content";
import { noteExtras } from "@/lib/path-extras";
import { extractDefinitions, keyPoints } from "@/lib/path-sheet";
import { PathSheet, type SheetNote } from "@/components/PathSheet";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/fiche.css";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  const slugs = getReadingPaths().map((p) => ({ slug: p.slug }));
  return slugs.length ? slugs : [{ slug: "_" }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = getReadingPaths().find((x) => x.slug === slug);
  return {
    title: `Fiche de révision · ${p?.name ?? "Parcours"} · ${SITE_TITLE}`,
    description: p ? `Définitions, idées clés et questions des ${p.notes.length} notes du parcours « ${p.name} ».` : undefined,
    robots: { index: false, follow: true },
  };
}

export default async function Page({ params }: Params) {
  const { slug } = await params;
  const path = getReadingPaths().find((x) => x.slug === slug);
  if (!path) notFound();
  const notes: SheetNote[] = [];
  for (const n of path.notes) {
    const body = getPost(n.slug).body;
    const { quiz } = await noteExtras(n.slug);
    notes.push({
      slug: n.slug,
      title: n.title,
      href: n.href,
      definitions: extractDefinitions(body),
      keys: keyPoints(body),
      questions: quiz.map((q) => ({ q: q.q, a: q.a })),
    });
  }
  const math = notes.some((n) => n.questions.some((q) => /class="katex/.test(q.q + q.a)));
  return <PathSheet name={path.name} slug={path.slug} notes={notes} math={math} />;
}
