// /chess-start.svg — the start position the home's chess cards show until a
// game is saved. It used to be inlined: boardSvg(START) is ~50 KB of piece
// paths, and the home carried it three times (the phone card, the desktop card
// and the RSC payload). As a file it is fetched once and cached.
import { boardSvg, START } from "@/lib/chess-play";

export const dynamic = "force-static";

export async function GET() {
  const svg = boardSvg(START).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8" } });
}
