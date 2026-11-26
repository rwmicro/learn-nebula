// /palette-extra.json — disciplines, tags, PDFs and Anki decks for the command
// palette (public/js/palette.js), next to /notes-index.json. Emitted once at
// build (lib/node/home-data.ts); the palette asks for ?v=<content hash>.
import { paletteExtraJson } from "@/lib/node/home-data";

export const dynamic = "force-static";

export async function GET() {
  return new Response(paletteExtraJson(), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
