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
