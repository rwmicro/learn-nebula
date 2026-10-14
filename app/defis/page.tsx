import type { Metadata } from "next";
import { Defis } from "@/components/Defis";
import { getReadingPaths } from "@/lib/content";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/defis.css";

// noindex: built from the reader's own browser storage, empty for a crawler.
// Linked from the streak tiles (home, Moi).
export const metadata: Metadata = {
  title: `Défis · ${SITE_TITLE}`,
  description: "Votre série de jours et les petits défis du jour.",
  robots: { index: false },
};

export default function DefisPage() {
  const paths = getReadingPaths().map((p) => ({ slug: p.slug, slugs: p.notes.map((n) => n.slug) }));
  return <Defis paths={paths} />;
}
