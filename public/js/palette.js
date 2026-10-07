// Command palette — ⌘K / Ctrl+K, "/" (outside text fields), or any
// [data-palette-open] button (masthead, note header). Site-wide, loaded from
// app/layout.tsx as its own small bundle (scripts/bundle-js.mjs); the dialog is
// only built on first open, and /notes-index.json (?v=<content hash>, from
// <meta name="gk-notes-index">) is only fetched then too.
//
// Lists: notes (title + folder, fuzzy and accent-insensitive via
// lib/palette-match.ts), words found inside note bodies (Pagefind, the same
// static full-text index as the home search, loaded only once a query is
// typed; absent under `next dev`), the current note's sections (h2/h3),
// actions (theme, random note, assistant) and the site's index pages. ARIA combobox +
// listbox inside a modal dialog: arrows move, Enter opens (Ctrl/⌘+Enter in a
// new tab for links), Esc closes, Tab stays inside, focus returns to where it
// was.
//
// "?" (outside text fields) or the palette's "Raccourcis clavier" action
// opens a small dialog listing the site's keyboard shortcuts.
import { fold, rankItems, scoreItem } from "../../lib/palette-match";
import { downloadExport } from "../../lib/progress-transfer";

(function () {
  if (window.__palette) return;
  const doc = document;
  const root = doc.documentElement;
  const isMac = /Mac|iPhone|iPad|iPod/i.test(
    (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent,
  );

  function tt(k, vars) {
    const i18n = window.__i18n;
    let s;
    if (i18n && i18n.t) s = i18n.t(k, vars);
    else {
      const v = i18n && k.split(".").reduce((o, p) => (o ? o[p] : undefined), i18n.bundles[i18n.defaultLocale]);
      s = typeof v === "string" ? v : k;
      if (vars) s = s.replace(/\{(\w+)\}/g, (_, n) => (vars[n] != null ? String(vars[n]) : ""));
    }
    return s;
  }
  // A note's folder hint ("Mathematics › Lycée") names its discipline as on
  // disk; show it in the reader's language (the `discipline.*` keys, same
  // normalisation as disciplineKey in lib/i18n.ts).
  function folderHint(hint) {
    const parts = hint.split(" › ");
    const k =
      "discipline." +
      parts[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const label = tt(k);
    if (label && label !== k) parts[0] = label;
    return parts.join(" › ");
  }
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // Shortcut hint on the trigger buttons: ⌘K on Apple platforms.
  function syncKbd() {
    doc.querySelectorAll(".palette-kbd").forEach((k) => (k.textContent = isMac ? "⌘K" : "Ctrl K"));
  }

  // --- state ----------------------------------------------------------------
  let el = null;
  let input = null;
  let list = null;
  let statusEl = null;
  let lastFocus = null;
  let notes = null; // [{kind, title, hint, href}]
  let notesState = "idle"; // idle | loading | ready | error
  let shown = []; // flat list of rendered items
  let active = 0;
  // Full-text hits for `textQuery`: [{kind: "text", title, hint, href, excerpt}].
  let pf = null; // the pagefind.js module, once imported
  let pfState = "idle"; // idle | ready | off (no index: dev, or it failed)
  let textQuery = "";
  let textHits = [];
  let textPending = false;
  let textTimer = 0;
  let textSeq = 0;

  const ICON = {
    note: '<path d="M7 3.5h7l4 4V20.5H7z M14 3.5v4h4" />',
    section: '<path d="M5 7h14M5 12h10M5 17h12" />',
    action: '<path d="M13 3L5 13h6l-1 8 8-10h-6z" />',
    nav: '<path d="M5 12h13M13 6l6 6-6 6" />',
    text: '<path d="M4 6h16M4 10h16M4 14h10" /><circle cx="17.5" cy="17.5" r="2.5" /><path d="M19.4 19.4L21 21" />',
  };
  const icon = (k) =>
    `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

  // --- data -----------------------------------------------------------------
  function loadNotes() {
    if (notesState === "loading" || notesState === "ready") return;
    notesState = "loading";
    const v = doc.querySelector('meta[name="gk-notes-index"]');
    const url = "/notes-index.json" + (v && v.content ? "?v=" + encodeURIComponent(v.content) : "");
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data) => {
        notes = (Array.isArray(data) ? data : []).map((n) => ({
          kind: "note",
          title: String(n.title),
          hint: n.folder ? String(n.folder) : "",
          href: String(n.href),
        }));
        notesState = "ready";
        if (isOpen()) render();
      })
      .catch(() => {
        notesState = "error";
        if (isOpen()) render();
      });
  }

  // --- full-text (Pagefind) --------------------------------------------------
  const TEXT_MIN = 2;
  const TEXT_MAX = 15;

  // Pagefind's excerpt is HTML whose only markup is <mark>; rebuild it from
  // the parsed text so nothing else can slip into the list.
  function safeExcerpt(html) {
    const body = new DOMParser().parseFromString("<body>" + String(html || ""), "text/html").body;
    let out = "";
    body.childNodes.forEach((n) => {
      const t = esc(n.textContent || "");
      out += n.nodeName === "MARK" ? "<mark>" + t + "</mark>" : t;
    });
    return out;
  }

  // The best place to land: the sub-result (heading section) with the most
  // matches, when it has its own anchor; else the page itself.
  function toTextHit(d) {
    const meta = d.meta || {};
    let best = null;
    for (const s of d.sub_results || []) {
      const n = (s.locations || []).length;
      if (!best || n > best.n) best = { s, n };
    }
    const sub = best && best.s.url && best.s.url.includes("#") && best.s.title !== meta.title ? best.s : null;
    return {
      kind: "text",
      title: String(meta.title || d.url),
      hint: meta.section ? String(meta.section) : "",
      sub: sub ? String(sub.title) : "",
      href: String(sub ? sub.url : d.url),
      excerpt: safeExcerpt(sub ? sub.excerpt : d.excerpt),
    };
  }

  function searchText(q) {
    clearTimeout(textTimer);
    if (pfState === "off" || q.length < TEXT_MIN) {
      textQuery = "";
      textHits = [];
      textPending = false;
      return;
    }
    if (q === textQuery && !textPending) return;
    textPending = true;
    const seq = ++textSeq;
    textTimer = setTimeout(async () => {
      try {
        if (!pf) {
          // Variable specifier: esbuild leaves it as a runtime URL import (the
          // file only exists in a built out/, written by `pagefind --site out`).
          const mod = "/pagefind/pagefind.js";
          pf = await import(mod);
          pfState = "ready";
        }
        const res = await pf.search(q);
        const data = await Promise.all(((res && res.results) || []).slice(0, TEXT_MAX + 5).map((r) => r.data()));
        if (seq !== textSeq) return;
        textQuery = q;
        textHits = data.map(toTextHit);
      } catch {
        if (seq !== textSeq) return;
        pfState = "off";
        textHits = [];
      }
      textPending = false;
      if (isOpen()) render();
    }, 160);
  }

  const pathOf = (href) => href.replace(/#.*$/, "").replace(/\/?$/, "/");

  function sections() {
    const body = doc.querySelector(".article-body");
    if (!body) return [];
    return [...body.querySelectorAll("h2[id], h3[id]")]
      .map((h) => {
        const clone = h.cloneNode(true);
        clone.querySelectorAll(".anchor, .heading-anchor, a[aria-hidden='true']").forEach((a) => a.remove());
        const text = (clone.textContent || "").replace(/\s+/g, " ").trim();
        return text && { kind: "section", title: text, hint: h.tagName === "H3" ? "·" : "", href: "#" + h.id, level: h.tagName };
      })
      .filter(Boolean);
  }

  function themePref() {
    const v = root.getAttribute("data-theme");
    return v === "light" || v === "dark" ? v : "auto";
  }
  function setTheme(p) {
    // /js/theme.js owns the logic (storage, labels, theme:change); fall back
    // to the same steps if it hasn't loaded.
    if (window.__theme && window.__theme.set) return window.__theme.set(p);
    if (p === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", p);
    try {
      if (p === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", p);
    } catch {
      /* storage blocked */
    }
    doc.dispatchEvent(new CustomEvent("theme:change", { detail: { theme: p } }));
  }

  function randomNote() {
    const pick = () => {
      const pool = (notes || []).filter((n) => n.href !== location.pathname);
      if (!pool.length) return (location.href = "/hasard/");
      location.href = pool[Math.floor(Math.random() * pool.length)].href;
    };
    if (notesState === "ready") pick();
    else location.href = "/hasard/";
  }

  function openAssistant() {
    try {
      localStorage.setItem("gkChatPinned", "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("gk:pin-chat"));
    // Hand focus to its input once React has shown it.
    setTimeout(() => {
      const field = doc.querySelector(".gk-pinned-form input");
      if (field) field.focus();
    }, 80);
  }

  // Progress export runs right here (lib/progress-transfer.ts); importing
  // needs a file picker and a confirmation, so it goes to /progression/.
  function exportProgress() {
    const name = downloadExport();
    if (!name) location.href = "/progression/";
  }

  function actions() {
    const cur = themePref();
    const mark = (p) => (cur === p ? tt("palette.current") : "");
    return [
      { kind: "action", title: tt("palette.themeLight"), hint: mark("light"), keywords: "theme light clair jour", run: () => setTheme("light") },
      { kind: "action", title: tt("palette.themeDark"), hint: mark("dark"), keywords: "theme dark sombre nuit", run: () => setTheme("dark") },
      { kind: "action", title: tt("palette.themeAuto"), hint: mark("auto"), keywords: "theme auto systeme system", run: () => setTheme("auto") },
      { kind: "action", title: tt("palette.random"), hint: "", keywords: "hasard random aleatoire", run: randomNote },
      { kind: "action", title: tt("palette.assistant"), hint: "", keywords: "assistant ia ai question chat demander", run: openAssistant },
      { kind: "action", title: tt("palette.exportProgress"), hint: "", keywords: "exporter export progression sauvegarde backup lues cartes", run: exportProgress },
      { kind: "action", title: tt("palette.importProgress"), hint: "", keywords: "importer import progression restaurer transfert appareil", run: () => (location.href = "/progression/#importer") },
      { kind: "action", title: tt("palette.shortcuts"), hint: "?", keywords: "raccourcis clavier shortcuts keyboard aide help touches", run: () => openHelp() },
    ];
  }

  function navItems() {
    return [
      ["nav.home", "/", "accueil home"],
      ["nav.graph", "/graph/", "graphe graph carte"],
      ["nav.frise", "/frise/", "frise chronologie timeline"],
      ["nav.themes", "/themes/", "themes tags disciplines"],
      ["nav.cartes", "/cartes/", "cartes anki flashcards"],
      ["nav.parcours", "/parcours/", "parcours chemins prerequis paths"],
      ["nav.progression", "/progression/", "progression progress export import sauvegarde"],
    ]
      .filter(([, href]) => href !== location.pathname)
      .map(([k, href, kw]) => ({ kind: "nav", title: tt(k), hint: "", href, keywords: kw }));
  }

  function groups(q) {
    const out = [];
    const secs = sections();
    if (!q) {
      if (secs.length) out.push({ label: tt("palette.sections"), items: secs.slice(0, 12) });
      out.push({ label: tt("palette.actions"), items: actions() });
      out.push({ label: tt("palette.goTo"), items: navItems() });
      return out;
    }
    // Titles first; words from the text come after, minus notes the titles
    // already listed. Fewer title rows once the text has answered, so both
    // groups fit in view.
    const text = q === textQuery ? textHits : [];
    let found = [];
    if (notes) {
      found = rankItems(q, notes, text.length ? 12 : 30);
      // Scattered-letter title matches ("entropie" in "anthropologie") are a
      // last resort; once the text has real hits they are only noise.
      if (text.length) found = found.filter((n) => scoreItem(q, n, false) !== null);
      if (found.length) out.push({ label: tt("palette.notes"), items: found });
    }
    const s = rankItems(q, secs, 8);
    if (s.length) out.push({ label: tt("palette.sections"), items: s });
    const seen = new Set(found.map((n) => pathOf(n.href)));
    const t = text.filter((h) => !seen.has(pathOf(h.href))).slice(0, TEXT_MAX);
    if (t.length) out.push({ label: tt("palette.inText"), items: t });
    const a = rankItems(q, actions(), 5);
    if (a.length) out.push({ label: tt("palette.actions"), items: a });
    const n = rankItems(q, navItems(), 6);
    if (n.length) out.push({ label: tt("palette.goTo"), items: n });
    return out;
  }

  // <mark> the query's tokens in a title, when folding kept the length (it
  // does for accents; ligatures like "œ" would shift the offsets).
  function highlight(text, q) {
    const f = fold(text);
    if (!q || f.length !== text.length) return esc(text);
    const marks = new Array(text.length).fill(false);
    for (const tok of fold(q).split(/\s+/).filter(Boolean)) {
      const at = f.indexOf(tok);
      if (at >= 0) for (let i = at; i < at + tok.length; i++) marks[i] = true;
    }
    let html = "";
    let open = false;
    for (let i = 0; i < text.length; i++) {
      if (marks[i] && !open) (html += "<mark>"), (open = true);
      if (!marks[i] && open) (html += "</mark>"), (open = false);
      html += esc(text[i]);
    }
    return html + (open ? "</mark>" : "");
  }

  // --- rendering ------------------------------------------------------------
  function render() {
    const q = input.value.trim();
    // Keep the highlighted row when a group lands asynchronously above it.
    const prev = shown[active];
    const gs = groups(q);
    shown = [];
    let html = "";
    gs.forEach((g, gi) => {
      html += `<div role="group" aria-labelledby="palette-g${gi}" class="palette-group">`;
      html += `<div class="palette-group-label" id="palette-g${gi}">${esc(g.label)}</div>`;
      for (const it of g.items) {
        const i = shown.length;
        shown.push(it);
        html +=
          `<div role="option" id="palette-o${i}" class="palette-opt palette-opt--${it.kind}" data-i="${i}" aria-selected="false">` +
          `<span class="palette-opt-icon">${icon(it.kind)}</span>` +
          `<span class="palette-opt-text"><span class="palette-opt-title">${highlight(it.title, q)}</span>` +
          (it.kind === "text"
            ? `<span class="palette-opt-hint">${esc([it.hint && folderHint(it.hint), it.sub].filter(Boolean).join(" › "))}</span>` +
              (it.excerpt ? `<span class="palette-opt-excerpt">${it.excerpt}</span>` : "")
            : it.hint && it.hint !== "·"
              ? `<span class="palette-opt-hint">${esc(it.kind === "note" ? folderHint(it.hint) : it.hint)}</span>`
              : "") +
          `</span></div>`;
      }
      html += `</div>`;
    });
    let status = "";
    if (q && notesState === "loading") status = tt("palette.loading");
    else if (q && notesState === "error") status = tt("palette.loadError");
    else if (q && textPending) status = tt("palette.searchingText");
    if (!shown.length) {
      html += `<p class="palette-empty">${esc(status || tt("palette.empty"))}</p>`;
    }
    list.innerHTML = html;
    statusEl.textContent = q ? status || tt("palette.results", { n: shown.length }) : "";
    const keep = prev ? shown.indexOf(prev) : -1;
    if (keep < 0 && prev && prev.kind !== "action") {
      const same = shown.findIndex((it) => it.kind === prev.kind && it.href === prev.href);
      if (same >= 0) active = same;
    } else if (keep >= 0) active = keep;
    setActive(Math.min(active, Math.max(0, shown.length - 1)), false);
  }

  function setActive(i, scroll = true) {
    active = i;
    let cur = null;
    list.querySelectorAll(".palette-opt").forEach((o) => {
      const on = Number(o.getAttribute("data-i")) === i;
      o.setAttribute("aria-selected", on ? "true" : "false");
      if (on) cur = o;
    });
    if (cur) {
      input.setAttribute("aria-activedescendant", cur.id);
      if (scroll) cur.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }

  function run(item, newTab) {
    if (!item) return;
    if (item.run) {
      close(false);
      item.run();
      return;
    }
    if (item.href.startsWith("#")) {
      close(false);
      const target = doc.getElementById(decodeURIComponent(item.href.slice(1)));
      if (target) {
        history.pushState(null, "", item.href);
        target.scrollIntoView({ block: "start" });
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
      return;
    }
    if (newTab) {
      window.open(item.href, "_blank", "noopener");
      return;
    }
    close(false);
    location.href = item.href;
  }

  // --- dialog ---------------------------------------------------------------
  function build() {
    if (el) return;
    el = doc.createElement("div");
    el.className = "palette";
    el.hidden = true;
    el.setAttribute("data-pagefind-ignore", "all");
    el.innerHTML =
      `<div class="palette-backdrop" data-palette-close></div>` +
      `<div class="palette-panel" role="dialog" aria-modal="true" aria-labelledby="palette-title">` +
      `<h2 id="palette-title" class="sr-only"></h2>` +
      `<div class="palette-field">` +
      `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>` +
      `<input class="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">` +
      `<button type="button" class="palette-close" data-palette-close><kbd>Esc</kbd></button>` +
      `</div>` +
      `<div id="palette-list" class="palette-list" role="listbox"></div>` +
      `<div class="palette-foot"><span class="palette-status" role="status"></span><span class="palette-hint" aria-hidden="true"></span></div>` +
      `</div>`;
    doc.body.appendChild(el);
    input = el.querySelector(".palette-input");
    list = el.querySelector(".palette-list");
    statusEl = el.querySelector(".palette-status");
    label();

    input.addEventListener("input", () => {
      active = 0;
      shown = [];
      searchText(input.value.trim());
      render();
      list.scrollTop = 0;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!shown.length) return;
        const d = e.key === "ArrowDown" ? 1 : -1;
        setActive((active + d + shown.length) % shown.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        run(shown[active], e.metaKey || e.ctrlKey);
      } else if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        if (!shown.length) return;
        const d = e.key === "PageDown" ? 8 : -8;
        setActive(Math.min(shown.length - 1, Math.max(0, active + d)));
      }
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      } else if (e.key === "Tab") {
        // Focus trap: the field and the close button are the only stops.
        const stops = [input, el.querySelector(".palette-close")];
        const i = stops.indexOf(doc.activeElement);
        e.preventDefault();
        stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
      }
    });
    list.addEventListener("mousemove", (e) => {
      const o = e.target instanceof Element && e.target.closest(".palette-opt");
      if (o && Number(o.getAttribute("data-i")) !== active) setActive(Number(o.getAttribute("data-i")), false);
    });
    list.addEventListener("click", (e) => {
      const o = e.target instanceof Element && e.target.closest(".palette-opt");
      if (o) run(shown[Number(o.getAttribute("data-i"))], e.metaKey || e.ctrlKey);
    });
    el.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest("[data-palette-close]")) close(true);
    });
    // Keep focus inside if something steals it (e.g. a click on padding).
    el.addEventListener("mousedown", (e) => {
      if (e.target instanceof Element && !e.target.closest("input, button, .palette-opt")) e.preventDefault();
    });
  }

  function label() {
    if (!el) return;
    el.querySelector("#palette-title").textContent = tt("palette.title");
    input.setAttribute("placeholder", tt("palette.placeholder"));
    input.setAttribute("aria-label", tt("palette.title"));
    list.setAttribute("aria-label", tt("palette.notes"));
    el.querySelector(".palette-close").setAttribute("aria-label", tt("palette.close"));
    el.querySelector(".palette-hint").textContent = tt("palette.hint");
  }

  const isOpen = () => !!el && !el.hidden;

  function open(initial) {
    build();
    if (isOpen()) return input.focus();
    lastFocus = doc.activeElement;
    el.hidden = false;
    root.classList.add("palette-open");
    input.value = initial || "";
    active = 0;
    loadNotes();
    shown = [];
    searchText(input.value.trim());
    render();
    input.focus();
    doc.querySelectorAll("[data-palette-open]").forEach((b) => b.setAttribute("aria-expanded", "true"));
  }

  function close(restoreFocus) {
    if (!isOpen()) return;
    el.hidden = true;
    root.classList.remove("palette-open");
    doc.querySelectorAll("[data-palette-open]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    if (restoreFocus && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // --- keyboard shortcuts help ------------------------------------------------
  let help = null;
  let helpLastFocus = null;
  const kbd = (k) => `<kbd>${esc(k)}</kbd>`;
  function helpRows() {
    const mod = isMac ? "⌘" : "Ctrl";
    return [
      ["shortcuts.everywhere", [
        [[`${mod} K`, "/"], "shortcuts.openPalette"],
        [["?"], "shortcuts.help"],
        [["Esc"], "shortcuts.closeAny"],
      ]],
      ["shortcuts.paletteGroup", [
        [["↑", "↓"], "shortcuts.move"],
        [["PgUp", "PgDn"], "shortcuts.jump"],
        [["Entrée"], "shortcuts.open"],
        [[`${mod} Entrée`], "shortcuts.openTab"],
      ]],
      ["shortcuts.cards", [
        [["Espace", "Entrée"], "shortcuts.flip"],
        [["1", "2", "3", "4"], "shortcuts.grade"],
        [["←", "→"], "shortcuts.prevNext"],
      ]],
      ["shortcuts.images", [[["←", "→"], "shortcuts.imgPrevNext"]]],
      ["shortcuts.paths", [
        [["+", "−", "0"], "shortcuts.zoom"],
        [["←", "↑", "→", "↓"], "shortcuts.pan"],
      ]],
    ];
  }
  // Key names in the reader's language where they are words.
  function keyLabel(k) {
    const words = { Entrée: "Enter", Espace: "Space" };
    if (!words[k]) return k;
    const loc = (window.__i18n && window.__i18n.locale) || root.getAttribute("lang") || "fr";
    return String(loc).startsWith("fr") ? k : words[k];
  }
  function renderHelp() {
    const body = helpRows()
      .map(
        ([g, rows]) =>
          `<section class="kbd-help-group"><h3>${esc(tt(g))}</h3><dl>` +
          rows
            .map(
              ([keys, label]) =>
                `<div class="kbd-help-row"><dt>${keys.map((k) => kbd(k.split(" ").map(keyLabel).join(" "))).join(" ")}</dt><dd>${esc(tt(label))}</dd></div>`,
            )
            .join("") +
          `</dl></section>`,
      )
      .join("");
    help.querySelector(".kbd-help-title").textContent = tt("shortcuts.title");
    help.querySelector(".kbd-help-close").setAttribute("aria-label", tt("shortcuts.close"));
    help.querySelector(".kbd-help-body").innerHTML = body;
  }
  function buildHelp() {
    if (help) return;
    help = doc.createElement("div");
    help.className = "palette kbd-help";
    help.hidden = true;
    help.setAttribute("data-pagefind-ignore", "all");
    help.innerHTML =
      `<div class="palette-backdrop" data-help-close></div>` +
      `<div class="palette-panel kbd-help-panel" role="dialog" aria-modal="true" aria-labelledby="kbd-help-title">` +
      `<div class="kbd-help-head"><h2 id="kbd-help-title" class="kbd-help-title"></h2>` +
      `<button type="button" class="palette-close kbd-help-close" data-help-close><kbd>Esc</kbd></button></div>` +
      `<div class="kbd-help-body"></div></div>`;
    doc.body.appendChild(help);
    help.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest("[data-help-close]")) closeHelp();
    });
    help.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeHelp();
      } else if (e.key === "Tab") {
        // Only one stop: the close button.
        e.preventDefault();
        help.querySelector(".kbd-help-close").focus();
      }
    });
  }
  const helpOpen = () => !!help && !help.hidden;
  function openHelp() {
    buildHelp();
    if (isOpen()) close(false);
    helpLastFocus = doc.activeElement;
    renderHelp();
    help.hidden = false;
    root.classList.add("palette-open");
    help.querySelector(".kbd-help-close").focus();
  }
  function closeHelp() {
    if (!helpOpen()) return;
    help.hidden = true;
    root.classList.remove("palette-open");
    if (helpLastFocus && helpLastFocus.focus) helpLastFocus.focus();
  }

  function editable(t) {
    return (
      t instanceof Element &&
      (t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") !== null)
    );
  }

  doc.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (isOpen()) close(true);
      else {
        closeHelp();
        open("");
      }
      return;
    }
    // "?" shows the shortcuts — unless typing.
    if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey && !isOpen() && !editable(e.target)) {
      e.preventDefault();
      if (helpOpen()) closeHelp();
      else openHelp();
      return;
    }
    // "/" opens it too, as on most sites with a search box — unless typing.
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isOpen() && !editable(e.target)) {
      e.preventDefault();
      open("");
    }
  });
  doc.addEventListener("click", (e) => {
    const btn = e.target instanceof Element && e.target.closest("[data-palette-open]");
    if (btn) {
      e.preventDefault();
      open("");
    }
  });
  doc.addEventListener("i18n:change", () => {
    label();
    if (helpOpen()) renderHelp();
    if (isOpen()) render();
  });
  doc.addEventListener("theme:change", () => {
    if (isOpen()) render();
  });
  // bfcache restore: never come back to a page with the palette still open.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      close(false);
      closeHelp();
    }
  });

  syncKbd();
  window.__palette = { open, close, help: openHelp };
})();
