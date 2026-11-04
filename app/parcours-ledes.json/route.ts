// /parcours-ledes.json — {slug: opening sentence} for every note a reading
// path holds, emitted once at build. The desktop /parcours/ hero shows the
// next note's opening under its title (components/paths/ParcoursDeskHero.tsx);
// fetched when the hero has a note to show rather than serialised into the
// page, which would carry the whole map for one line.
import { getPost, getReadingPaths } from "@/lib/content";
import { extractPlain } from "@/lib/markdown";
import { openingParagraph } from "@/lib/home-picks";

export const dynamic = "force-static";

function excerpt(plain: string, max = 170): string {
  const text = plain.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).replace(/[\s,;:.–—-]+$/, "")}…`;
}

export async function GET() {
  const out: Record<string, string> = {};
  for (const p of getReadingPaths())
    for (const n of p.notes) {
      if (n.slug in out) continue;
      const doc = getPost(n.slug);
      // The opening sentence reads better than `description:`, often a list.
      const lede = extractPlain(openingParagraph(doc.body, 80)) || doc.frontmatter.description?.trim();
      if (lede) out[n.slug] = excerpt(lede);
    }
  return new Response(JSON.stringify(out), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
