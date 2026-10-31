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

/** A placeholder value: a literal, or `{ $t: key }` for another message, so
 *  a name that has its own translation (a reading path's, see
 *  {@link pathNameKeys}) follows the locale inside a sentence too. The
 *  runtime swap (public/js/i18n.js) resolves it the same way. */
export type I18nVar = string | number | { $t: string; vars?: I18nVars };
export type I18nVars = Record<string, I18nVar>;

function interpolate(s: string, vars: I18nVars | undefined, locale: Locale): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => {
    const v = vars[k];
    if (v && typeof v === "object") return t(v.$t, v.vars, locale);
    return String(v ?? "");
  });
}

/** Build-time translator: resolves a key against the default-locale bundle.
 * Every server-rendered string should also carry a `data-i18n` attribute so
 * the client swap can replace it at runtime (see {@link i18nAttrs}). */
export function t(
  key: string,
  vars?: I18nVars,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const raw = lookup(BUNDLES[locale], key) ?? lookup(BUNDLES[DEFAULT_LOCALE], key) ?? key;
  return interpolate(raw, vars, locale);
}

/** Emits the `data-i18n` (and optional `data-i18n-vars`) attribute pair for
 * a server-rendered element whose textContent should be swapped at runtime. */
export function i18nAttrs(key: string, vars?: I18nVars): string {
  let s = ` data-i18n="${key}"`;
  if (vars) {
    const json = JSON.stringify(vars).replace(/"/g, "&quot;");
    s += ` data-i18n-vars="${json}"`;
  }
  return s;
}

/** i18nAttrs() for JSX: the same pair as props. Parsing the string form back
 * by hand (a local attrs() in eleven components) left three of them emitting
 * `data-i18n-vars="{&amp;quot;n&amp;quot;…"`, which the runtime swap can't
 * parse, so their counts stayed in French after a language switch. */
export function i18nProps(key: string, vars?: I18nVars): Record<string, string> {
  return vars ? { "data-i18n": key, "data-i18n-vars": JSON.stringify(vars) } : { "data-i18n": key };
}

/** For element attributes (aria-label, placeholder, alt, title). Emits a
 * data-i18n-<attr> marker; the runtime swap maps it back to setAttribute. */
export function i18nAttr(attr: string, key: string): string {
  return ` data-i18n-${attr}="${key}"`;
}

/** i18nAttr() for JSX. */
export function i18nAttrProps(attr: string, key: string): Record<string, string> {
  return { [`data-i18n-${attr}`]: key };
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

/** The i18n key of a vault folder name as shown in breadcrumbs and search
 * results: the two top groups ("Social Sciences" → "nav.socialsciences"), a
 * discipline (see {@link disciplineKey}), or null for any other folder, which
 * keeps its on-disk name. */
export function folderKey(name: string): string | null {
  if (name === "Applied Sciences") return "nav.appliedsciences";
  if (name === "Social Sciences") return "nav.socialsciences";
  return disciplineKey(name);
}

/** The message keys of a reading path's name, by its slug: `pathName.<slug>.title`
 * ("Arabe libanais") and, when the name has one, `.sub` ("des premiers mots à
 * la culture"). Null when the bundles have no entry for the path (its vault
 * name then shows in every locale; lib/path-names.test.ts fails on that). */
export function pathNameKeys(slug: string): { title: string; sub: string | null } | null {
  const base = `pathName.${slug}`;
  if (lookup(BUNDLES[DEFAULT_LOCALE], `${base}.title`) == null) return null;
  const sub = lookup(BUNDLES[DEFAULT_LOCALE], `${base}.sub`) != null ? `${base}.sub` : null;
  return { title: `${base}.title`, sub };
}

/** A reading path's name split at its " : " ("Arabe libanais",
 * "des premiers mots à la culture"), as the vault writes it. */
export function splitPathName(name: string): [string, string] {
  const i = name.indexOf(" : ");
  return i > 0 ? [name.slice(0, i), name.slice(i + 3)] : [name, ""];
}

type PathRef = { slug: string; name: string };

/** A reading path's name in `locale`: "full" ("Arabe libanais : des premiers
 * mots à la culture"), "title" (the part before " : ") or "sub" (after it).
 * Falls back to the vault's own name. */
export function pathName(p: PathRef, part: "full" | "title" | "sub" = "full", locale: Locale = DEFAULT_LOCALE): string {
  const keys = pathNameKeys(p.slug);
  const [title, sub] = splitPathName(p.name);
  if (!keys) return part === "full" ? p.name : part === "title" ? title : sub;
  if (part === "title") return t(keys.title, undefined, locale);
  if (part === "sub") return keys.sub ? t(keys.sub, undefined, locale) : "";
  const { key, vars } = pathNameVar(p);
  return t(key, vars, locale);
}

/** What to put in a sentence's placeholder ({name} in "Suite : {name}") so
 * the path's name follows the locale at runtime too. */
export function pathNameRef(p: PathRef, part: "full" | "title" = "full"): I18nVar {
  const keys = pathNameKeys(p.slug);
  if (!keys) return part === "full" ? p.name : splitPathName(p.name)[0];
  if (part === "title") return { $t: keys.title };
  const { key, vars } = pathNameVar(p);
  return vars ? { $t: key, vars } : { $t: key };
}

function pathNameVar(p: PathRef): { key: string; vars?: I18nVars } {
  const keys = pathNameKeys(p.slug)!;
  return keys.sub
    ? { key: "parcours.fullName", vars: { title: { $t: keys.title }, sub: { $t: keys.sub } } }
    : { key: keys.title };
}

/** data-i18n props for an element showing only a reading path's name; none
 * when it has no translation. */
export function pathNameProps(p: PathRef, part: "full" | "title" | "sub" = "full"): Record<string, string> {
  const keys = pathNameKeys(p.slug);
  if (!keys) return {};
  if (part === "title") return i18nProps(keys.title);
  if (part === "sub") return keys.sub ? i18nProps(keys.sub) : {};
  const { key, vars } = pathNameVar(p);
  return i18nProps(key, vars);
}

/** pathNameProps() as an attribute string, for HTML built by hand. */
export function pathNameAttrs(p: PathRef, part: "full" | "title" | "sub" = "full"): string {
  return Object.entries(pathNameProps(p, part))
    .map(([k, v]) => ` ${k}="${v.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`)
    .join("");
}
