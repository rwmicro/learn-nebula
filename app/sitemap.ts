import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/content";
import { absoluteURL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts().map((p) => ({
    url: absoluteURL(`/posts/${p.slug}/`),
    lastModified: p.frontmatter.date,
  }));
  return [{ url: absoluteURL("/") }, ...posts];
}
