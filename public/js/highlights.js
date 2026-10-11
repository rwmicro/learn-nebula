// Highlights in a note: passages the reader marked with "Surligner" (the
// selection toolbar, public/js/selection-menu.js), kept in this browser and
// carried by the progress export and the account sync (lib/personal.ts).
//
// A highlight is stored as its text, not as a DOM position: the note can be
// rebuilt, and the text is what survives. On load each one is found again in
// the article (first occurrence, whitespace-insensitive) and wrapped in
// <mark class="hl">; one that no longer appears is simply not drawn (it
// stays listed on /progression/). Clicking a highlight opens a small card to
// add a personal note or remove it.
import {
  loadHighlights,
  saveHighlights,
  addHighlight,
  updateHighlight,
  normalizeQuote,
} from "../../lib/personal";

(function () {
  const article = document.querySelector(".article-body");
  const state = document.querySelector(".read-state[data-slug]");
  if (!article || !state) return;
  const slug = state.getAttribute("data-slug");
  const title = (document.querySelector("h1.title-note")?.textContent || slug).trim();
  const esc = (s) => window.__i18n.escapeHtml(s);
  const tt = (k) => (window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k);
  const SKIP = "script, style, .katex-mathml, .sel-menu, .hl-card, button, .copy-btn";

  /** Text nodes of the article and a whitespace-collapsed copy of their text,
   *  with, for each character of that copy, where it comes from. */
  function index() {
    const nodes = [];
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        return n.parentElement && n.parentElement.closest(SKIP)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    let text = "";
    const map = [];
    let space = true;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push(n);
      const d = n.data;
      for (let i = 0; i < d.length; i++) {
        if (/\s/.test(d[i])) {
          if (space) continue;
          text += " ";
          space = true;
        } else {
          text += d[i];
          space = false;
        }
        map.push([n, i]);
      }
    }
    return { text, map };
  }

  function findRange(quote, idx) {
    const at = idx.text.indexOf(quote);
    if (at < 0) return null;
    const [sn, so] = idx.map[at];
    const [en, eo] = idx.map[at + quote.length - 1];
    const r = document.createRange();
    r.setStart(sn, so);
    r.setEnd(en, eo + 1);
    return r;
  }

  /** Wrap every text node piece inside `range` in a <mark>. */
  function wrap(range, id, note) {
    const nodes = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (range.intersectsNode(n) && n.data.trim() && !(n.parentElement && n.parentElement.closest(SKIP))) nodes.push(n);
    }
    const marks = [];
    for (let node of nodes) {
      let start = node === range.startContainer ? range.startOffset : 0;
      let end = node === range.endContainer ? range.endOffset : node.data.length;
      if (end <= start) continue;
      if (start > 0) {
        node = node.splitText(start);
        end -= start;
        start = 0;
      }
      if (end < node.data.length) node.splitText(end);
      const m = document.createElement("mark");
      m.className = "hl" + (note ? " hl--note" : "");
      m.dataset.hl = id;
      m.tabIndex = marks.length ? -1 : 0;
      m.setAttribute("role", "button");
      m.setAttribute("aria-label", tt("highlight.open"));
      node.parentNode.insertBefore(m, node);
      m.appendChild(node);
      marks.push(m);
    }
    return marks;
  }

  function unwrap(id) {
    article.querySelectorAll(`mark.hl[data-hl="${CSS.escape(id)}"]`).forEach((m) => {
      const p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
  }

  function drawAll() {
    const store = loadHighlights();
    const mine = store[slug];
    if (!mine) return;
    const idx = index();
    for (const [id, h] of Object.entries(mine.items)) {
      if (h.del || article.querySelector(`mark.hl[data-hl="${CSS.escape(id)}"]`)) continue;
      const r = findRange(h.q, idx);
      if (r) wrap(r, id, h.n);
    }
  }

  // --- the card (note / remove) ----------------------------------------------
  const card = document.createElement("div");
  card.className = "hl-card";
  card.hidden = true;
  card.setAttribute("role", "dialog");
  card.setAttribute("data-pagefind-ignore", "");
  card.innerHTML =
    `<label class="hl-card-label"><span data-i18n="highlight.noteLabel">${esc(tt("highlight.noteLabel"))}</span>` +
    `<textarea rows="3" maxlength="2000"></textarea></label>` +
    `<div class="hl-card-actions">` +
    `<button type="button" class="hl-card-save" data-i18n="highlight.save">${esc(tt("highlight.save"))}</button>` +
    `<button type="button" class="hl-card-remove" data-i18n="highlight.remove">${esc(tt("highlight.remove"))}</button>` +
    `</div>`;
  document.body.appendChild(card);
  const ta = card.querySelector("textarea");
  let openId = null;
  let opener = null;

  function openCard(mark) {
    openId = mark.dataset.hl;
    opener = mark;
    const h = loadHighlights()[slug]?.items[openId];
    ta.value = h?.n || "";
    card.hidden = false;
    const r = mark.getBoundingClientRect();
    const w = Math.min(320, document.documentElement.clientWidth - 16);
    card.style.width = `${w}px`;
    card.style.left = `${Math.round(Math.max(8, Math.min(r.left, document.documentElement.clientWidth - w - 8)))}px`;
    card.style.top = `${Math.round(r.bottom + window.scrollY + 8)}px`;
    ta.focus();
  }
  function closeCard() {
    if (card.hidden) return;
    card.hidden = true;
    openId = null;
    opener?.focus();
  }

  card.querySelector(".hl-card-save").addEventListener("click", () => {
    if (!openId) return;
    saveHighlights(updateHighlight(loadHighlights(), slug, openId, { n: ta.value }));
    article
      .querySelectorAll(`mark.hl[data-hl="${CSS.escape(openId)}"]`)
      .forEach((m) => m.classList.toggle("hl--note", !!ta.value.trim()));
    closeCard();
  });
  card.querySelector(".hl-card-remove").addEventListener("click", () => {
    if (!openId) return;
    saveHighlights(updateHighlight(loadHighlights(), slug, openId, { del: true }));
    const id = openId;
    opener = null;
    closeCard();
    unwrap(id);
  });
  article.addEventListener("click", (e) => {
    const m = e.target instanceof Element && e.target.closest("mark.hl");
    if (!m || (window.getSelection() && !window.getSelection().isCollapsed)) return;
    openCard(m);
  });
  article.addEventListener("keydown", (e) => {
    const m = e.target instanceof Element && e.target.closest("mark.hl");
    if (m && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openCard(m);
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!card.hidden && !card.contains(e.target) && !(e.target instanceof Element && e.target.closest("mark.hl"))) {
      card.hidden = true;
      openId = null;
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !card.hidden) closeCard();
  });

  // --- new highlight from the selection toolbar ------------------------------
  window.addEventListener("gk:highlight", (e) => {
    const range = e.detail && e.detail.range;
    if (!range) return;
    const quote = normalizeQuote(range.toString());
    if (!quote) return;
    const { store, id } = addHighlight(loadHighlights(), slug, title, quote);
    saveHighlights(store);
    const marks = wrap(range, id, "");
    marks[0]?.classList.add("hl--new");
    window.dispatchEvent(new CustomEvent("gk:activity", { detail: { kind: "highlight" } }));
  });

  // Draw once the article settled (translation, widgets may rewrite it).
  if (document.readyState === "complete") drawAll();
  else window.addEventListener("load", drawAll, { once: true });
  // Another tab (or the sync) changed the list.
  window.addEventListener("storage", (e) => {
    if (e.key === "gkHighlights") drawAll();
  });
  window.addEventListener("gk:progress-synced", drawAll);
})();
