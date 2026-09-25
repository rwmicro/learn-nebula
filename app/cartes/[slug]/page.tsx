import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAnkiManifest, getAnkiDeck } from "@/lib/anki";
import { Flashcards } from "@/components/Flashcards";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/cartes.css";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  const decks = getAnkiManifest().map((d) => ({ slug: d.slug }));
  // `output: "export"` refuses a dynamic route with no params at all. With no
  // decks (e.g. every .apkg is an undownloaded Git LFS stub), emit one
  // placeholder that renders as a 404 instead of failing the whole build.
  return decks.length ? decks : [{ slug: "_" }];
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
