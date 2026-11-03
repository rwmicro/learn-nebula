import type { Metadata } from "next";
import { SITE_TITLE, SITE_DESCRIPTION, FEED_ALTERNATES, absoluteURL } from "./site";
import { resolveVaultAsset, resolveVaultAssetByName } from "./vault-assets";
import { extractPlain, truncate } from "./markdown";
import { franc } from "franc-min";
import type { Frontmatter } from "./content";

// Used for Open Graph / Twitter when a note has no image of its own.
// Camille Pissarro, "Le Jardin potager à Éragny" (public/images/eragny.webp),
// resized to a 1200×630 JPEG for broad OG/Twitter compatibility.
export const DEFAULT_IMAGE = "/images/og.jpg";
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

/** "es" → "es_ES" via Intl's likely-subtags data; null for an empty/unrecognised code. */
function ogLocaleFor(lang: string | undefined): string | null {
  if (!lang) return null;
  const code = lang.trim().toLowerCase();
  if (!code) return null;
  try {
    const region = new Intl.Locale(code).maximize().region;
    return region ? `${code}_${region}` : null;
  } catch {
    return null;
  }
}

/**
 * The plain text a meta description is cut from: the body without its
 * headings. A note that opens on "## Vue d'ensemble" would otherwise lead its
 * search snippet with those two words.
 */
export function descriptionText(body: string): string {
  return extractPlain(body.replace(/^ {0,3}#{1,6}[ \t].*$/gm, ""));
}

/** A note's meta description: ~160 characters of its text without headings.
 *  A cut that lands right after a full stop keeps the stop, not "….". */
export function metaDescription(body: string): string {
  return truncate(descriptionText(body), 160).replace(/([.!?])…$/, "$1");
}

/** The note's title as the <title>: `seotitle` when set, never the site name twice. */
export function noteTitle(fm: Frontmatter): string {
  if (fm.seotitle) return fm.seotitle;
  return fm.title === SITE_TITLE ? SITE_TITLE : `${fm.title} | ${SITE_TITLE}`;
}

/** The share image a note's metadata and its Article JSON-LD both use: its
 *  own first image, else its share card, else the site-wide default. */
export function noteImage(body: string, fallbackImage?: string | null): string {
  const own = firstImage(body);
  return fallbackImage && own === absoluteURL(DEFAULT_IMAGE) ? absoluteURL(fallbackImage) : own;
}

/**
 * Metadata for a site page that isn't a note (home, lists, parcours…): a
 * self-referencing canonical URL, so a crawler that reached it with a query
 * string or without the trailing slash files it under one address, and the
 * Open Graph / Twitter tags that make a shared link show a card. Next merges
 * metadata shallowly: without this the page inherits none of them.
 */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
  image,
}: {
  title: string;
  description?: string;
  path: string;
  noindex?: boolean;
  /** Site path or absolute URL; the default share image otherwise. */
  image?: string;
}): Metadata {
  const url = absoluteURL(path);
  const img = absoluteURL(image ?? DEFAULT_IMAGE);
  const desc = description || SITE_DESCRIPTION;
  return {
    title,
    description: desc,
    alternates: { canonical: url, types: FEED_ALTERNATES },
    robots: noindex
      ? { index: false, follow: true }
      : { index: true, follow: true, "max-image-preview": "large" },
    openGraph: {
      type: "website",
      title,
      description: desc,
      url,
      siteName: SITE_TITLE,
      locale: "fr_FR",
      images: [{ url: img, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description: desc, images: [img] },
  };
}

interface SeoInput {
  fm: Frontmatter;
  body: string;
  path: string;
  isArticle: boolean;
  /** Site path of an image to use when the body has none of its own (the
   *  note's share card, lib/og.ts); else the site-wide default. */
  fallbackImage?: string | null;
}

export function buildMetadata({
  fm,
  body,
  path,
  isArticle,
  fallbackImage,
}: SeoInput): Metadata {
  const title = noteTitle(fm);
  const plain = extractPlain(body);
  const description =
    fm.description?.trim() || metaDescription(body) || SITE_DESCRIPTION;
  const url = absoluteURL(path);
  const image = noteImage(body, fallbackImage);
  // A note tagged `lang` (SinglePage sets <main lang> from the same field) is
  // substantially in that language — advertise its likely region (Intl's
  // likely-subtails data, e.g. "es" → "es_ES") instead of the fr/en guess.
  // Otherwise fall back to detecting French vs. English, since untagged notes
  // are written in one of those two.
  const ogLocale =
    ogLocaleFor(fm.lang) ??
    (franc(plain, { only: ["fra", "eng"], minLength: 30 }) === "eng"
      ? "en_US"
      : "fr_FR");

  return {
    title,
    description,
    alternates: { canonical: url, types: FEED_ALTERNATES },
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
            ...(fm.updated ? { modifiedTime: fm.updated.toISOString() } : {}),
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
