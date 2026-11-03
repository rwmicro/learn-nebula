import type { MetadataRoute } from "next";
import { getAllPosts, getDisciplines, getReadingPaths, INDEX_NOTE } from "@/lib/content";
import { absoluteURL } from "@/lib/site";

export const dynamic = "force-static";

/** Latest of a set of dates, or undefined. */
function latest(dates: (Date | undefined)[]): Date | undefined {
  return dates
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
}

// Only the pages a search engine may index: a note tagged `noindex` stays
// out, and so do the pages whose metadata says noindex (folder and tag lists,
// flashcards, the graph, the timeline, account pages). The index note is the
// home, not a page of its own.
export default function sitemap(): MetadataRoute.Sitemap {
  const all = getAllPosts().filter(
    (p) => !p.frontmatter.noindex && p.rawPath !== INDEX_NOTE,
  );
  // `lastmod` is when the note last changed: its `updated` date when it has
  // one (re-tended), else when it was planted.
  const touched = (p: (typeof all)[number]) => p.frontmatter.updated ?? p.frontmatter.date;
  const posts = all.map((p) => ({
    url: absoluteURL(`/posts/${p.slug}/`),
    lastModified: touched(p),
  }));
  // Home reflects the freshest note so crawlers see when the garden last changed.
  const homeLastModified = latest(all.map(touched));
  const touchedAt = new Map(all.map((p) => [`/posts/${p.slug}/`, touched(p)]));
  const disciplines = getDisciplines().map((d) => ({
    url: absoluteURL(`/disciplines/${d.slug}/`),
    lastModified: latest(d.sections.flatMap((s) => s.notes.map((n) => touchedAt.get(n.href)))),
  }));
  const pages = [
    { url: absoluteURL("/notes/"), lastModified: homeLastModified },
    { url: absoluteURL("/themes/") },
    { url: absoluteURL("/jardin/") },
    { url: absoluteURL("/carte/") },
    { url: absoluteURL("/donnees/") },
    { url: absoluteURL("/echecs/") },
    ...disciplines,
  ];
  const paths = getReadingPaths();
  const parcours = paths.length
    ? [
        { url: absoluteURL("/parcours/") },
        ...paths.map((p) => ({ url: absoluteURL(`/parcours/${p.slug}/`) })),
      ]
    : [];
  return [
    { url: absoluteURL("/"), lastModified: homeLastModified },
    ...pages,
    ...parcours,
    ...posts,
  ];
}
