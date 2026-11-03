// Theme picker (auto, light, paper, dark, black). The palette itself is pure CSS
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

  // Two of the choices are a light or dark theme on another paper:
  // "paper" (warm, like a book) and "black" (pure black, for OLED screens).
  // <html data-theme> keeps saying light/dark for everything that only asks
  // that; <html data-paper> picks the paper (global.css).
  const PAPERS = { paper: "light", black: "dark" };
  const CHOICES = ["light", "dark", "paper", "black"];

  /** The reader's explicit choice, or "auto" when the OS decides. */
  function pref() {
    const paper = root.getAttribute("data-paper");
    if (paper && PAPERS[paper]) return paper;
    const v = root.getAttribute("data-theme");
    return v === "light" || v === "dark" ? v : "auto";
  }

  /** Puts a choice on <html>. */
  function apply(p) {
    const base = PAPERS[p] || p;
    if (base === "light" || base === "dark") root.setAttribute("data-theme", base);
    else root.removeAttribute("data-theme");
    if (PAPERS[p]) root.setAttribute("data-paper", p);
    else root.removeAttribute("data-paper");
  }

  function sync() {
    const p = pref();
    // "Thème : papier" / "Thème : noir" live under palette.*, beside the others.
    const label = p === "paper" ? "palette.themePaper" : p === "black" ? "palette.themeBlack" : "theme." + p;
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-haspopup", "menu");
      if (!btn.hasAttribute("aria-expanded")) btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", tt(label));
      btn.setAttribute("title", tt(label));
      // Keep /js/i18n.js able to re-translate them on a language switch.
      btn.setAttribute("data-i18n-aria-label", label);
      btn.setAttribute("data-i18n-title", label);
    });
  }

  function announce() {
    sync();
    syncMenu();
    document.dispatchEvent(new CustomEvent("theme:change", { detail: { theme: pref() } }));
  }

  function set(p) {
    if (CHOICES.indexOf(p) < 0) p = "auto";
    apply(p);
    try {
      if (p === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
    announce();
  }

  // The toggle opens a menu of the five choices (auto, light, paper, dark,
  // black), each with a swatch of its paper. Built once, on first open, and
  // placed under the button that opened it (position: fixed, flipped to stay
  // on screen). Arrow keys move between the choices; Escape, a click outside
  // or a pick closes it and hands focus back to the button.
  const MENU = ["auto", "light", "paper", "dark", "black"];
  let menu = null;
  let opener = null;

  function buildMenu() {
    const m = document.createElement("div");
    m.className = "theme-menu";
    m.setAttribute("role", "menu");
    m.setAttribute("data-pagefind-ignore", "");
    m.hidden = true;
    MENU.forEach(function (c) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("data-theme-choice", c);
      b.tabIndex = -1;
      const sw = document.createElement("span");
      sw.className = "theme-swatch theme-swatch-" + c;
      sw.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.setAttribute("data-i18n", "noteApp.theme_" + c);
      label.textContent = tt("noteApp.theme_" + c);
      const check = document.createElement("span");
      check.className = "theme-check";
      check.setAttribute("aria-hidden", "true");
      b.append(sw, label, check);
      m.appendChild(b);
    });
    document.body.appendChild(m);
    return m;
  }

  function items() {
    return menu ? Array.prototype.slice.call(menu.querySelectorAll("[data-theme-choice]")) : [];
  }

  function syncMenu() {
    const p = pref();
    items().forEach(function (b) {
      b.setAttribute("aria-checked", String(b.getAttribute("data-theme-choice") === p));
      // A language switch since the menu was built.
      const l = b.querySelector("[data-i18n]");
      if (l) l.textContent = tt(l.getAttribute("data-i18n"));
    });
    if (menu) menu.setAttribute("aria-label", tt("settings.theme"));
  }

  function place(btn) {
    const r = btn.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const rtl = document.documentElement.getAttribute("dir") === "rtl";
    let left = rtl ? r.left : r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function openMenu(btn) {
    if (!menu) menu = buildMenu();
    opener = btn;
    syncMenu();
    menu.hidden = false;
    place(btn);
    btn.setAttribute("aria-expanded", "true");
    const cur = items().find(function (b) { return b.getAttribute("aria-checked") === "true"; });
    (cur || items()[0]).focus();
  }

  function closeMenu(refocus) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (opener) {
      opener.setAttribute("aria-expanded", "false");
      if (refocus) opener.focus();
    }
    opener = null;
  }

  document.addEventListener("click", function (e) {
    const t = e.target instanceof Element ? e.target : null;
    const choice = t && t.closest("[data-theme-choice]");
    if (choice) {
      set(choice.getAttribute("data-theme-choice"));
      closeMenu(true);
      return;
    }
    const btn = t && t.closest("[data-theme-toggle]");
    if (btn) {
      if (menu && !menu.hidden && opener === btn) closeMenu(false);
      else {
        closeMenu(false);
        openMenu(btn);
      }
      return;
    }
    if (menu && !menu.hidden && !(t && menu.contains(t))) closeMenu(false);
  });
  document.addEventListener("keydown", function (e) {
    if (!menu || menu.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
      return;
    }
    if (e.key === "Tab") {
      closeMenu(false);
      return;
    }
    const list = items();
    const i = list.indexOf(document.activeElement);
    let j = -1;
    if (e.key === "ArrowDown") j = (i + 1) % list.length;
    else if (e.key === "ArrowUp") j = (i - 1 + list.length) % list.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = list.length - 1;
    if (j >= 0) {
      e.preventDefault();
      list[j].focus();
    }
  });
  window.addEventListener("resize", function () { closeMenu(false); });
  window.addEventListener("scroll", function () { if (menu && !menu.hidden && opener) place(opener); }, { passive: true });
  document.addEventListener("i18n:change", syncMenu);
  // In auto mode the page already follows the OS through CSS; only the canvas
  // listeners need telling.
  media.addEventListener("change", function () {
    if (pref() === "auto") announce();
  });
  // Another tab changed the theme.
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    apply(CHOICES.indexOf(e.newValue) >= 0 ? e.newValue : "auto");
    announce();
  });

  // The command palette (/js/palette.js) sets a theme directly ("thème :
  // sombre") rather than cycling; same storage and events as a click.
  window.__theme = { set: set, pref: pref };

  sync();
})();
