import type { Metadata } from "next";
import { getCarte } from "@/lib/carte";
import { Carte } from "@/components/explore/Carte";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/carte.css";

export const metadata: Metadata = {
  title: `Carte du monde · ${SITE_TITLE}`,
  description: "Les pays dont parlent les notes du jardin, par l'histoire et par les langues.",
};

export default function CartePage() {
  return <Carte countries={getCarte()} />;
}
