import { homeDataJson } from "@/lib/node/home-data";

export const dynamic = "force-static";

export async function GET() {
  return new Response(homeDataJson(), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
