// /donnees/figures.json: which note draws which data figure, from which
// source (lib/node/donnees.ts). Documented on /donnees/.
import { getFigures } from "@/lib/node/donnees";

export const dynamic = "force-static";

export async function GET() {
  return Response.json({ licence: "CC BY-NC-SA 4.0", figures: getFigures() });
}
