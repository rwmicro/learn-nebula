import type { Metadata } from "next";
import { SITE_TITLE, SITE_DESCRIPTION, absoluteURL } from "./site";
import { resolveVaultAsset, resolveVaultAssetByName } from "./vault-assets";
import { extractPlain, truncate } from "./markdown";
import { franc } from "franc-min";
import type { Frontmatter } from "./content";

// Used for Open Graph / Twitter when a note has no image of its own.
const DEFAULT_IMAGE = "/images/og.png";
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif)(?:$|[?#])/i;

/**
 * Absolute URL of the first image in a document, or the default OG image.
 * Recognises markdown `![alt](src)`, Obsidian embeds `![[file.png]]` and raw
 * `<img src>`, in document order; local targets must resolve to a vault image.
 */
export function firstImage(body: string): string {
  const re =
    /!\[[^\]]*\]\(([^)\s]+)[^)]*\)|!\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]|<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!raw) continue;
    if (/^https?:\/\//i.test(raw)) return raw;
    // m[2] is an embed (match by file name); the rest are relative/vault paths.
    const vault = m[2]
      ? resolveVaultAssetByName(raw)
      : resolveVaultAsset(raw, "");
    if (vault && IMG_EXT.test(vault)) return absoluteURL(vault);
  }
  return absoluteURL(DEFAULT_IMAGE);
}

interface SeoInput {
  fm: Frontmatter;
  body: string;
  path: string;
  isArticle: boolean;
}

export function buildMetadata({
  fm,
  body,
  path,
  isArticle,
}: SeoInput): Metadata {
  const title = fm.seotitle ?? `${fm.title} | ${SITE_TITLE}`;
  const plain = extractPlain(body);
  const description = truncate(plain, 160) || SITE_DESCRIPTION;
  const url = absoluteURL(path);
  const image = firstImage(body);
  // Notes are written in French or English; advertise the one actually used
  // (SinglePage runs the same detection to set <main lang>) instead of always
  // claiming fr_FR.
  const ogLocale =
    franc(plain, { only: ["fra", "eng"], minLength: 30 }) === "eng"
      ? "en_US"
      : "fr_FR";

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
      locale: ogLocale,
      images: [{ url: image, alt: title }],
      ...(isArticle && fm.date
        ? {
            publishedTime: fm.date.toISOString(),
            authors: fm.author,
            tags: fm.tags,
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
