// /notes-index.json — {title, href} for every published note, emitted once at
// build. The export is static, so anything that has to pick a note from the
// URL the reader is on does it client-side from this list: the 404's "did you
// mean" suggestions (components/NotFoundSuggestions.tsx) and /hasard/'s random
// note. Titles + hrefs only, to stay small; Pagefind is the full-text index.
import { getAllPosts } from "@/lib/content";
import type { NoteIndexEntry } from "@/lib/note-suggest";

export const dynamic = "force-static";

export async function GET() {
  const notes: NoteIndexEntry[] = getAllPosts().map((p) => ({
    title: p.frontmatter.title,
    href: `/posts/${p.slug}/`,
  }));
  return Response.json(notes);
}
