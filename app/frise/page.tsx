import type { Metadata } from "next";
import { getTimeline } from "@/lib/content";
import { Frise } from "@/components/Frise";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/frise.css";

export const metadata: Metadata = {
  title: `Frise chronologique · ${SITE_TITLE}`,
  description: "Les notes du jardin qui portent sur un événement historique, triées par date.",
  robots: { index: false },
};

export default function FrisePage() {
  const entries = getTimeline();
  return <Frise entries={entries} />;
}
