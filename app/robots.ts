import type { MetadataRoute } from "next";
import { absoluteURL } from "@/lib/site";

export const dynamic = "force-static";

// Everything public stays crawlable: a page that shouldn't be indexed says so
// itself (<meta name="robots" content="noindex">), which a crawler can only
// read if it may fetch the page. Disallowed here is what no search result can
// be: the backend's JSON endpoints, the owner console and the account pages,
// so crawl budget goes to the notes.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/compte/"] },
    sitemap: absoluteURL("/sitemap.xml"),
  };
}
