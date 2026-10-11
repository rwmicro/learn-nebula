// /donnees/carte.json: the countries the notes are about (lib/carte.ts), the
// data behind /carte/. Documented on /donnees/.
import { getCarte } from "@/lib/carte";

export const dynamic = "force-static";

export async function GET() {
  const countries = getCarte().map(({ iso3, name, notes }) => ({ iso3, name, notes }));
  return Response.json({ licence: "CC BY-NC-SA 4.0", countries });
}
