import { getAllPosts } from "@/lib/content";
import { extractPlain, truncate } from "@/lib/markdown";
import { SITE_URL, SITE_TITLE, SITE_DESCRIPTION, AUTHOR } from "@/lib/site";
// Escapes & < > " — enough for XML text nodes and double-quoted attributes.
// Shared with the HTML builders rather than re-implemented here.
import { escapeHtml as esc } from "@/lib/escape";

// Pre-rendered to a static out/feed.xml at build (output: export).
export const dynamic = "force-static";

export function GET() {
  const posts = getAllPosts()
    .filter((p) => p.frontmatter.date)
    .slice(0, 30);
  const updated = (posts[0]?.frontmatter.date ?? new Date()).toISOString();

  const entries = posts
    .map((p) => {
      const url = `${SITE_URL}/posts/${p.slug}/`;
      return (
        `  <entry>\n` +
        `    <title>${esc(p.frontmatter.title)}</title>\n` +
        `    <link href="${esc(url)}"/>\n` +
        `    <id>${esc(url)}</id>\n` +
        `    <updated>${p.frontmatter.date!.toISOString()}</updated>\n` +
        `    <summary>${esc(truncate(extractPlain(p.body), 300))}</summary>\n` +
        `  </entry>`
      );
    })
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom">\n` +
    `  <title>${esc(SITE_TITLE)}</title>\n` +
    `  <subtitle>${esc(SITE_DESCRIPTION)}</subtitle>\n` +
    `  <link href="${SITE_URL}/feed.xml" rel="self"/>\n` +
    `  <link href="${SITE_URL}/"/>\n` +
    `  <id>${SITE_URL}/</id>\n` +
    `  <updated>${updated}</updated>\n` +
    `  <author><name>${esc(AUTHOR)}</name></author>\n` +
    `${entries}\n` +
    `</feed>\n`;

  return new Response(xml, {
    headers: { "content-type": "application/atom+xml; charset=utf-8" },
  });
}
