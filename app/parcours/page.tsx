import type { Metadata } from "next";
import { getReadingPaths } from "@/lib/content";
import { ParcoursIndex } from "@/components/paths/Parcours";
import { pathExtras, type PathExtras } from "@/lib/path-extras";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/themes.css";
import "@/assets/css/parcours.css";

export const metadata: Metadata = {
  title: `Parcours de lecture · ${SITE_TITLE}`,
  description: "Des suites de notes du jardin à lire dans l’ordre de leurs prérequis.",
};

export default async function ParcoursIndexPage() {
  const paths = getReadingPaths();
  const extras: Record<string, PathExtras> = {};
  for (const p of paths) extras[p.slug] = await pathExtras(p);
  return <ParcoursIndex paths={paths} extras={extras} />;
}
