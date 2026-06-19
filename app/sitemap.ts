import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/content";
import { absoluteURL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const all = getAllPosts();
  const posts = all.map((p) => ({
    url: absoluteURL(`/posts/${p.slug}/`),
    lastModified: p.frontmatter.date,
  }));
  // Home reflects the freshest note so crawlers see when the garden last changed.
  const homeLastModified = all
    .map((p) => p.frontmatter.date)
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return [{ url: absoluteURL("/"), lastModified: homeLastModified }, ...posts];
}
