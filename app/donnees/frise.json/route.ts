// /donnees/frise.json: every dated note (frontmatter `year`, or its Wikidata
// item), the data behind /frise/. Documented on /donnees/.
import { getTimelineWithWikidata } from "@/lib/frise-data";

export const dynamic = "force-static";

export async function GET() {
  return Response.json({ licence: "CC BY-NC-SA 4.0", entries: await getTimelineWithWikidata() });
}
