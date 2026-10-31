import type { Metadata } from "next";
import { getAnkiManifest } from "@/lib/anki";
import { TodayReview } from "@/components/home/TodayReview";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/cartes.css";

// A static route, so it wins over app/cartes/[slug] (deck slugs come from deck
// names; none is "aujourdhui"). noindex like the decks: the session is built
// from the reader's own browser storage.
export const metadata: Metadata = {
  title: `Tout réviser · ${SITE_TITLE}`,
  description: "Les cartes et questions à revoir aujourd’hui, tous paquets confondus.",
  robots: { index: false },
};

export default function TodayReviewPage() {
  return (
    <>
      {/* Note questions can hold KaTeX markup from the notes. */}
      <link rel="stylesheet" href="/katex/katex.min.css" />
      <TodayReview decks={getAnkiManifest()} />
    </>
  );
}
