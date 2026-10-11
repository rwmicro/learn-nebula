// /donnees/ipc-france.json: the chained French consumer price index the
// franc-euro conversions use (scripts/update-ipc.mjs). Documented on /donnees/.
import ipc from "@/lib/data/ipc-france.json";

export const dynamic = "force-static";

export async function GET() {
  return Response.json({ licence: "Licence Ouverte 2.0 (Insee)", ...ipc });
}
