import type { Metadata } from "next";
import { getDisciplines, getTags } from "@/lib/content";
import { ThemesIndex } from "@/components/Themes";
import { SITE_TITLE } from "@/lib/site";
import "@/assets/css/themes.css";

export const metadata: Metadata = {
  title: `Thèmes · ${SITE_TITLE}`,
  description: "Les notes du jardin par discipline et par thème.",
};

export default function ThemesPage() {
  return (
    <ThemesIndex disciplines={getDisciplines()} tags={getTags()} />
  );
}
