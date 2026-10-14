import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnkiManifest } from "@/lib/anki";
import { TodayReview } from "@/components/TodayReview";
import { PRACTICE_MODES, type PracticeMode } from "@/lib/practice";
import { t } from "@/lib/i18n";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/cartes.css";

type Params = { params: Promise<{ mode: string }> };

export function generateStaticParams() {
  return PRACTICE_MODES.map((mode) => ({ mode }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mode } = await params;
  return { title: `${t(`practice.${mode}`)} · ${SITE_TITLE}`, robots: { index: false } };
}

export default async function PracticePage({ params }: Params) {
  const { mode } = await params;
  if (!(PRACTICE_MODES as readonly string[]).includes(mode)) notFound();
  return (
    <>
      <link rel="stylesheet" href="/katex/katex.min.css" />
      <TodayReview decks={getAnkiManifest()} mode={mode as PracticeMode} />
    </>
  );
}
