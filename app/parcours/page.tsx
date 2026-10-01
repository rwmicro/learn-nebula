import type { Metadata } from "next";
import { getReadingPaths } from "@/lib/content";
import { ParcoursIndex } from "@/components/Parcours";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/themes.css";
import "@/assets/css/parcours.css";

export const metadata: Metadata = {
  title: `Parcours de lecture · ${SITE_TITLE}`,
  description: "Des suites de notes du jardin à lire dans l’ordre de leurs prérequis.",
};

export default function ParcoursIndexPage() {
  return <ParcoursIndex paths={getReadingPaths()} />;
}
