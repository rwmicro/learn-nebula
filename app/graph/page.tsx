import type { Metadata } from "next";
import { graphDataVersion } from "@/lib/home-data";
import { GraphLoader } from "@/components/GraphLoader";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/graph.css";

export const metadata: Metadata = {
  title: `Graphe · ${SITE_TITLE}`,
  description: "Carte interactive des notes du jardin, organisée par dossiers.",
  robots: { index: false },
};

export default function GraphPage() {
  return <GraphLoader version={graphDataVersion()} />;
}