// Build-time draft of `prerequis:` edges for /admin ("Prérequis suggérés"):
//
//   data/prereq-suggestions.json — for each note, the notes it links to that
//   look like prerequisites it doesn't list yet, ranked, with the reason and
//   a ready-to-paste frontmatter line.
//
// Like data/vault-health.json, written to data/ (NOT out/) and served only
// through the admin-gated GET /api/admin/prereq-suggestions. Run with tsx so
// link targets resolve with the site's own lib/content.ts. Heuristics live in
// lib/prereq-suggest.ts (unit-tested).

import fs from "node:fs";
import path from "node:path";
import {
  getAllPosts,
  getPrereqEdges,
  getReadingPaths,
  resolveRelativeNoteLink,
  resolveWikiLink,
} from "../lib/content";
import { parsePrereqField } from "../lib/prereq-graph";
import {
  prereqYaml,
  scanLinks,
  suggestPrereqs,
  type SuggestNote,
} from "../lib/prereq-suggest";

const OUT = path.join(process.cwd(), "data", "prereq-suggestions.json");

const slugOfUrl = (url: string | null): string | null => {
  if (!url || !url.startsWith("/posts/")) return null;
  const s = url.slice("/posts/".length).split("#")[0].replace(/\/$/, "");
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const posts = getAllPosts();
const published = new Set(posts.map((p) => p.slug));

const notes: SuggestNote[] = posts.map((doc) => {
  const dir = doc.rawPath.includes("/")
    ? doc.rawPath.slice(0, doc.rawPath.lastIndexOf("/"))
    : "";
  const title = doc.frontmatter.title;
  const base = doc.rawPath.split("/").pop() ?? doc.rawPath;
  // Shortest wikilink spelling that still lands on this note.
  const linkName =
    [title, base, doc.rawPath].find(
      (n) => slugOfUrl(resolveWikiLink(n)) === doc.slug,
    ) ?? doc.rawPath;
  const fm = doc.frontmatter as unknown as Record<string, unknown>;
  const links: SuggestNote["links"] = [];
  for (const l of scanLinks(doc.body)) {
    const url =
      l.kind === "wikilink"
        ? resolveWikiLink(l.target)
        : resolveRelativeNoteLink(dir, l.target);
    const slug = slugOfUrl(url);
    if (slug && published.has(slug))
      links.push({ slug, intro: l.intro, cue: l.cue });
  }
  return {
    slug: doc.slug,
    title,
    rawPath: doc.rawPath,
    linkName,
    prereqTargets: parsePrereqField(fm.prerequis ?? fm.prerequisites),
    links,
  };
});

const paths = getReadingPaths().map((p) => ({
  slug: p.slug,
  name: p.name,
  notes: p.notes.map((n) => n.slug),
}));
const { suggestions, stats } = suggestPrereqs(notes, getPrereqEdges(), paths);

const bySlug = new Map(notes.map((n) => [n.slug, n]));
const groups = new Map<string, typeof suggestions>();
for (const s of suggestions)
  groups.set(s.note, [...(groups.get(s.note) ?? []), s]);

const report = {
  generatedAt: new Date().toISOString(),
  notes: notes.length,
  total: suggestions.length,
  /** Suggestions touching a note already in a /parcours/ path. */
  joinPath: suggestions.filter((s) => s.path).length,
  /** The others: they would grow a pair or start a new path. */
  newPath: suggestions.filter((s) => !s.path).length,
  excluded: stats,
  byNote: [...groups.entries()]
    .map(([slug, list]) => {
      const n = bySlug.get(slug)!;
      return {
        slug,
        title: n.title,
        existing: n.prereqTargets,
        /** Every suggestion for this note at once. */
        yamlAll: prereqYaml([
          ...n.prereqTargets,
          ...list.map((s) => bySlug.get(s.prereq)!.linkName),
        ]),
        best: Math.max(...list.map((s) => s.confidence)),
        suggestions: list.map((s) => ({
          slug: s.prereq,
          title: bySlug.get(s.prereq)!.title,
          confidence: s.confidence,
          reasons: s.reasons,
          yaml: s.yaml,
          path: s.path,
        })),
      };
    })
    .sort((a, b) => b.best - a.best || a.title.localeCompare(b.title, "fr")),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report));
console.log(
  `Prereq suggestions -> data/prereq-suggestions.json (${report.total} suggestions on ` +
    `${report.byNote.length} notes: ${report.joinPath} extend an existing path, ${report.newPath} new; ` +
    `left out: ${stats.already} already listed, ${stats.implied} implied, ${stats.cycle} would cycle, ` +
    `${stats.reverse} two-way)`,
);
