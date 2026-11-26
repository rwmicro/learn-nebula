// "Un graphique, trois paragraphes": short notes built around one figure,
// Our World in Data's "Daily Data Insight" format. A note opts in with
// `format: graphique` in its frontmatter; the home lists the latest ones
// (components/explore/Graphiques.tsx) and /graphiques.xml is their own RSS feed.
import { getAllPosts } from "./content";
import { firstParagraph } from "./feed";

export interface Graphique {
  title: string;
  href: string;
  at: Date;
  lede: string;
}

export function getGraphiques(limit = Infinity): Graphique[] {
  const out: Graphique[] = [];
  for (const d of getAllPosts()) {
    const fm = d.frontmatter as unknown as Record<string, unknown>;
    if (d.frontmatter.draft || String(fm.format ?? "").toLowerCase() !== "graphique") continue;
    const at = d.frontmatter.updated ?? d.frontmatter.date;
    if (!at) continue;
    out.push({ title: d.frontmatter.title, href: `/posts/${d.slug}/`, at, lede: firstParagraph(d.body, 220) });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
