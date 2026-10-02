import frMessages from "../messages/fr.json";
import enMessages from "../messages/en.json";
import esMessages from "../messages/es.json";
import zhMessages from "../messages/zh.json";
import arMessages from "../messages/ar.json";

export const LOCALES = ["fr", "en", "es", "zh", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

// Loose, structural shape: a nested string dictionary. Bundles don't have to be
// perfectly key-identical (a locale may add/omit a key without a type error) —
// t() falls back to the default locale, then the key itself, at runtime.
interface Messages {
  [key: string]: string | Messages;
}
const BUNDLES: Record<Locale, Messages> = {
  fr: frMessages,
  en: enMessages,
  es: esMessages,
  zh: zhMessages,
  ar: arMessages
};

function lookup(bundle: unknown, key: string): string | null {
  let val: unknown = bundle;
  for (const p of key.split(".")) {
    if (val && typeof val === "object" && p in (val as object)) {
      val = (val as Record<string, unknown>)[p];
    } else return null;
  }
  return typeof val === "string" ? val : null;
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** Build-time translator: resolves a key against the default-locale bundle.
 * Every server-rendered string should also carry a `data-i18n` attribute so
 * the client swap can replace it at runtime (see {@link i18nAttrs}). */
export function t(
  key: string,
  vars?: Record<string, string | number>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const raw = lookup(BUNDLES[locale], key) ?? lookup(BUNDLES[DEFAULT_LOCALE], key) ?? key;
  return interpolate(raw, vars);
}

/** Emits the `data-i18n` (and optional `data-i18n-vars`) attribute pair for
 * a server-rendered element whose textContent should be swapped at runtime. */
export function i18nAttrs(key: string, vars?: Record<string, string | number>): string {
  let s = ` data-i18n="${key}"`;
  if (vars) {
    const json = JSON.stringify(vars).replace(/"/g, "&quot;");
    s += ` data-i18n-vars="${json}"`;
  }
  return s;
}

/** For element attributes (aria-label, placeholder, alt, title). Emits a
 * data-i18n-<attr> marker; the runtime swap maps it back to setAttribute. */
export function i18nAttr(attr: string, key: string): string {
  return ` data-i18n-${attr}="${key}"`;
}

export function getMessages(locale: Locale): Messages {
  return BUNDLES[locale];
}

/** The `discipline.*` key of a discipline display name ("Philosophy",
 * "Languages & Dialects", "Échecs" → "discipline.philosophy",
 * "discipline.languagesdialects", "discipline.echecs"), or null when the
 * bundles have no translation for it (callers then show the name as is). */
export function disciplineKey(name: string): string | null {
  const k = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const key = `discipline.${k}`;
  return k && lookup(BUNDLES[DEFAULT_LOCALE], key) != null ? key : null;
}
