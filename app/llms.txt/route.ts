// llms.txt (https://llmstxt.org/) — a curated overview for AI agents/answer
// engines, distinct from sitemap.xml (the exhaustive machine index for
// crawlers). Lists domains as a table of contents, not every note — with
// ~1000+ notes, enumerating them here would defeat the format's own point
// (reducing token waste), and there's no per-domain page to link to anyway;
// sitemap.xml is where an agent goes to actually walk the full note list.
import { getDomains } from "@/lib/content";
import { getAnkiManifest } from "@/lib/anki";
import { SITE_TITLE, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export async function GET() {
  const domains = getDomains();
  const lines = [
    `# ${SITE_TITLE}`,
    "",
    "> A personal digital-garden knowledge base — long-form notes across the applied and social sciences, mostly written in French. Content grows and is revised in place (see each page's dateModified); a note tagged `stage: seedling` is an early draft, `evergreen` is mature.",
    "",
    "## Navigate",
    `- [Home](${SITE_URL}/): full-text and taxonomy search, a RAG assistant answering only from these notes, and a browsable folder tree`,
    `- [Graph](${SITE_URL}/graph/): every note and its wikilinks, as an interactive map`,
    `- [Timeline](${SITE_URL}/frise/): notes anchored to a historical date`,
    // Only when the build actually extracted decks (the .apkg are Git LFS
    // objects and may be missing, leaving /cartes/ with nothing to list).
    ...(getAnkiManifest().length
      ? [`- [Flashcards](${SITE_URL}/cartes/): the Anki decks, grouped by vault folder, to study card by card`]
      : []),
    `- [Sitemap](${SITE_URL}/sitemap.xml): the complete, exhaustive list of note URLs`,
    "",
    "## Domains",
    ...domains
      .sort((a, b) => b.notes.length - a.notes.length)
      .map((d) => `- ${d.name} (${d.notes.length} notes)`),
    "",
    "## License",
    "Content: CC BY-NC-SA 4.0 (attribution, non-commercial, share-alike). Source code: GNU GPL.",
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
