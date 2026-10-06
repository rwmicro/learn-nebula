// Light / dark / auto theme toggle. The palette itself is pure CSS
// (global.css): it follows prefers-color-scheme unless <html data-theme> pins
// one. The inline script in app/layout.tsx applies the stored choice before
// first paint; this file only wires the toggle buttons (masthead + note nav,
// markup from themeToggleHtml in lib/html.ts) and keeps their labels in sync.
// Loaded site-wide from layout.tsx. Fires `theme:change` on document so canvas
// drawings (the graph) can re-read the palette.
(function () {
  const KEY = "theme";
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  // /js/i18n.js may not have run yet (both load afterInteractive): fall back
  // to the default-locale bundle the layout inlines synchronously; i18n.js
  // re-translates through the data-i18n-* markers once it is up.
  function tt(k) {
    const i18n = window.__i18n;
    if (!i18n) return k;
    if (i18n.t) return i18n.t(k);
    const v = k.split(".").reduce((o, p) => (o ? o[p] : undefined), i18n.bundles[i18n.defaultLocale]);
    return typeof v === "string" ? v : k;
  }

  /** The reader's explicit choice, or "auto" when the OS decides. */
  function pref() {
    const v = root.getAttribute("data-theme");
    return v === "light" || v === "dark" ? v : "auto";
  }

  const osTheme = () => (media.matches ? "dark" : "light");

  // Every click changes what the reader sees, except the last one that hands
  // control back to the OS: auto → opposite of the OS → the OS's own → auto.
  function next(p) {
    const os = osTheme();
    if (p === "auto") return os === "dark" ? "light" : "dark";
    return p === os ? "auto" : os;
  }

  function sync() {
    const p = pref();
    const label = "theme." + p;
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-label", tt(label));
      btn.setAttribute("title", tt(label));
      // Keep /js/i18n.js able to re-translate them on a language switch.
      btn.setAttribute("data-i18n-aria-label", label);
      btn.setAttribute("data-i18n-title", label);
    });
  }

  function announce() {
    sync();
    document.dispatchEvent(new CustomEvent("theme:change", { detail: { theme: pref() } }));
  }

  function set(p) {
    if (p === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", p);
    try {
      if (p === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
    announce();
  }

  document.addEventListener("click", function (e) {
    const btn = e.target instanceof Element && e.target.closest("[data-theme-toggle]");
    if (btn) set(next(pref()));
  });
  // In auto mode the page already follows the OS through CSS; only the canvas
  // listeners need telling.
  media.addEventListener("change", function () {
    if (pref() === "auto") announce();
  });
  // Another tab changed the theme.
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    if (e.newValue === "light" || e.newValue === "dark") root.setAttribute("data-theme", e.newValue);
    else root.removeAttribute("data-theme");
    announce();
  });

  // The command palette (/js/palette.js) sets a theme directly ("thème :
  // sombre") rather than cycling; same storage and events as a click.
  window.__theme = { set: set, pref: pref };

  sync();
})();
