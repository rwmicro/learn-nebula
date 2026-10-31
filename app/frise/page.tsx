import type { Metadata } from "next";
import { getFriseCurve, getTimelineWithWikidata } from "@/lib/frise-data";
import { Frise } from "@/components/explore/Frise";
import { FriseCourbe } from "@/components/explore/FriseCourbe";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/frise.css";
import "@/assets/css/frise-courbe.css";

export const metadata: Metadata = {
  title: `Frise chronologique · ${SITE_TITLE}`,
  description: "Les notes du jardin qui portent sur un événement historique, triées par date.",
  robots: { index: false },
};

export default async function FrisePage() {
  const entries = await getTimelineWithWikidata();
  const curve = await getFriseCurve(entries);
  return <Frise entries={entries} before={curve && <FriseCourbe curve={curve} />} />;
}
