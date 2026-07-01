import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnkiManifest, getAnkiDeck } from "@/lib/anki";
import { Flashcards } from "@/components/Flashcards";
import { SITE_TITLE } from "@/lib/site";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAnkiManifest().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const deck = getAnkiDeck(slug);
  return {
    title: `${deck?.name ?? "Cartes"} · ${SITE_TITLE}`,
    robots: { index: false },
  };
}

export default async function DeckPage({ params }: Params) {
  const { slug } = await params;
  const deck = getAnkiDeck(slug);
  if (!deck) notFound();
  return <Flashcards slug={deck.slug} name={deck.name} />;
}
