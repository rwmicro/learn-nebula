// /feed.xml — RSS 2.0 of the 30 notes most recently planted or re-tended.
// "Recent" is getRecentNotes()'s: frontmatter `updated` (last tended) when the
// note declares it, else its planting `date`; notes with neither are left out.
import { getAllPosts, getRecentNotes } from "@/lib/content";
import { buildRss, firstParagraph } from "@/lib/feed";
import { SITE_TITLE, SITE_DESCRIPTION, absoluteURL } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  // getRecentNotes() only carries the href; the bodies (already parsed and
  // cached by getAllPosts) are needed for the descriptions.
  const bodies = new Map(getAllPosts().map((p) => [`/posts/${p.slug}/`, p.body]));
  const items = getRecentNotes(30).map((n) => ({
    title: n.title,
    url: absoluteURL(n.href),
    at: n.at,
    description: firstParagraph(bodies.get(n.href) ?? ""),
  }));
  const xml = buildRss(
    {
      title: SITE_TITLE,
      link: absoluteURL("/"),
      self: absoluteURL("/feed.xml"),
      description: SITE_DESCRIPTION,
      language: "fr",
    },
    items,
  );
  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
