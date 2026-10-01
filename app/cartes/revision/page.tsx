import type { Metadata } from "next";
import { NoteReview } from "@/components/NoteReview";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/cartes.css";

// A static route, so it wins over app/cartes/[slug] (deck slugs never clash:
// build-anki slugs are deck names, and this is a fixed path). noindex like
// the decks: the questions live in the reader's own browser.
export const metadata: Metadata = {
  title: `Questions de notes · ${SITE_TITLE}`,
  description: "Révision espacée des questions ajoutées depuis les notes.",
  robots: { index: false },
};

export default function NoteReviewPage() {
  return (
    <>
      {/* Saved questions/answers can hold KaTeX markup from the notes. */}
      <link rel="stylesheet" href="/katex/katex.min.css" />
      <NoteReview />
    </>
  );
}
