// /donnees/: the garden's own open data. What the page lists, and the one
// file it computes: the inventory of figures (which note draws which chart,
// from which source). The other files are produced elsewhere and only linked.
import { getAllPosts } from "./content";
import { EXTRA_WIDGETS } from "./widgets-extra";

export interface Figure {
  note: string;
  href: string;
  widget: string;
  /** The block's `graphe:` (an Our World in Data chart), `wikidata:`, or "". */
  source: string;
}

const BLOCK = /^```widget:([\w-]+)[^\n]*\n([\s\S]*?)^```/gm;

/** Every data figure in the vault: the "data" pack's widgets (lib/widgets-extra.ts). */
export function getFigures(): Figure[] {
  const out: Figure[] = [];
  for (const d of getAllPosts()) {
    if (d.frontmatter.draft || !d.body.includes("```widget:")) continue;
    for (const m of d.body.matchAll(BLOCK)) {
      const widget = m[1];
      if (EXTRA_WIDGETS[widget]?.pack !== "data") continue;
      const prop = (k: string) => new RegExp(`^${k}\\s*:\\s*(.+)$`, "m").exec(m[2])?.[1].trim() ?? "";
      const g = prop("graphe");
      const q = prop("wikidata");
      out.push({
        note: d.frontmatter.title,
        href: `/posts/${d.slug}/`,
        widget,
        source: g ? `https://ourworldindata.org/grapher/${g}` : q ? `https://www.wikidata.org/wiki/${q}` : "",
      });
    }
  }
  return out.sort((a, b) => a.href.localeCompare(b.href));
}

/** The files /donnees/ documents, in the order it lists them. `key` names
 *  the i18n strings (donnees.file_<key>). */
export const DATA_FILES = [
  { key: "notes", href: "/notes-index.json", format: "JSON" },
  { key: "graph", href: "/graph-data.json", format: "JSON" },
  { key: "carte", href: "/donnees/carte.json", format: "JSON" },
  { key: "frise", href: "/donnees/frise.json", format: "JSON" },
  { key: "figures", href: "/donnees/figures.json", format: "JSON" },
  { key: "ipc", href: "/donnees/ipc-france.json", format: "JSON" },
  { key: "feed", href: "/feed.xml", format: "RSS" },
  { key: "llms", href: "/llms.txt", format: "texte" },
] as const;

/** Third-party data the figures are built from, with their licences. */
export const DATA_SOURCES = [
  { name: "Our World in Data", href: "https://ourworldindata.org/", licence: "CC BY 4.0", key: "owid" },
  { name: "Insee (BDM)", href: "https://www.insee.fr/fr/statistiques/serie/000008965", licence: "Licence Ouverte 2.0", key: "insee" },
  { name: "Wikidata", href: "https://www.wikidata.org/", licence: "CC0", key: "wikidata" },
  { name: "Lichess open database", href: "https://database.lichess.org/", licence: "CC0", key: "lichess" },
  { name: "Natural Earth", href: "https://www.naturalearthdata.com/", licence: "Domaine public", key: "naturalearth" },
] as const;
