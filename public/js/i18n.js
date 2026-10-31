// UI translation runtime.
//
// The static HTML is built in the default locale (FR). Every translatable
// element carries a `data-i18n` (text content) or `data-i18n-<attr>` marker
// pointing at a dotted key. On load, this script reads the chosen locale
// from localStorage and, if it differs from the default, walks the DOM and
// swaps each marker's content/attribute against the alt-locale bundle.
//
// Bundles are cached static files (/i18n/<locale>.<hash>.js). The bootstrap in
// app/layout.tsx loads the default one and the stored one before any module
// runs; switching to another locale loads its file on demand (setLocale).
// They land on `window.__i18n.bundles`; the default locale lives on
// `window.__i18n.defaultLocale`, the file of every locale on `.assets`.
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
  const BCP47 = { fr: "fr-FR", en: "en-US", es: "es-ES", zh: "zh-CN", ar: "ar" };
  // Right-to-left locales — drive <html dir> so Arabic actually reads correctly.
  const RTL = { ar: 1, he: 1, fa: 1, ur: 1 };

  function getLocale() {
    try {
      const saved = localStorage.getItem("locale");
      if (saved && i18n.bundles[saved]) return saved;
      // Stored but its file failed to load: stay on the default, keep the choice.
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
      const v = vars[k];
      // { $t: key }: another message, such as a reading path's name.
      if (v && typeof v === "object") return t(v.$t, v.vars);
      return v != null ? String(v) : "";
    });
  }

  function t(key, vars) {
    const locale = i18n.locale || i18n.defaultLocale;
    const bundle = i18n.bundles[locale] || i18n.bundles[i18n.defaultLocale];
    const fallback = i18n.bundles[i18n.defaultLocale];
    // `??`, not `||`, so an intentionally empty translation ("") is honoured
    // instead of falling through — matches lib/i18n.ts's resolution exactly.
    const raw = lookup(bundle, key) ?? lookup(fallback, key) ?? key;
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
    document.documentElement.setAttribute("dir", RTL[locale] ? "rtl" : "ltr");
  }

  // Loads a locale's bundle file once; resolves false if it can't.
  function loadBundle(locale) {
    if (i18n.bundles[locale]) return Promise.resolve(true);
    const src = i18n.assets && i18n.assets[locale];
    if (!src) return Promise.resolve(false);
    return new Promise(function (resolve) {
      const s = document.createElement("script");
      s.src = src;
      s.onload = function () { resolve(!!i18n.bundles[locale]); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  function setLocale(locale) {
    if (!i18n.bundles[locale]) {
      loadBundle(locale).then(function (ok) { if (ok) setLocale(locale); });
      return;
    }
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
  i18n.loadBundle = loadBundle;
  window.__i18n = i18n;

  if (i18n.locale !== i18n.defaultLocale) applyAll();
  // Announce the resolved locale even on a plain load (not just on switch), so
  // React widgets that mount before this script runs (e.g. LangSwitcher) sync
  // their active state instead of showing the default — and so <html dir> is set
  // for RTL on the very first paint of a stored non-default locale.
  document.documentElement.setAttribute("dir", RTL[i18n.locale] ? "rtl" : "ltr");
  document.dispatchEvent(
    new CustomEvent("i18n:change", { detail: { locale: i18n.locale } }),
  );
})();
