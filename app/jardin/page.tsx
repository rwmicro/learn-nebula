import type { Metadata } from "next";
import { getAllPosts, getWikiLinkEdges, INDEX_NOTE } from "@/lib/content";
import { gardenStats } from "@/lib/garden-stats";
import { GardenStats } from "@/components/GardenStats";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/jardin.css";

export const metadata: Metadata = {
  title: `Le jardin en chiffres · ${SITE_TITLE}`,
  description: "Combien de notes, de mots et de disciplines, comment le jardin a poussé et les notes les plus citées.",
};

export default function JardinPage() {
  const builtAt = new Date();
  const notes = getAllPosts()
    .filter((d) => d.rawPath !== INDEX_NOTE)
    .map((d) => ({
      slug: d.slug,
      rawPath: d.rawPath,
      title: d.frontmatter.title,
      body: d.body,
      date: d.frontmatter.date,
    }));
  return <GardenStats stats={gardenStats(notes, getWikiLinkEdges(), builtAt)} builtAt={builtAt} />;
}
