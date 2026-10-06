// Build-time list of doubtful claims for /admin ("Faits à vérifier"):
//
//   data/facts-to-check.json — the open lines of the vault's
//   sources/a-verifier.md, grouped by the note they concern, each note link
//   resolved to its page and to its file on GitHub.
//
// The checklist lives in the vault, which scripts/fetch-notes.mjs copies whole
// (sources/ included — lib/content.ts only hides it from the site via
// IGNORE_DIRS) into content/posts/; the persistent clone under .cache/pensine
// is the fallback. Missing file → an empty report, never a failed build.
//
// Like data/prereq-suggestions.json, written to data/ (NOT out/) and served
// only through the admin-gated GET /api/admin/facts. Run with tsx so links
// resolve with the site's own lib/content.ts. Parsing: lib/facts-to-check.ts.

import fs from "node:fs";
import path from "node:path";
import { getAllPosts, resolveWikiLink } from "../lib/content";
import { groupOpenFacts, parseFactsChecklist } from "../lib/facts-to-check";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "facts-to-check.json");
const FILE = "sources/a-verifier.md";

const subdir = (process.env.NOTES_SUBDIR || "").replace(/^\/+|\/+$/g, "");
const branch = process.env.NOTES_REPO_BRANCH || "main";
// owner/repo of the vault on GitHub, from the clone URL fetch-notes.mjs uses.
const repoUrl = process.env.NOTES_REPO_URL || "https://github.com/rwmicro/pensine.git";
const repo = repoUrl.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1] ?? null;

/** Path of a vault file inside the pensine repo. */
const repoPath = (vaultPath: string) => (subdir ? `${subdir}/${vaultPath}` : vaultPath);
const editUrl = (vaultPath: string) =>
  repo
    ? `https://github.com/${repo}/edit/${branch}/${repoPath(vaultPath).split("/").map(encodeURIComponent).join("/")}`
    : null;

const cache = process.env.NOTES_CACHE_DIR || path.join(ROOT, ".cache", "pensine");
const candidates = [
  path.join(ROOT, "content", "posts", FILE),
  path.join(subdir ? path.join(cache, subdir) : cache, FILE),
];
const found = candidates.find((p) => fs.existsSync(p)) ?? null;
const md = found ? fs.readFileSync(found, "utf8") : "";

const lines = parseFactsChecklist(md);

const posts = found ? getAllPosts() : [];
const bySlug = new Map(posts.map((p) => [p.slug, p]));
const slugOfUrl = (url: string | null): string | null => {
  if (!url || !url.startsWith("/posts/")) return null;
  const s = url.slice("/posts/".length).split("#")[0].replace(/\/$/, "");
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const byNote = groupOpenFacts(lines).map((g) => {
  const url = g.target ? resolveWikiLink(g.target) : null;
  const doc = bySlug.get(slugOfUrl(url) ?? "");
  const notePath = doc ? `${doc.rawPath}.md` : null;
  return {
    target: g.target,
    title: doc?.frontmatter.title ?? g.target,
    /** Site URL, null when the link names no published note. */
    url: url && url.startsWith("/posts/") ? url : null,
    path: notePath ? repoPath(notePath) : null,
    editUrl: notePath ? editUrl(notePath) : null,
    items: g.items.map((l) => ({
      line: l.line,
      claim: l.claim,
      sources: l.sources,
      urls: l.urls,
      section: l.section,
    })),
  };
});

const done = lines.filter((l) => l.done).length;
const report = {
  generatedAt: new Date().toISOString(),
  source: {
    path: repoPath(FILE),
    found: Boolean(found),
    editUrl: editUrl(FILE),
  },
  total: lines.length,
  done,
  open: lines.length - done,
  /** Open lines whose note link resolves to no published note. */
  unresolved: byNote.filter((g) => g.target && !g.url).reduce((n, g) => n + g.items.length, 0),
  byNote,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report));
console.log(
  found
    ? `Facts to check -> data/facts-to-check.json (${report.open} open on ${byNote.length} notes, ` +
        `${done} done, ${report.unresolved} with an unresolved link)`
    : `Facts to check -> data/facts-to-check.json (no ${FILE} in the vault — empty list)`,
);
