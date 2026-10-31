import type { Metadata } from "next";
import { getAnkiManifest } from "@/lib/anki";
import { Entrainer } from "@/components/review/Entrainer";
import { familyOfFolder } from "@/lib/path-family";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/defis.css";

// noindex: built from the reader's own browser storage.
export const metadata: Metadata = {
  title: `S’entraîner · ${SITE_TITLE}`,
  description: "Quand les révisions du jour sont faites, de quoi aller plus loin.",
  robots: { index: false },
};

export default function EntrainerPage() {
  const decks = getAnkiManifest().map((d) => ({ slug: d.slug, langues: familyOfFolder(d.folder) === "langues" }));
  return <Entrainer decks={decks} />;
}
