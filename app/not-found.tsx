import type { Metadata } from "next";
import { getPage } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { navHtml, escapeHtml } from "@/lib/html";
import { SITE_TITLE } from "@/lib/site";
import { PagefindAssets } from "@/components/PagefindAssets";

export const metadata: Metadata = {
  title: `Page Not Found | ${SITE_TITLE}`,
  robots: { index: false, follow: true },
};

export default async function NotFound() {
  const doc = getPage("404");
  const { html } = await renderMarkdown(doc.body);
  const main =
    `<h1>${escapeHtml(doc.frontmatter.title)}</h1>` +
    html +
    `<div id="search" class="pf-search"></div>` +
    navHtml();

  return (
    <>
      <main id="main" dangerouslySetInnerHTML={{ __html: main }} />
      <PagefindAssets />
    </>
  );
}
