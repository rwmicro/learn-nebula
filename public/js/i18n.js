// UI translation runtime.
//
// The static HTML is built in the default locale (FR). Every translatable
// element carries a `data-i18n` (text content) or `data-i18n-<attr>` marker
// pointing at a dotted key. On load, this script reads the chosen locale
// from localStorage and, if it differs from the default, walks the DOM and
// swaps each marker's content/attribute against the alt-locale bundle.
//
// Both bundles are inlined into the page at build time by app/layout.tsx,
// available as `window.__i18n.bundles.{fr,en}`. The default locale lives on
// `window.__i18n.defaultLocale`.
//
// Vanilla JS modules (audio.js, comments.js, …) read their dynamic labels
// through `window.__i18n.t(key, vars?)`, which always resolves against the
// *currently active* locale.
(function () {
  const i18n = window.__i18n || {};
  if (!i18n.bundles) return;

  const ATTR_KEYS = [
    "aria-label",
    "placeholder",
    "alt",
    "title",
    "aria-describedby",
  ];

  // Map UI locale codes to BCP-47 tags for Intl date formatting. Unknown codes
  // fall back to the code itself, so adding a locale needs no change here.
  const BCP47 = { fr: "fr-FR", en: "en-US", es: "es-ES", zh: "zh-CN" };

  function getLocale() {
    try {
      const saved = localStorage.getItem("locale");
      if (saved && i18n.bundles[saved]) return saved;
    } catch {
      /* localStorage unavailable */
    }
    return i18n.defaultLocale;
  }

  function lookup(bundle, key) {
    let val = bundle;
    for (const p of key.split(".")) {
      if (val && typeof val === "object" && p in val) val = val[p];
      else return null;
    }
    return typeof val === "string" ? val : null;
  }

  function interpolate(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : "";
    });
  }

  function t(key, vars) {
    const locale = i18n.locale || i18n.defaultLocale;
    const bundle = i18n.bundles[locale] || i18n.bundles[i18n.defaultLocale];
    const fallback = i18n.bundles[i18n.defaultLocale];
    const raw = lookup(bundle, key) || lookup(fallback, key) || key;
    return interpolate(raw, vars);
  }

  function readVars(el) {
    const raw = el.getAttribute("data-i18n-vars");
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  function applyAll(root) {
    root = root || document;
    // Text content
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const vars = readVars(el);
      el.textContent = t(key, vars);
    });
    // Element attributes (aria-label, placeholder, alt, …)
    for (const attr of ATTR_KEYS) {
      root
        .querySelectorAll("[data-i18n-" + attr + "]")
        .forEach(function (el) {
          const key = el.getAttribute("data-i18n-" + attr);
          if (key) el.setAttribute(attr, t(key));
        });
    }
    // Dates: reformat using Intl in the active locale.
    const locale = i18n.locale || i18n.defaultLocale;
    root.querySelectorAll("[data-i18n-date]").forEach(function (el) {
      const iso = el.getAttribute("datetime");
      if (!iso) return;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return;
      el.textContent = new Intl.DateTimeFormat(BCP47[locale] || locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(d);
    });
    // Reflect the active locale on <html lang>; pages without a manual lang
    // attribute on their <main> stay neutral so franc detection still wins.
    document.documentElement.setAttribute("lang", locale);
  }

  function setLocale(locale) {
    if (!i18n.bundles[locale]) return;
    i18n.locale = locale;
    try {
      localStorage.setItem("locale", locale);
    } catch {
      /* ignore */
    }
    applyAll();
    document.dispatchEvent(new CustomEvent("i18n:change", { detail: { locale } }));
  }

  i18n.locale = getLocale();
  i18n.t = t;
  i18n.applyAll = applyAll;
  i18n.setLocale = setLocale;
  window.__i18n = i18n;

  if (i18n.locale !== i18n.defaultLocale) applyAll();
})();
