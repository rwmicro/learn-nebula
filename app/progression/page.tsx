import type { Metadata } from "next";
import { Progression } from "@/components/Progression";
import { getAnkiManifest } from "@/lib/anki";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/progression.css";

// noindex: the page is a tool over the reader's own browser storage, empty
// for a crawler. Linked from /cartes/, the footer and the command palette.
export const metadata: Metadata = {
  title: `Ma progression · ${SITE_TITLE}`,
  description: "Exporter, importer ou transférer sa progression de lecture et de révision.",
  robots: { index: false },
};

export default function ProgressionPage() {
  return <Progression decks={getAnkiManifest()} />;
}
