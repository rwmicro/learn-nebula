import type { Metadata } from "next";
import { SITE_TITLE, SITE_DESCRIPTION, absoluteURL } from "./site";
import { resolveVaultAsset } from "./vault-assets";
import { extractPlain, truncate } from "./markdown";
import type { Frontmatter } from "./content";

// Used for Open Graph / Twitter when a note has no image of its own.
const DEFAULT_IMAGE = "/images/og.png";

/** Absolute URL of the first image in a document, or the site icon as fallback. */
export function firstImage(body: string): string {
  const md = body.match(/!\[[^\]]*\]\(([^)]+)\)/);
  const src = md?.[1]?.trim();
  if (src) {
    if (/^https?:\/\//i.test(src)) return src;
    const vault = resolveVaultAsset(src, "");
    if (vault) return absoluteURL(vault);
  }
  return absoluteURL(DEFAULT_IMAGE);
}

interface SeoInput {
  fm: Frontmatter;
  body: string;
  path: string;
  isArticle: boolean;
}

export function buildMetadata({ fm, body, path, isArticle }: SeoInput): Metadata {
  const title = fm.seotitle ?? `${fm.title} | ${SITE_TITLE}`;
  const description = truncate(extractPlain(body), 160) || SITE_DESCRIPTION;
  const url = absoluteURL(path);
  const image = firstImage(body);

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: fm.noindex
      ? { index: false, follow: true }
      : { index: true, follow: true, "max-image-preview": "large" },
    openGraph: {
      type: isArticle ? "article" : "website",
      title,
      description,
      url,
      siteName: SITE_TITLE,
      locale: "fr_FR",
      images: [{ url: image, alt: title }],
      ...(isArticle && fm.date
        ? {
            publishedTime: fm.date.toISOString(),
            modifiedTime: fm.date.toISOString(),
            authors: fm.author,
            tags: fm.tags,
          }
        : {}),
    },
    twitter: { card: "summary", title, description, images: [image] },
  };
}
