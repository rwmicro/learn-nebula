import type { Metadata } from "next";
import { getDisciplines, getTags } from "@/lib/content";
import { ThemesIndex } from "@/components/explore/Themes";
import { SITE_TITLE } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";
import "@/assets/css/themes.css";

export const metadata: Metadata = pageMetadata({
  title: `Thèmes · ${SITE_TITLE}`,
  description: "Les notes du jardin par discipline et par thème.",
  path: "/themes/",
});

export default function ThemesPage() {
  return (
    <ThemesIndex disciplines={getDisciplines()} tags={getTags()} />
  );
}
