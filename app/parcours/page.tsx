import type { Metadata } from "next";
import { getAllPosts, getPost, getReadingPaths, INDEX_NOTE } from "@/lib/content";
import { ParcoursIndex, namedLevels } from "@/components/paths/Parcours";
import { ParcoursDesk } from "@/components/paths/ParcoursDesk";
import type { HeroLevels } from "@/components/paths/ParcoursDeskHero";
import { pathExtras, type PathExtras } from "@/lib/path-extras";
import { homeDataVersion } from "@/lib/home-data";
import { SITE_TITLE } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";
import "@/assets/css/themes.css";
import "@/assets/css/parcours.css";
import "@/assets/css/parcours-desk.css";

export const metadata: Metadata = pageMetadata({
  title: `Parcours de lecture · ${SITE_TITLE}`,
  description: "Des suites de notes du jardin à lire dans l’ordre de leurs prérequis.",
  path: "/parcours/",
});

export default async function ParcoursIndexPage() {
  const paths = getReadingPaths();
  const extras: Record<string, PathExtras> = {};
  for (const p of paths) extras[p.slug] = await pathExtras(p);
  // The hero's "levels fading": each path's levels, as positions.
  const levels: HeroLevels = {};
  for (const p of paths)
    levels[p.slug] = namedLevels(p, (slug) => getPost(slug).frontmatter.title).map((l) => [l.n, l.name, l.from, l.to]);
  const noteCount = getAllPosts().filter((d) => d.rawPath !== INDEX_NOTE).length;
  return (
    <ParcoursIndex
      paths={paths}
      extras={extras}
      desk={<ParcoursDesk paths={paths} extras={extras} levels={levels} noteCount={noteCount} dataVersion={homeDataVersion()} />}
    />
  );
}
