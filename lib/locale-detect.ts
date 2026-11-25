// Which UI language a first-time reader gets, from their browser and system.
//
// The static HTML is built in French. The <head> bootstrap (app/layout.tsx)
// runs `detectLocale` on navigator.languages (the order the reader set in
// their browser or phone, the same list the browser sends as Accept-Language)
// followed by the system's own locale (Intl), and loads that bundle, unless
// the reader already picked a language: an explicit choice in localStorage
// ("locale", written by setLocale) always wins, and a detected language is
// never stored, so it follows the system if that changes later.
//
// The bootstrap inlines this function's source (`detectLocale.toString()`),
// so it must stay self-contained: no import, no helper outside its body, and
// syntax every browser of the site parses. lib/locale-detect.test.ts runs it
// both directly and from that string.

/**
 * The first supported locale the reader's languages name, then, when none
 * does, the one their country speaks ("ca-ES" → es, "jv-ID" → id), else
 * `fallback`.
 *
 * - Each tag is matched on its language, whatever the region or script:
 *   "fr-CA", "en-GB", "zh-Hant-TW", "es-419" all match.
 * - Old and alternative codes count: "in" (Indonesian on older Android),
 *   "cmn"/"yue" (Mandarin, Cantonese), "arb"…, and "pt_BR"-style underscores.
 * - Languages come before countries: ["jv-ID", "en-US"] gives en, because
 *   the reader listed English, rather than Indonesian, which they did not.
 */
export function detectLocale(
  languages: readonly (string | null | undefined)[] | null | undefined,
  supported: readonly string[],
  fallback: string,
): string {
  const ALIAS: Record<string, string> = {
    in: "id", ind: "id",
    cmn: "zh", yue: "zh", wuu: "zh", hak: "zh", nan: "zh", zho: "zh", chi: "zh",
    arb: "ar", ara: "ar", ary: "ar", arz: "ar", apc: "ar", acm: "ar", ajp: "ar", aeb: "ar", arq: "ar",
    fra: "fr", fre: "fr", eng: "en", spa: "es",
  };
  // Countries where a reader whose own language the site lacks most likely
  // reads one it has. Countries split between two of them (Canada, Belgium,
  // Switzerland…) are left out: the fallback is better than a guess.
  const REGIONS: Record<string, string> = {
    ID: "id",
    CN: "zh", TW: "zh", HK: "zh", MO: "zh", SG: "zh",
    SA: "ar", AE: "ar", EG: "ar", MA: "ar", DZ: "ar", TN: "ar", LY: "ar", JO: "ar", LB: "ar",
    SY: "ar", IQ: "ar", KW: "ar", QA: "ar", BH: "ar", OM: "ar", YE: "ar", SD: "ar", PS: "ar", MR: "ar",
    ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", GT: "es", CU: "es",
    BO: "es", DO: "es", HN: "es", PY: "es", SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es",
    GQ: "es",
    FR: "fr", MC: "fr", SN: "fr", CI: "fr", ML: "fr", BF: "fr", NE: "fr", BJ: "fr", TG: "fr", GN: "fr",
    CD: "fr", CG: "fr", GA: "fr", CM: "fr", MG: "fr", HT: "fr", RE: "fr", GP: "fr", MQ: "fr", GF: "fr",
    NC: "fr", PF: "fr",
    US: "en", GB: "en", IE: "en", AU: "en", NZ: "en", IN: "en", PH: "en", NG: "en", KE: "en", GH: "en",
    ZA: "en", JM: "en",
  };
  const tags: { lang: string; region: string }[] = [];
  const list = languages || [];
  for (let i = 0; i < list.length; i++) {
    const raw = list[i];
    if (typeof raw !== "string") continue;
    // "zh-Hant-TW", "pt_BR", "sr-Latn-RS-u-nu-latn": language, then the first
    // two-letter or three-digit subtag as the region.
    const parts = raw.trim().replace(/_/g, "-").split("-");
    const first = (parts[0] || "").toLowerCase();
    if (!/^[a-z]{2,3}$/.test(first)) continue;
    let region = "";
    for (let j = 1; j < parts.length; j++) {
      const p = parts[j];
      if (p.length === 1) break; // extension ("u-", "x-")
      if (/^[a-zA-Z]{2}$/.test(p)) {
        region = p.toUpperCase();
        break;
      }
    }
    tags.push({ lang: ALIAS[first] || first, region: region });
  }
  for (let i = 0; i < tags.length; i++) {
    if (supported.indexOf(tags[i].lang) !== -1) return tags[i].lang;
  }
  for (let i = 0; i < tags.length; i++) {
    const l = REGIONS[tags[i].region];
    if (l && supported.indexOf(l) !== -1) return l;
  }
  return fallback;
}

/**
 * Is this browser a crawler or an automated one? Those keep the default
 * locale: a search engine would otherwise index the French site in English
 * (Googlebot renders pages as en-US), and screenshots stay in French.
 */
export function isAutomatedBrowser(nav: { webdriver?: boolean; userAgent?: string }): boolean {
  return !!nav.webdriver || /bot|crawl|spider|slurp|facebookexternalhit|lighthouse|headless/i.test(nav.userAgent || "");
}
