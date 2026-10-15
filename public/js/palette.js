// Command palette — ⌘K / Ctrl+K, "/" (outside text fields), or any
// [data-palette-open] button (masthead, note header). Site-wide, loaded from
// app/layout.tsx as its own small bundle (scripts/bundle-js.mjs); the dialog is
// only built on first open, and /notes-index.json (?v=<content hash>, from
// <meta name="gk-notes-index">) is only fetched then too.
//
// Lists: notes (title + folder, fuzzy and accent-insensitive via
// lib/palette-match.ts), words found inside note bodies (Pagefind, the same
// static full-text index, loaded only once a query is typed; absent under
// `next dev`), disciplines and tags with a page, PDF attachments and Anki
// decks (/palette-extra.json), the current note's sections (h2/h3), actions
// (theme, random note, assistant) and the site's index pages. It is the
// site's one search: the home page's search field opens it too. ARIA combobox +
// listbox inside a modal dialog: arrows move, Enter opens (Ctrl/⌘+Enter in a
// new tab for links), Esc closes, Tab stays inside, focus returns to where it
// was.
//
// "?" (outside text fields) or the palette's "Raccourcis clavier" action
// opens a small dialog listing the site's keyboard shortcuts.
//
// Phones (under 640px) get their own layout of the same data (renderPhone):
// the field at the bottom, against the keyboard, with "Annuler"; on open,
// recent searches, notes read lately, reading paths and two thumb actions;
// once typing, filter chips with counts, results grouped with each note's
// family icon and a short context (lib/palette-phone.ts), one note per
// language grouped for words like "salut", full-text passages with
// per-discipline counts (Pagefind's `discipline` filter), and an empty state
// with a spelling suggestion and the assistant. Desktop is unchanged.
import { fold, rankItems, scoreItem } from "../../lib/palette-match";
import {
  RECENT_KEY,
  buildVocabulary,
  isMultiLanguage,
  noteContext,
  parseRecent,
  pushRecent,
  suggestSpelling,
  topLanguage,
} from "../../lib/palette-phone";
import { pathFamily } from "../../lib/path-family";
import { isRead, loadStore, slugFromHref } from "../../lib/reading-progress";
import { downloadExport } from "../../lib/progress-transfer";
import { SEARCH_MISS_SETTLE_MS, normaliseSearchMiss, reportSearchMiss } from "../../lib/search-miss";

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
  let themes = []; // [{kind: "theme", title, hint, href, keywords}]
  let docs = []; // [{kind: "doc", title, hint, href, newTab}]
  let shown = []; // flat list of rendered items
  let active = 0;
  // Full-text hits for `textQuery`: [{kind: "text", title, hint, href, excerpt}].
  let pf = null; // the pagefind.js module, once imported
  let pfState = "idle"; // idle | ready | off (no index: dev, or it failed)
  let pfFails = 0; // failed imports of pagefind.js
  let pfFilters = null; // its filter index, loaded for the phone's counts
  let textQuery = "";
  let textQueryDisc = "";
  let textHits = [];
  let textPending = false;
  let textTimer = 0;
  let textSeq = 0;
  // Phone layout (see the header comment).
  const phoneMq = window.matchMedia ? window.matchMedia("(max-width: 639.98px)") : null;
  let phone = false;
  let paths = []; // [{kind: "path", title, slug, href, family, idx}]
  let pathsNv = ""; // the /notes-index.json version paths' note indexes refer to
  let discFamily = new Map(); // discipline i18n key → colour family
  let filter = "all"; // all | paths | notes | themes | decks | pdfs | text
  let textDisc = ""; // Pagefind discipline filter of the "Dans le texte" view
  let textTotal = 0; // hits Pagefind found for textQuery (all, not only loaded)
  let textCounts = null; // {dkey: hits} for textQuery, unfiltered
  let textAll = 0; // textTotal without the discipline filter
  let reading = {}; // gkReading (lib/reading-progress.ts), read on open
  let vocab = null; // for the spelling suggestion, built on first need
  let bySlug = null; // Map slug → note, see noteBySlug()

  const ICON = {
    note: '<path d="M7 3.5h7l4 4V20.5H7z M14 3.5v4h4" />',
    theme: '<path d="M4 12.5V4h8.5L20 11.5 12.5 19z" /><circle cx="8.5" cy="8.5" r="1.3" />',
    doc: '<path d="M6 3.5h12v17H6z M9 8h6M9 12h6M9 16h3" />',
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
        vocab = null;
        bySlug = null;
        notesState = "ready";
        if (isOpen()) render();
      })
      .catch(() => {
        notesState = "error";
        if (isOpen()) render();
      });
    loadExtra();
  }

  // Disciplines, tags, PDFs and decks. Best effort: without it the palette
  // still finds notes.
  function loadExtra() {
    const v = doc.querySelector('meta[name="gk-palette-extra"]');
    fetch("/palette-extra.json" + (v && v.content ? "?v=" + encodeURIComponent(v.content) : ""))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        discFamily = new Map();
        for (const [title, , , dkey] of data.themes || []) {
          const fam = dkey && pathFamily(String(title));
          if (fam) discFamily.set(String(dkey), fam);
        }
        paths = (data.paths || []).map(([title, slug, family, idx]) => ({
          kind: "path",
          title: String(title),
          slug: String(slug),
          href: `/parcours/${slug}/`,
          family: family ? String(family) : "",
          idx: Array.isArray(idx) ? idx : [],
          hint: "",
        }));
        pathsNv = data.nv ? String(data.nv) : "";
        vocab = null;
        themes = (data.themes || []).map(([title, href, n, dkey]) => ({
          kind: "theme",
          title: String(title),
          dkey: dkey ? String(dkey) : "",
          n: Number(n) || 0,
          hint: "",
          href: String(href),
          keywords: dkey ? String(title) : "",
        }));
        docs = (data.docs || []).map(([title, href, where, type]) => ({
          kind: "doc",
          title: String(title),
          where: where ? String(where) : "",
          type: type === "deck" ? "deck" : "pdf",
          hint: "",
          href: String(href),
          newTab: type !== "deck",
          keywords: `${type === "deck" ? "anki cartes deck flashcards" : "pdf"} ${where || ""}`,
        }));
        localizeExtra();
        if (isOpen()) render();
      })
      .catch(() => {});
  }
  // Titles and hints in the reader's language (re-run on i18n:change).
  function localizeExtra() {
    for (const t of themes) {
      if (t.dkey) {
        const label = tt(t.dkey);
        if (label && label !== t.dkey) t.title = label;
      }
      t.meta = `${tt(t.dkey ? "themes.disciplineKicker" : "themes.tagKicker")} · ${tt(t.n === 1 ? "themes.countOne" : "themes.count", { n: t.n })}`;
    }
    for (const d of docs) {
      const what = tt(d.type === "deck" ? "palette.deck" : "palette.pdf");
      d.meta = d.where ? `${what} · ${folderHint(d.where)}` : what;
    }
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
      dkey: meta.dkey ? String(meta.dkey) : "",
      href: String(sub ? sub.url : d.url),
      excerpt: safeExcerpt(sub ? sub.excerpt : d.excerpt),
    };
  }

  // Each hit's data is one fragment file. Fetched a few at a time, not all at
  // once: a burst of twenty requests per keystroke got some of them a 429 from
  // the host in production, and one rejected fragment used to sink the whole
  // query. A failed fragment is retried once, then left out.
  const HIT_CONCURRENCY = 4;
  async function loadHits(results, stale) {
    const out = new Array(results.length).fill(null);
    let next = 0;
    async function worker() {
      while (next < results.length && !stale()) {
        const i = next++;
        try {
          out[i] = await results[i].data();
        } catch {
          await new Promise((r) => setTimeout(r, 400));
          if (stale()) return;
          try {
            out[i] = await results[i].data();
          } catch {
            /* left out */
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(HIT_CONCURRENCY, results.length) }, worker));
    return out.filter(Boolean);
  }

  function searchText(q) {
    clearTimeout(textTimer);
    if (pfState === "off" || q.length < TEXT_MIN) {
      textQuery = "";
      textHits = [];
      textTotal = 0;
      textPending = false;
      return;
    }
    const disc = phone ? textDisc : "";
    if (q === textQuery && disc === textQueryDisc && !textPending) return;
    textPending = true;
    const seq = ++textSeq;
    textTimer = setTimeout(async () => {
      try {
        if (!pf) {
          try {
            // Variable specifier: esbuild leaves it as a runtime URL import (the
            // file only exists in a built out/, written by `pagefind --site out`).
            const mod = "/pagefind/pagefind.js";
            pf = await import(mod);
            pfState = "ready";
          } catch (e) {
            // No index (`next dev`), or a load that failed: tried again on a
            // later query, given up after the third miss.
            if (++pfFails >= 3) pfState = "off";
            throw e;
          }
        }
        // Per-discipline counts (the phone's chips) need the filter index.
        if (phone && !pfFilters && pf.filters) pfFilters = await pf.filters().catch(() => null);
        const res = await pf.search(q, disc ? { filters: { discipline: disc } } : undefined);
        const data = await loadHits(((res && res.results) || []).slice(0, TEXT_MAX + 5), () => seq !== textSeq);
        if (seq !== textSeq) return;
        const fs = res && (res.totalFilters || res.filters);
        if (q !== textQuery || !disc) textCounts = (fs && fs.discipline) || null;
        textQuery = q;
        textQueryDisc = disc;
        textTotal = ((res && res.results) || []).length;
        if (!disc) textAll = textTotal;
        textHits = data.map(toTextHit);
      } catch {
        // One failed search (network, a 429 from the host on a burst of
        // fragment requests) must not turn the text search off for the rest
        // of the visit: it only empties this query's hits.
        if (seq !== textSeq) return;
        textQuery = q;
        textQueryDisc = disc;
        textTotal = 0;
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

  // `question`: written into the assistant's field (the phone's empty state
  // hands it the query), through the native setter so React sees it.
  function openAssistant(question) {
    try {
      localStorage.setItem("gkChatPinned", "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("gk:pin-chat"));
    // Hand focus to its input once React has shown it.
    setTimeout(() => {
      const field = doc.querySelector(".gk-pinned-form input, .gk-pinned-form textarea");
      if (!field) return;
      if (typeof question === "string" && question) {
        const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const set = Object.getOwnPropertyDescriptor(proto, "value");
        if (set && set.set) set.set.call(field, question);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      field.focus();
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
      ["carte.nav", "/carte/", "carte monde pays map world countries"],
      ["nav.themes", "/themes/", "themes tags disciplines"],
      ["nav.cartes", "/cartes/", "cartes anki flashcards"],
      ["nav.parcours", "/parcours/", "parcours chemins prerequis paths"],
      ["nav.progression", "/progression/", "progression progress export import sauvegarde"],
      ["donnees.nav", "/donnees/", "donnees data open json licence citer sources"],
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
    // already listed. Fewer title rows once other groups have answers, so
    // they stay in view.
    const text = q === textQuery ? textHits : [];
    // Names only, no scattered-letter fallback: these lists are long and
    // their misses would crowd the real results.
    const th = rankItems(q, themes, 6, false);
    const dc = rankItems(q, docs, 6, false);
    let found = [];
    if (notes) {
      found = rankItems(q, notes, text.length || th.length || dc.length ? 12 : 30);
      // Scattered-letter title matches ("entropie" in "anthropologie") are a
      // last resort; once the text has real hits they are only noise.
      if (text.length) found = found.filter((n) => scoreItem(q, n, false) !== null);
      // A note found by its title and by its text shows both: the title row
      // carries the passage, and links to its section, so a word that is
      // also in the title ("kabyle") still shows where the text uses it.
      if (text.length) {
        const byPath = new Map(text.map((h) => [pathOf(h.href), h]));
        found = found.map((n) => {
          const h = byPath.get(pathOf(n.href));
          return h ? { ...n, href: h.href, sub: h.sub, excerpt: h.excerpt } : n;
        });
      }
      if (found.length) out.push({ label: tt("palette.notes"), items: found });
    }
    const s = rankItems(q, secs, 8);
    if (s.length) out.push({ label: tt("palette.sections"), items: s });
    const seen = new Set(found.map((n) => pathOf(n.href)));
    if (th.length) out.push({ label: tt("palette.themes"), items: th });
    if (dc.length) out.push({ label: tt("palette.docs"), items: dc });
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
    if (phone) return renderPhone();
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
          (it.meta
            ? `<span class="palette-opt-hint">${esc(it.meta)}</span>`
            : it.kind === "text"
            ? `<span class="palette-opt-hint">${esc([it.hint && folderHint(it.hint), it.sub].filter(Boolean).join(" › "))}</span>` +
              (it.excerpt ? `<span class="palette-opt-excerpt">${it.excerpt}</span>` : "")
            : (it.hint && it.hint !== "·"
                ? `<span class="palette-opt-hint">${esc(
                    it.kind === "note"
                      ? [folderHint(it.hint), it.sub].filter(Boolean).join(" › ")
                      : it.hint,
                  )}</span>`
                : "") + (it.excerpt ? `<span class="palette-opt-excerpt">${it.excerpt}</span>` : "")) +
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
    watchMiss(q, !status && !shown.length);
    const keep = prev ? shown.indexOf(prev) : -1;
    if (keep < 0 && prev && prev.kind !== "action") {
      const same = shown.findIndex((it) => it.kind === prev.kind && it.href === prev.href);
      if (same >= 0) active = same;
    } else if (keep >= 0) active = keep;
    setActive(Math.min(active, Math.max(0, shown.length - 1)), false);
  }

  // --- phone layout (under 640px) -------------------------------------------
  const svgOf = (p, w = 1.8) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  // The colour families' drawings, as FamilyIcon in components/HomeDashboard.tsx.
  const FAM = {
    sciences: svgOf('<circle cx="12" cy="12" r="1.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>'),
    informatique: svgOf('<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>', 2.2),
    vivant: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M5 19C5 10 10 5 20 4c-1 10-6 15-15 15Z"/></svg>',
    pensee: svgOf('<path d="M4 20h16M6 20V10M12 20V10M18 20V10M3 10l9-6 9 6"/>'),
    societe: svgOf('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
    arts: svgOf('<path d="M14 4l6 6-8 8-6-6z"/><path d="M6 12l-3 8 8-3"/>'),
    langues: svgOf('<path d="M4 5h9M8.5 3v2M6 5c1 4 4 7 7 8M11 5c-1 4-4 7-7 8M13 21l4-9 4 9M14.5 18h5"/>'),
    jeux: svgOf('<path d="M8 20h8M9 20l1-6-3-2 3-6h4l3 6-3 2 1 6"/>'),
    none: svgOf('<path d="M12 21v-8"/><path d="M12 14C7 14 4.5 11 4.5 6.5 9 6.5 12 9 12 14Z" fill="currentColor"/><path d="M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5Z" fill="currentColor" opacity=".6"/>'),
  };
  const PI = {
    clock: svgOf('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    dice: svgOf('<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>'),
    spark: svgOf('<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z"/><path d="M19 15c.3 1.8 1 2.6 2.5 3-1.5.3-2.2 1.1-2.5 3-.3-1.9-1-2.7-2.5-3 1.5-.4 2.2-1.2 2.5-3Z"/>'),
    send: svgOf('<path d="M12 19V5M6 11l6-6 6 6"/>', 2.4),
    cards: svgOf('<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v12"/>'),
    check: svgOf('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 3),
    chev: svgOf('<path d="m9 5 7 7-7 7"/>', 2.6),
    bulb: svgOf('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>'),
  };

  function setPhone(on) {
    phone = on;
    if (!el) return;
    el.classList.toggle("palette--phone", on);
    if (!on) el.querySelector(".palette-filters").hidden = true;
    label();
    watchViewport(on && isOpen());
  }
  if (phoneMq) {
    const onMq = () => {
      if (!isOpen()) return;
      setPhone(phoneMq.matches);
      render();
    };
    if (phoneMq.addEventListener) phoneMq.addEventListener("change", onMq);
    else if (phoneMq.addListener) phoneMq.addListener(onMq);
  }

  // The field sits at the bottom: follow the visual viewport so the on-screen
  // keyboard pushes it up rather than covering it (iOS doesn't resize the
  // layout viewport for the keyboard).
  let vvOn = false;
  function fitViewport() {
    const vv = window.visualViewport;
    if (!vv || !el) return;
    el.style.setProperty("--palette-vh", `${Math.round(vv.height)}px`);
    el.style.setProperty("--palette-vt", `${Math.round(vv.offsetTop)}px`);
  }
  function watchViewport(on) {
    const vv = window.visualViewport;
    if (!vv || on === vvOn) return;
    vvOn = on;
    const m = on ? "addEventListener" : "removeEventListener";
    vv[m]("resize", fitViewport);
    vv[m]("scroll", fitViewport);
    if (on) fitViewport();
    else if (el) {
      el.style.removeProperty("--palette-vh");
      el.style.removeProperty("--palette-vt");
    }
  }

  function onInput() {
    active = 0;
    shown = [];
    textDisc = "";
    searchText(input.value.trim());
    render();
    list.scrollTop = 0;
    el.querySelector(".palette-clear").hidden = !input.value;
  }
  function setQuery(v) {
    input.value = v;
    onInput();
    // A recent search or a suggestion shows its results with the keyboard
    // away; the clear button brings the keyboard back for a new word.
    if (phone && v) input.blur();
    else input.focus();
  }

  function loadRecent() {
    try {
      return parseRecent(localStorage.getItem(RECENT_KEY));
    } catch {
      return [];
    }
  }
  function saveRecent(list) {
    try {
      if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      else localStorage.removeItem(RECENT_KEY);
    } catch {
      /* storage blocked */
    }
  }
  function remember(q) {
    const s = String(q || "").trim();
    if (s.length >= 2) saveRecent(pushRecent(loadRecent(), s));
  }

  // Notes by slug, each with its slug and index (paths refer to notes by
  // their index in /notes-index.json). Rebuilt when the notes load.
  function noteBySlug() {
    if (!bySlug && notes) {
      bySlug = new Map();
      notes.forEach((n, i) => {
        n.i = i;
        n.slug = slugFromHref(n.href) || "";
        if (n.slug) bySlug.set(n.slug, n);
      });
    }
    return bySlug || new Map();
  }
  const ctxOf = (n) => n.ctx || (n.ctx = noteContext(n.title, n.hint || ""));
  const famOf = (n) => pathFamily(ctxOf(n).discipline) || "";
  const discLabel = (d) => (d ? folderHint(d) : "");
  const contextLine = (c) =>
    (c.lang ? [c.lang, c.topic] : [discLabel(c.discipline), c.topic]).filter(Boolean).join(" · ");
  const shortPath = (name) => name.split(/\s+:\s+/)[0];
  const notesVersion = () => {
    const m = doc.querySelector('meta[name="gk-notes-index"]');
    return m ? m.content : "";
  };

  function opt(it, inner, cls, fam) {
    const i = shown.length;
    shown.push(it);
    return (
      `<div role="option" id="palette-o${i}" class="palette-opt ${cls}" data-i="${i}" aria-selected="false"` +
      `${fam ? ` data-family="${fam}"` : ""}>${inner}</div>`
    );
  }
  const famIcon = (fam, cls = "pp-ico") =>
    `<span class="${cls}"${fam ? ` data-family="${fam}"` : ""}>${FAM[fam] || FAM.none}</span>`;
  const sect = (label, aside = "") =>
    `<div class="pp-sect"><h3>${label}</h3>${aside}</div>`;
  const count = (n) => ` <em>${n}</em>`;
  const listOf = (rows) => (rows.length ? `<div class="pp-list">${rows.join("")}</div>` : "");
  const more = (f, text) => `<button type="button" class="pp-more" data-filter="${f}">${esc(text)}</button>`;

  function readMark(slug) {
    const e = slug && reading[slug];
    if (!e) return "";
    if (e.r) return `<span class="pp-done">${PI.check}${esc(tt("palette.read"))}</span>`;
    const p = Math.round(e.p / 10);
    return p >= 5 ? `<span class="pp-meter" aria-hidden="true"><i style="width:${Math.min(100, p)}%"></i></span>` : "";
  }

  function noteRow(n, q) {
    const c = ctxOf(n);
    const fam = famOf(n);
    return opt(
      n,
      famIcon(fam) +
        `<span class="pp-tx"><b>${highlight(c.title, q)}</b><small>${highlight(contextLine(c), q)}</small></span>` +
        readMark(n.slug),
      "pp-row",
      fam,
    );
  }

  function pathStats(p) {
    let read = 0;
    let last = 0;
    if (notes && (!pathsNv || pathsNv === notesVersion())) {
      for (const i of p.idx) {
        const n = notes[i];
        const e = n && n.slug && reading[n.slug];
        if (!e) continue;
        if (isRead(reading, n.slug)) read++;
        if (e.t > last) last = e.t;
      }
    }
    return { n: p.idx.length, read, last };
  }
  // Paths the reader has started first (latest visit first), then the rest.
  function pathsByInterest() {
    return paths
      .map((p, i) => ({ p, i, s: pathStats(p) }))
      .sort((a, b) => b.s.last - a.s.last || a.i - b.i)
      .map((x) => x.p);
  }
  function pathChip(p) {
    const st = pathStats(p);
    return opt(
      p,
      `<i>${FAM[p.family] || FAM.none}</i><span>${esc(shortPath(p.title))}</span>` +
        (st.read ? `<small>${st.read}/${st.n}</small>` : ""),
      "pp-pchip",
      p.family,
    );
  }
  function pathCard(p, q) {
    const st = pathStats(p);
    return opt(
      p,
      `<span class="pp-pi">${FAM[p.family] || FAM.none}</span><span class="pp-tx">` +
        `<em>${esc(tt("palette.pathKicker", { n: st.n }))}</em><b>${highlight(p.title, q)}</b>` +
        (st.read
          ? `<span class="pp-bar" aria-hidden="true"><i style="width:${Math.round((100 * st.read) / Math.max(1, st.n))}%"></i></span>` +
            `<small>${esc(tt("palette.pathRead", { read: st.read, n: st.n }))}</small>`
          : "") +
        `</span>`,
      "pp-pcard",
      p.family,
    );
  }
  function docRow(d, q) {
    const c = noteContext("", d.where.replace(/ › /g, " › "));
    const fam = pathFamily(c.discipline) || "";
    const where = c.lang || discLabel(c.discipline);
    return opt(
      d,
      `<span class="pp-ico"${fam ? ` data-family="${fam}"` : ""}>${d.type === "deck" ? PI.cards : icon("doc")}</span>` +
        `<span class="pp-tx"><b>${highlight(d.title, q)}</b><small>${esc([tt(d.type === "deck" ? "palette.deck" : "palette.pdf"), where].filter(Boolean).join(" · "))}</small></span>`,
      "pp-row",
    );
  }
  function themeChip(t, q) {
    return opt(
      t,
      `<span>${highlight(t.title, q)}</span><small>${t.n}</small>`,
      t.dkey ? "pp-tag pp-tag--disc" : "pp-tag",
      t.dkey ? discFamily.get(t.dkey) : "",
    );
  }
  function textRow(h, compact) {
    const fam = discFamily.get(h.dkey) || "";
    const disc = h.dkey ? tt(h.dkey) : h.hint ? folderHint(h.hint) : "";
    const where = [disc, h.sub ? `§ ${h.sub}` : ""].filter((x) => x && x !== h.dkey).join(" · ");
    return opt(
      h,
      `<span class="pp-hh">${famIcon(fam, "pp-ico pp-ico--sm")}<b>${esc(h.title)}</b></span>` +
        (where ? `<small class="pp-where">${esc(where)}</small>` : "") +
        (h.excerpt ? `<span class="pp-ex">${h.excerpt}</span>` : ""),
      compact ? "pp-hit pp-hit--compact" : "pp-hit",
      fam,
    );
  }
  function plainRow(it, q) {
    const sub = it.meta || (it.hint && it.hint !== "·" ? it.hint : "");
    return opt(
      it,
      `<span class="pp-ico pp-ico--plain">${icon(it.kind)}</span><span class="pp-tx"><b>${highlight(it.title, q)}</b>` +
        (sub ? `<small>${esc(sub)}</small>` : "") +
        `</span>`,
      "pp-row",
    );
  }

  // Notes, grouped by language when the query finds the same kind of note in
  // many of them ("salut"): the reader's language first, the others as tiles.
  function notesBlock(found, q, all) {
    const by = noteBySlug();
    const limit = all ? 200 : 5;
    if (found.length >= 4 && isMultiLanguage(found.map((n) => ctxOf(n).lang))) {
      const mine = topLanguage(
        Object.entries(reading).map(([s, e]) => {
          const n = by.get(s);
          return { lang: n ? ctxOf(n).lang : null, t: e.t };
        }),
      );
      const own = mine ? found.filter((n) => ctxOf(n).lang === mine) : [];
      const others = found.filter((n) => ctxOf(n).lang && !own.includes(n));
      const rest = found.filter((n) => !ctxOf(n).lang);
      let h = "";
      if (own.length) {
        h += sect(esc(tt("palette.yourLang")), `<span class="pp-aside">${esc(tt("palette.byReading"))}</span>`);
        h += listOf(own.slice(0, 3).map((n) => noteRow(n, q)));
      }
      const langs = new Set(others.map((n) => ctxOf(n).lang));
      const dup = new Set(others.filter((n, i) => others.findIndex((m) => ctxOf(m).lang === ctxOf(n).lang) !== i).map((n) => ctxOf(n).lang));
      const tiles = all ? others : others.slice(0, 10);
      h += sect(esc(tt(own.length ? "palette.otherLangs" : "palette.inLangs", { n: langs.size })));
      h +=
        `<div class="pp-grid">` +
        tiles
          .map((n) => {
            const c = ctxOf(n);
            const e = n.slug && reading[n.slug];
            return opt(
              n,
              `<i></i><b>${esc(c.lang)}</b>` +
                (dup.has(c.lang) ? `<small>${highlight(c.title, q)}</small>` : e && e.r ? `<small class="is-read">${esc(tt("palette.read"))}</small>` : ""),
              "pp-tile",
              famOf(n),
            );
          })
          .join("") +
        (tiles.length < others.length
          ? `<button type="button" class="pp-tile pp-tile--more" data-filter="notes">${esc(
              tt("palette.moreLangs", { n: others.length - tiles.length }),
            )}</button>`
          : "") +
        `</div>`;
      if (rest.length) {
        h += sect(esc(tt("palette.otherNotes")) + count(rest.length));
        h += listOf(rest.slice(0, all ? limit : 3).map((n) => noteRow(n, q)));
      }
      return h;
    }
    return (
      sect(esc(tt("palette.notes")) + count(found.length), !all && found.length > limit ? more("notes", tt("palette.seeAll")) : "") +
      listOf(found.slice(0, limit).map((n) => noteRow(n, q)))
    );
  }

  function phoneHome() {
    let h = "";
    const rec = loadRecent();
    if (rec.length) {
      h += sect(esc(tt("palette.recent")), `<button type="button" class="pp-more" data-forget>${esc(tt("palette.forget"))}</button>`);
      h += `<div class="pp-chips">${rec.map((r) => opt({ kind: "fill", fill: r, title: r }, `${PI.clock}<span>${esc(r)}</span>`, "pp-chip")).join("")}</div>`;
    }
    const by = noteBySlug();
    const here = pathOf(location.pathname);
    const recent = Object.entries(reading)
      .filter(([s]) => by.has(s) && pathOf(by.get(s).href) !== here)
      .sort((a, b) => b[1].t - a[1].t)
      .slice(0, 3)
      .map(([s]) => by.get(s));
    if (recent.length) h += sect(esc(tt("palette.recentRead"))) + listOf(recent.map((n) => noteRow(n, "")));
    const ps = pathsByInterest().slice(0, 8);
    if (ps.length) {
      h += sect(esc(tt("palette.paths")), opt({ kind: "nav", title: tt("palette.seeAll"), href: "/parcours/" }, esc(tt("palette.seeAll")), "pp-more"));
      h += `<div class="pp-chips">${ps.map(pathChip).join("")}</div>`;
    }
    const acts = [
      { kind: "action", title: tt("palette.random"), run: randomNote, ic: PI.dice },
      { kind: "action", title: tt("palette.ask"), run: () => openAssistant(), ic: PI.spark },
    ];
    h += `<div class="pp-chips pp-acts">${acts.map((a) => opt(a, `${a.ic}<span>${esc(a.title)}</span>`, "pp-chip pp-chip--act")).join("")}</div>`;
    if (notesState === "error") h += `<p class="pp-status">${esc(tt("palette.loadError"))}</p>`;
    return h;
  }

  // "Essayez philosophie": a known word one or two letters away from the
  // query (lib/palette-phone.ts), offered only when it finds something.
  function suggestion(q) {
    if (!notes) return "";
    vocab = vocab || buildVocabulary([...notes.map((n) => n.title), ...themes.map((t) => t.title), ...paths.map((p) => p.title)]);
    const sug = suggestSpelling(q, vocab);
    const n = sug ? rankItems(sug, notes, Infinity, false).length + rankItems(sug, themes, Infinity, false).length : 0;
    if (!sug || !n) return "";
    const label = esc(tt("palette.tryWord", { w: "\u0001" })).replace("\u0001", `<b>${esc(sug)}</b>`);
    return opt(
      { kind: "fill", fill: sug, title: sug },
      `${PI.bulb}<span class="pp-tx"><span>${label}</span><small>${esc(tt("palette.results", { n }))}</small></span>${PI.chev}`,
      "pp-sugg",
    );
  }
  // The assistant, with the query written in its field.
  function askCard(q) {
    return (
      sect(esc(tt("palette.orAsk"))) +
      opt(
        { kind: "action", title: q, run: () => openAssistant(q) },
        `<span class="pp-ask-h"><i>${PI.spark}</i><span><b>${esc(tt("palette.ask"))}</b>` +
          `<small>${esc(tt("palette.askBody", { n: notes ? notes.length : "" }))}</small></span></span>` +
          `<span class="pp-ask-q"><span>${esc(q)}</span><i>${PI.send}</i></span>`,
        "pp-ask",
      )
    );
  }

  function phoneEmpty(q, near) {
    let h =
      `<div class="pp-empty"><span class="pp-empty-ill">${FAM.none}</span>` +
      `<h3>${esc(tt("palette.emptyTitle", { q }))}</h3><p>${esc(tt(pfState === "off" ? "palette.emptyBodyTitles" : "palette.emptyBody"))}</p></div>`;
    h += suggestion(q);
    if (near.length) h += sect(esc(tt("palette.near"))) + listOf(near.map((n) => noteRow(n, "")));
    h += askCard(q);
    const ps = pathsByInterest().slice(0, 6);
    if (ps.length) h += sect(esc(tt("palette.paths"))) + `<div class="pp-chips">${ps.map(pathChip).join("")}</div>`;
    if (normaliseSearchMiss(q)) h += `<p class="pp-fine">${esc(tt("palette.missNote"))}</p>`;
    return h;
  }

  function renderPhone() {
    const q = input.value.trim();
    shown = [];
    noteBySlug();
    const filtersEl = el.querySelector(".palette-filters");
    let html = "";
    let fhtml = "";
    let status = "";
    let empty = false;
    if (!q) {
      filter = "all";
      html = phoneHome();
    } else {
      const textOn = pfState !== "off" && q.length >= TEXT_MIN;
      const textReady = q === textQuery && !textPending;
      const text = q === textQuery ? textHits : [];
      let found = notes ? rankItems(q, notes) : [];
      if (text.length) found = found.filter((n) => scoreItem(q, n, false) !== null);
      const ps = rankItems(q, paths, Infinity, false);
      const th = rankItems(q, themes, Infinity, false);
      const dk = rankItems(q, docs.filter((d) => d.type === "deck"), Infinity, false);
      const pd = rankItems(q, docs.filter((d) => d.type === "pdf"), Infinity, false);
      const secs = rankItems(q, sections(), 8);
      const acts = rankItems(q, actions().filter((a) => a.hint !== "?"), 4, false);
      const navs = rankItems(q, navItems(), 4, false);
      const kinds = [
        ["paths", ps.length],
        ["notes", found.length],
        ["themes", th.length],
        ["decks", dk.length],
        ["pdfs", pd.length],
      ];
      const nText = textReady ? (textDisc ? textAll : textTotal) : null;
      if (filter === "text" ? !textOn : filter !== "all" && !kinds.some(([k, n]) => k === filter && n)) filter = "all";
      const chip = (k, label, n, ic = "") =>
        `<button type="button" class="pp-fchip${filter === k ? " is-on" : ""}" data-filter="${k}" aria-pressed="${filter === k}">${ic}${esc(label)}${count(n)}</button>`;
      const total = kinds.reduce((s, [, n]) => s + n, 0) + secs.length + (nText || 0);
      fhtml = chip("all", tt("palette.all"), total);
      for (const [k, n] of kinds) if (n) fhtml += chip(k, tt(`palette.f.${k}`), n);
      if (textOn && (nText === null || nText > 0 || filter === "text"))
        fhtml += chip("text", tt("palette.inText"), nText === null ? "…" : nText, icon("text"));
      fhtml = `<div class="pp-chips pp-filters">${fhtml}</div>`;
      if (filter === "text" && textCounts) {
        const entries = Object.entries(textCounts)
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6);
        const all = Object.values(textCounts).reduce((s, n) => s + n, 0);
        const dchip = (k, label, n) =>
          `<button type="button" class="pp-dchip${textDisc === k ? " is-on" : ""}" data-disc="${esc(k)}" aria-pressed="${textDisc === k}"${k && discFamily.get(k) ? ` data-family="${discFamily.get(k)}"` : ""}>${esc(label)}${count(n)}</button>`;
        if (entries.length > 1)
          fhtml += `<div class="pp-chips pp-subfilters">${dchip("", tt("palette.allDisc"), Math.max(all, textAll))}${entries.map(([k, n]) => dchip(k, tt(k), n)).join("")}</div>`;
      }
      const seen = new Set(found.map((n) => pathOf(n.href)));
      const tx = text.filter((h) => !seen.has(pathOf(h.href)));
      // No name answers (only passages, or letters scattered in a title):
      // a spelling suggestion first, the assistant last.
      const named =
        found.some((n) => scoreItem(q, n, false) !== null) || ps.length || th.length || dk.length || pd.length || secs.length;
      if (filter === "all") {
        // The assistant before passages that only share letters with the query.
        if (!named && tx.length) html += suggestion(q) + (textReady ? askCard(q) : "");
        if (ps.length) {
          html += sect(esc(tt("palette.paths")) + count(ps.length), ps.length > 2 ? more("paths", tt("palette.seeAll")) : "");
          html += pathCard(ps[0], q) + (ps.length > 1 ? listOf(ps.slice(1, 2).map((p) => pathCard(p, q))) : "");
        }
        if (found.length) html += notesBlock(found, q, false);
        if (secs.length) html += sect(esc(tt("palette.sections"))) + listOf(secs.map((s) => plainRow(s, q)));
        if (th.length) html += sect(esc(tt("palette.themes")) + count(th.length)) + `<div class="pp-chips">${th.slice(0, 12).map((t) => themeChip(t, q)).join("")}</div>`;
        if (dk.length) html += sect(esc(tt("palette.f.decks"))) + listOf(dk.slice(0, 4).map((d) => docRow(d, q)));
        if (pd.length) html += sect(esc(tt("palette.f.pdfs"))) + listOf(pd.slice(0, 4).map((d) => docRow(d, q)));
        if (tx.length)
          html +=
            sect(esc(tt(found.length ? "palette.elsewhere" : "palette.inText")), more("text", tt(textTotal === 1 ? "palette.passageOne" : "palette.passages", { n: textTotal }))) +
            listOf(tx.slice(0, found.length ? 2 : 6).map((h) => textRow(h, true)));
        if (acts.length) html += sect(esc(tt("palette.actions"))) + listOf(acts.map((a) => plainRow(a, q)));
        if (navs.length) html += sect(esc(tt("palette.goTo"))) + listOf(navs.map((a) => plainRow(a, q)));
      } else if (filter === "notes") html = notesBlock(found, q, true);
      else if (filter === "paths") html = ps.map((p) => pathCard(p, q)).join("");
      else if (filter === "themes") html = `<div class="pp-chips pp-chips--wrap">${th.slice(0, 80).map((t) => themeChip(t, q)).join("")}</div>`;
      else if (filter === "decks") html = listOf(dk.map((d) => docRow(d, q)));
      else if (filter === "pdfs") html = listOf(pd.map((d) => docRow(d, q)));
      else if (filter === "text") {
        if (textReady && textDisc === textQueryDisc) html = listOf(text.map((h) => textRow(h, false)));
      }
      if (notesState === "loading") status = tt("palette.loading");
      else if (notesState === "error") status = tt("palette.loadError");
      else if (textPending) status = tt("palette.searchingText");
      // Only scattered-letter title matches ("hangul" in "Threat Modeling…"):
      // that is the empty state, with them as a last "approchant" list.
      const loose = !status && filter === "all" && found.length && !named && !text.length && !acts.length && !navs.length;
      if (!shown.length || loose) {
        if (status) html += `<p class="pp-status">${esc(status)}</p>`;
        else {
          empty = !shown.length || !!loose;
          fhtml = "";
          shown = [];
          html = phoneEmpty(q, loose ? found.slice(0, 3) : []);
        }
      }
    }
    filtersEl.innerHTML = fhtml;
    filtersEl.hidden = !fhtml;
    list.innerHTML = html;
    statusEl.textContent = q ? status || (empty ? tt("palette.empty") : tt("palette.results", { n: shown.length })) : "";
    watchMiss(q, empty);
    setActive(Math.min(active, Math.max(0, shown.length - 1)), false);
  }

  // "Recherches sans résultat" for /admin (lib/search-miss.ts): a query that
  // stays unchanged and empty-handed once every source has answered. Reported
  // as "home": the palette is the site's main search.
  let missTimer = 0;
  function watchMiss(q, empty) {
    clearTimeout(missTimer);
    if (!empty) return;
    missTimer = setTimeout(() => {
      if (isOpen() && input.value.trim() === q && !shown.length) reportSearchMiss(q, "home");
    }, SEARCH_MISS_SETTLE_MS);
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
    if (item.fill !== undefined) {
      // A recent search or a suggested spelling: typed in, not opened.
      setQuery(item.fill);
      return;
    }
    remember(input.value);
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
    if (newTab || item.newTab) {
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
      `<div class="palette-field"><div class="palette-box">` +
      `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>` +
      `<input class="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">` +
      `<button type="button" class="palette-clear" hidden><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` +
      `</div>` +
      `<button type="button" class="palette-close" data-palette-close><kbd>Esc</kbd></button>` +
      `<button type="button" class="palette-cancel" data-palette-close></button>` +
      `</div>` +
      `<div class="palette-filters" hidden></div>` +
      `<div id="palette-list" class="palette-list" role="listbox"></div>` +
      `<div class="palette-foot"><span class="palette-status" role="status"></span><span class="palette-hint" aria-hidden="true"></span></div>` +
      `</div>`;
    doc.body.appendChild(el);
    input = el.querySelector(".palette-input");
    list = el.querySelector(".palette-list");
    statusEl = el.querySelector(".palette-status");
    label();

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!shown.length) return;
        const d = e.key === "ArrowDown" ? 1 : -1;
        setActive((active + d + shown.length) % shown.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Phones: the keyboard's "rechercher" puts the keyboard away so the
        // results show; a hardware keyboard's Enter still opens.
        if (phone && !e.metaKey && !e.ctrlKey && navigator.maxTouchPoints > 0) {
          remember(input.value);
          input.blur();
          return;
        }
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
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      if (t.closest("[data-palette-close]")) return close(true);
      if (t.closest(".palette-clear")) return setQuery("");
      const f = t.closest("[data-filter]");
      if (f) {
        filter = f.getAttribute("data-filter") || "all";
        if (filter !== "text" && textDisc) {
          textDisc = "";
          searchText(input.value.trim());
        }
        render();
        list.scrollTop = 0;
        return;
      }
      const d = t.closest("[data-disc]");
      if (d) {
        textDisc = d.getAttribute("data-disc") || "";
        searchText(input.value.trim());
        render();
        list.scrollTop = 0;
        return;
      }
      if (t.closest("[data-forget]")) {
        saveRecent([]);
        render();
      }
    });
    // Phones: scrolling the results puts the keyboard away, as in iOS lists.
    list.addEventListener(
      "touchmove",
      () => {
        if (phone && doc.activeElement === input) input.blur();
      },
      { passive: true },
    );
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
    el.querySelector(".palette-cancel").textContent = tt("palette.cancel");
    el.querySelector(".palette-clear").setAttribute("aria-label", tt("palette.clearField"));
    if (phone) input.setAttribute("placeholder", tt("palette.placeholderPhone"));
    input.setAttribute("enterkeyhint", phone ? "search" : "go");
    el.querySelector(".palette-hint").textContent = tt("palette.hint");
  }

  const isOpen = () => !!el && !el.hidden;

  function open(initial) {
    build();
    if (isOpen()) return input.focus();
    lastFocus = doc.activeElement;
    setPhone(!!(phoneMq && phoneMq.matches));
    el.hidden = false;
    root.classList.add("palette-open");
    input.value = initial || "";
    active = 0;
    filter = "all";
    textDisc = "";
    reading = loadStore();
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
    watchViewport(false);
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
      ["shortcuts.reading", [
        [["n", "p"], "shortcuts.nextPrevNote"],
        [["t"], "shortcuts.top"],
        [["s"], "shortcuts.contents"],
        [["f"], "shortcuts.focus"],
        [["b"], "shortcuts.bookmark"],
        [["g a"], "shortcuts.home"],
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
    localizeExtra();
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
