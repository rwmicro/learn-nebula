import type { Metadata } from "next";
import { getAnkiManifest } from "@/lib/anki";
import { CartesIndex } from "@/components/review/CartesIndex";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/cartes-index.css";

// noindex like the decks themselves (app/cartes/[slug]): a deck is a study
// tool over notes that are already indexed, not content of its own.
export const metadata: Metadata = {
  title: `Cartes de révision · ${SITE_TITLE}`,
  description: "Les paquets Anki du jardin, rangés par dossier.",
  robots: { index: false },
};

export default function CartesPage() {
  // Empty when every .apkg is an undownloaded Git LFS stub — CartesIndex then
  // renders its "no deck" line instead of failing the build.
  return <CartesIndex decks={getAnkiManifest()} />;
}
