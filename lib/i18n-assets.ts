// Message bundles as cacheable static files (/i18n/<locale>.<hash>.js).
//
// The bundles used to be inlined into every page — all five locales, ~220 KB,
// and Next copied that inline script a second time into the RSC payload, so a
// note weighed ~730 KB of which ~57 KB was the note. Now each bundle is a small
// script that registers itself on window.__i18n.bundles, named by a hash of its
// content so the server can cache it for a year (server/static-cache.ts).
//
// scripts/build-i18n.ts writes the files; app/layout.tsx emits the tags. Both
// call i18nAssetName(), so the names they compute always agree.

import crypto from "node:crypto";
import { LOCALES, getMessages, type Locale } from "./i18n";

/** The bundle's JSON, `<` escaped so it can never close a script element. */
export function bundleJson(locale: Locale): string {
  return JSON.stringify(getMessages(locale)).replace(/</g, "\\u003c");
}

/** Script body that registers one locale's messages. */
export function bundleScript(locale: Locale): string {
  return `(window.__i18n=window.__i18n||{bundles:{}}).bundles[${JSON.stringify(locale)}]=${bundleJson(locale)};\n`;
}

/** "fr.3f2a9c1d0b.js": a short content hash, so a new build never reads an old bundle. */
export function i18nAssetName(locale: Locale): string {
  const hash = crypto.createHash("sha256").update(bundleScript(locale)).digest("hex").slice(0, 10);
  return `${locale}.${hash}.js`;
}

/** Public URL of every locale's bundle, for the bootstrap's lookup table. */
export function i18nAssetUrls(): Record<Locale, string> {
  return Object.fromEntries(LOCALES.map((l) => [l, `/i18n/${i18nAssetName(l)}`])) as Record<Locale, string>;
}
