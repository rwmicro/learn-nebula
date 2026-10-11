// /graphiques.xml — RSS 2.0 of the "un graphique, trois paragraphes" notes
// (lib/graphiques.ts), newest first, for readers who want only those.
import { getGraphiques } from "@/lib/graphiques";
import { buildRss } from "@/lib/feed";
import { SITE_TITLE, absoluteURL } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  const xml = buildRss(
    {
      title: `${SITE_TITLE} · un graphique, trois paragraphes`,
      link: absoluteURL("/"),
      self: absoluteURL("/graphiques.xml"),
      description: "Une figure et ce qu'elle montre, en trois paragraphes.",
      language: "fr",
    },
    getGraphiques(30).map((g) => ({ title: g.title, url: absoluteURL(g.href), at: g.at, description: g.lede })),
  );
  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
