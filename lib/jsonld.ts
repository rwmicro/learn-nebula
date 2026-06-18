import { SITE_URL, SITE_TITLE, SAME_AS, AUTHOR } from "./site";

/** Wrap several JSON-LD nodes in a single @graph document. */
export function graph(...items: Record<string, unknown>[]): Record<string, unknown> {
  return { "@context": "https://schema.org", "@graph": items };
}

export function personJsonLd(): Record<string, unknown> {
  return {
    "@type": "Person",
    name: AUTHOR,
    url: `${SITE_URL}/`,
    ...(SAME_AS.length ? { sameAs: SAME_AS } : {}),
  };
}

/** WebSite node with a SearchAction (enables Google's sitelinks search box). */
export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    name: SITE_TITLE,
    url: `${SITE_URL}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** BreadcrumbList: Home → note. Folders are omitted (no page to link), so every
 * ListItem has an `item` and the data stays valid for rich results. */
export function breadcrumbJsonLd(
  title: string,
  url: string,
  homeName: string,
): Record<string, unknown> {
  const crumbs = [
    { name: homeName, item: `${SITE_URL}/` },
    { name: title, item: url },
  ];
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.item,
    })),
  };
}
