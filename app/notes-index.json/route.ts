// /notes-index.json — {title, href, folder} for every published note, emitted
// once at build (lib/home-data.ts). The export is static, so anything that has
// to pick a note from the URL the reader is on does it client-side from this
// list: the 404's "did you mean" suggestions (components/layout/NotFoundSuggestions.tsx),
// /hasard/'s random note and the command palette (public/js/palette.js, which
// asks for ?v=<content hash>). Titles + hrefs + folders only, to stay small;
// Pagefind is the full-text index.
import { notesIndexJson } from "@/lib/home-data";

export const dynamic = "force-static";

export async function GET() {
  return new Response(notesIndexJson(), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
