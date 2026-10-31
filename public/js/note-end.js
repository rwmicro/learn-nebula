// "Lue !" on a phone, for a note of a reading path: the moment reading-state.js
// marks the note read (gk:note-read), a full-screen card celebrates it — the
// step ("Étape 2 sur 35"), what the reading earned (coins for a signed-in
// reader, the note's questions answered, the minutes), a switch that keeps
// the note's questions in the reviews, and the next step in the path's
// colour. Its own small bundle (scripts/bundle-js.mjs), added by
// components/note/NoteScripts.tsx only to notes that sit in a path.
import { readHint } from "../../lib/account-client";
import {
  addQuestion,
  answeredCorrectly,
  loadNoteDeck,
  noteSlugFromPath,
  removeQuestion,
  saveNoteDeck,
} from "../../lib/note-quiz";

(function () {
  const bar = document.querySelector("nav.path-step");
  if (!bar) return;
  const phone = window.matchMedia("(max-width: 639.98px)");
  const slug = noteSlugFromPath(location.pathname);
  /** server/accounts.ts COINS.read. */
  const COIN_READ = 5;

  const tt = (k, v) => (window.__i18n && window.__i18n.t ? window.__i18n.t(k, v) : k);
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const store = () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };

  function stepVars() {
    try {
      const v = JSON.parse(bar.querySelector(".path-step-count")?.getAttribute("data-i18n-vars") || "{}");
      return v && v.n && v.total ? v : null;
    } catch {
      return null;
    }
  }

  // The note's question cards (quiz.js), with how many were answered right.
  function questions() {
    const cards = [...document.querySelectorAll(".callout-quiz[data-quiz-id]")];
    const s = store();
    const deck = s && slug ? loadNoteDeck(s, slug) : null;
    const right = cards.filter((c) => answeredCorrectly(deck, c.dataset.quizId)).length;
    const kept = !!deck && cards.length > 0 && cards.every((c) => deck.items[c.dataset.quizId]);
    return { cards, right, kept };
  }

  function keep(cards, on) {
    const s = store();
    if (!s || !slug) return;
    let deck = loadNoteDeck(s, slug);
    const h1 = document.querySelector("h1.title-note");
    const title = h1 ? (h1.textContent || "").trim() : document.title;
    for (const c of cards) {
      const id = c.dataset.quizId;
      if (on && !deck.items[id]) {
        deck = addQuestion(
          deck,
          id,
          {
            q: c.querySelector(".quiz-question")?.innerHTML || "",
            a: c.querySelector(".quiz-answer")?.innerHTML || "",
            url: `${location.pathname}#${c.id}`,
            title,
          },
          null,
        );
      } else if (!on && deck.items[id]) deck = removeQuestion(deck, id);
    }
    try {
      saveNoteDeck(s, slug, deck);
      window.dispatchEvent(new CustomEvent("gk:quiz-change"));
    } catch {
      /* storage full: the switch flips back below */
    }
  }

  const ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    sprout:
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 42V24M24 24c0-7 4.5-12 13-12 0 7-4.5 12-13 12ZM24 24c0-7-4.5-12-13-12 0 7 4.5 12 13 12Z"/></svg>',
    cards:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="12" height="13" rx="2"/><path d="M8 4h10a2 2 0 0 1 2 2v11"/></svg>',
    go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };

  function show() {
    const vars = stepVars();
    const next = bar.querySelector('a.path-step-link[rel="next"]');
    const pathLink = bar.querySelector("a.path-step-path");
    // The path panel's short titles ("Salutations", not "salutations —
    // arabe libanais"): this step and the one after it.
    const here = document.querySelector("#path-sheet li.is-here");
    const short = (li) => (li?.querySelector(".path-sheet-t")?.textContent || "").trim();
    const cap = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
    const h1 = document.querySelector("h1.title-note");
    const title = cap(short(here) || (h1 ? (h1.textContent || "").trim() : ""));
    const minutes = Number(document.querySelector(".read-state[data-minutes]")?.getAttribute("data-minutes")) || 0;
    const { cards, right, kept } = questions();
    const family = document.querySelector("main#main")?.getAttribute("data-family");

    const tiles = [];
    if (readHint().in)
      tiles.push(`<li class="ne-coin"><b>+${COIN_READ}</b><span>${esc(tt("noteEnd.coins", { n: COIN_READ }))}</span></li>`);
    if (cards.length)
      tiles.push(`<li><b>${right}/${cards.length}</b><span>${esc(tt("noteEnd.questions", { n: cards.length }))}</span></li>`);
    if (minutes)
      tiles.push(`<li><b>${esc(tt("parcours.min", { m: minutes }))}</b><span>${esc(tt("noteEnd.reading"))}</span></li>`);

    const nextTitle = next
      ? cap(short(here?.nextElementSibling) || (next.querySelector(".path-step-name")?.textContent || next.title || "").trim())
      : "";
    const nextMin = next ? Number(next.getAttribute("data-minutes")) || 0 : 0;
    const href = next ? next.getAttribute("href") : pathLink?.getAttribute("href") || "/parcours/";

    const dlg = document.createElement("dialog");
    dlg.className = "ne";
    if (family) dlg.setAttribute("data-family", family);
    dlg.setAttribute("aria-labelledby", "ne-title");
    dlg.setAttribute("data-pagefind-ignore", "");
    dlg.innerHTML =
      `<button type="button" class="ne-close" aria-label="${esc(tt("rs.close"))}">${ICON.close}</button>` +
      `<div class="ne-body">` +
      `<div class="ne-burst" aria-hidden="true"><span class="ne-disc">${ICON.sprout}</span><i></i><i></i><i></i><i></i><i></i></div>` +
      (vars ? `<p class="ne-kicker">${esc(tt("noteEnd.step", vars))}</p>` : "") +
      `<h2 id="ne-title" class="ne-title" tabindex="-1">${esc(tt("noteEnd.title", { title }))}</h2>` +
      `<p class="ne-sub">${esc(tt("noteEnd.sub"))}</p>` +
      (tiles.length ? `<ul class="ne-tiles">${tiles.join("")}</ul>` : "") +
      (cards.length
        ? `<label class="ne-keep"><span class="ne-keep-ico">${ICON.cards}</span>` +
          `<span class="ne-keep-tx"><b>${esc(tt("noteEnd.keep", { n: cards.length }))}</b><small>${esc(tt("noteEnd.keepText"))}</small></span>` +
          `<input type="checkbox" role="switch" class="ne-switch"${kept ? " checked" : ""}></label>`
        : "") +
      `</div>` +
      `<a class="ne-next" href="${esc(href)}">` +
      `<span class="ne-next-tx"><small>${esc(next ? tt("noteEnd.next") + (nextMin ? ` · ${tt("parcours.min", { m: nextMin })}` : "") : tt("noteEnd.backToPath"))}</small>` +
      `<b>${esc(next ? nextTitle : pathLink?.textContent || "")}</b></span>` +
      `<span class="ne-next-go">${ICON.go}</span></a>`;
    document.body.appendChild(dlg);

    const close = () => dlg.close();
    dlg.querySelector(".ne-close").addEventListener("click", close);
    dlg.addEventListener("close", () => {
      dlg.remove();
      document.documentElement.classList.remove("ne-open");
    });
    const sw = dlg.querySelector(".ne-switch");
    if (sw)
      sw.addEventListener("change", () => {
        keep(cards, sw.checked);
        sw.checked = questions().kept;
      });
    document.documentElement.classList.add("ne-open");
    dlg.showModal();
    // Focus on the heading, so a screen reader starts there and no ring
    // lands on a button the reader has not reached.
    dlg.querySelector(".ne-title").focus();
  }

  window.addEventListener("gk:note-read", () => {
    if (phone.matches && !document.querySelector("dialog.ne")) show();
  });
})();
