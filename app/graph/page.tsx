import type { Metadata } from "next";
import { buildGraph } from "@/lib/graph-data";
import { CircularGraph } from "@/components/CircularGraph";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/graph.css";

export const metadata: Metadata = {
  title: `Graphe · ${SITE_TITLE}`,
  description: "Carte interactive des notes du jardin, organisée par dossiers.",
  robots: { index: false },
};

export default function GraphPage() {
  const data = buildGraph();
  return <CircularGraph data={data} />;
}