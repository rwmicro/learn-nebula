import { graphDataJson } from "@/lib/home-data";

export const dynamic = "force-static";

export async function GET() {
  return new Response(graphDataJson(), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
