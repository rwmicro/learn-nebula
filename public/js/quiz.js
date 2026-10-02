// Retrieval-practice cards in the note body (`> [!quiz] Question`, rendered by
// lib/markdown.ts as .callout-quiz with a hidden .quiz-answer).
// - "Afficher la réponse" toggles the answer (aria-expanded on the button);
// - once revealed, the reader grades themselves ("Je savais" / "Pas encore")
//   and can add the question to their spaced-repetition reviews, stored with
//   the Anki decks' scheduler under `srs:note:<note-slug>` (lib/note-quiz.ts)
//   and reviewed at /cartes/revision/.
// Click handling is delegated from the document, so it keeps working after
// /js/translate.js swaps the article body. The self-grade row is created
// here, after the build, so Pagefind never indexes it; print hides it.
import {
  SELF_GRADE,
  addQuestion,
  gradeQuestion,
  isCorrect,
  loadNoteDeck,
  noteSlugFromPath,
  recordCorrect,
  removeQuestion,
  saveNoteDeck,
} from "../../lib/note-quiz.ts";
import { dayKey } from "../../lib/srs.ts";

(function () {
  const slug = noteSlugFromPath(location.pathname);

  function tt(k, vars) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k, vars) : k;
  }
  function setText(el, key, vars) {
    el.textContent = tt(key, vars);
    el.setAttribute("data-i18n", key);
    if (vars) el.setAttribute("data-i18n-vars", JSON.stringify(vars));
    else el.removeAttribute("data-i18n-vars");
  }

  // Status messages live in a child span (see showStatus).
  function say(status, key) {
    const msg = document.createElement("span");
    setText(msg, key);
    status.replaceChildren(msg);
  }

  function store() {
    try {
      const s = window.localStorage;
      s.setItem("srs:probe", "1");
      s.removeItem("srs:probe");
      return s;
    } catch {
      return null;
    }
  }

  function formatDay(day) {
    const loc = (window.__i18n && window.__i18n.locale) || "fr";
    try {
      return new Intl.DateTimeFormat(loc, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date(`${day}T12:00:00`));
    } catch {
      return day;
    }
  }

  // Status line under the buttons: where the card stands in the reviews.
  function showStatus(card, deck, id) {
    const status = card.querySelector(".quiz-status");
    if (!status) return;
    const saved = !!deck.items[id];
    const add = card.querySelector(".quiz-add");
    if (add) setText(add, saved ? "quiz.remove" : "quiz.add");
    if (!saved) return;
    const st = deck.cards[id];
    const today = dayKey();
    // Text in its own span: a locale switch (data-i18n) relabels it without
    // wiping the link next to it.
    const msg = document.createElement("span");
    if (!st || st.due <= today) setText(msg, "quiz.savedToday");
    else setText(msg, "quiz.savedOn", { date: formatDay(st.due) });
    status.replaceChildren(msg);
    const link = document.createElement("a");
    link.href = "/cartes/revision/";
    link.className = "quiz-review-link";
    setText(link, "quiz.reviewLink");
    status.append(" ", link);
  }

  function buildGradeRow(card) {
    const row = document.createElement("div");
    row.className = "quiz-grade";
    row.setAttribute("data-pagefind-ignore", "");

    const group = document.createElement("div");
    group.className = "quiz-self";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", tt("quiz.selfAria"));
    group.setAttribute("data-i18n-aria-label", "quiz.selfAria");
    const prompt = document.createElement("span");
    prompt.className = "quiz-prompt";
    setText(prompt, "quiz.prompt");
    group.appendChild(prompt);
    for (const k of ["knew", "notYet"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiz-btn quiz-self-btn";
      b.dataset.self = k;
      b.setAttribute("aria-pressed", "false");
      setText(b, `quiz.${k}`);
      group.appendChild(b);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "quiz-btn quiz-add";
    setText(add, "quiz.add");

    const status = document.createElement("p");
    status.className = "quiz-status";
    status.setAttribute("aria-live", "polite");

    row.append(group, add, status);
    card.querySelector(".quiz-answer").after(row);
    return row;
  }

  function reveal(card, open) {
    const btn = card.querySelector(".quiz-reveal");
    const answer = card.querySelector(".quiz-answer");
    if (!btn || !answer) return;
    answer.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    setText(btn, open ? "quiz.hide" : "quiz.reveal");
    card.classList.toggle("is-revealed", open);
    let row = card.querySelector(".quiz-grade");
    if (open && !row) {
      row = buildGradeRow(card);
      const s = store();
      if (s && slug) showStatus(card, loadNoteDeck(s, slug), card.dataset.quizId);
    }
    if (row) row.hidden = !open;
  }

  function cardItem(card) {
    const q = card.querySelector(".quiz-question");
    const a = card.querySelector(".quiz-answer");
    const h1 = document.querySelector("h1.title-note");
    return {
      q: q ? q.innerHTML : "",
      a: a ? a.innerHTML : "",
      url: `${location.pathname}#${card.id}`,
      title: h1 ? (h1.textContent || "").trim() : document.title,
    };
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const card = t.closest(".callout-quiz");
    if (!card) return;
    const id = card.dataset.quizId;

    if (t.closest(".quiz-reveal")) {
      reveal(card, card.querySelector(".quiz-answer").hidden);
      return;
    }

    const self = t.closest(".quiz-self-btn");
    const add = t.closest(".quiz-add");
    if (!self && !add) return;
    const s = store();
    const status = card.querySelector(".quiz-status");
    if (self) {
      card.querySelectorAll(".quiz-self-btn").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === self)),
      );
      card.dataset.self = self.dataset.self;
    }
    if (!s || !slug || !id) {
      if (add && status) say(status, "quiz.noStorage");
      return;
    }
    let deck = loadNoteDeck(s, slug);
    const g = card.dataset.self ? SELF_GRADE[card.dataset.self] : null;
    if (add) {
      if (deck.items[id]) {
        deck = removeQuestion(deck, id);
        saveNoteDeck(s, slug, deck);
        setText(add, "quiz.add");
        if (status) say(status, "quiz.removed");
        return;
      }
      deck = addQuestion(deck, id, cardItem(card), g);
    } else if (deck.items[id] && g) {
      deck = gradeQuestion(deck, id, g);
    } else if (g && isCorrect(g)) {
      // Not in the reviews, but a correct answer still counts towards the
      // note's "maîtrisée" state on reading paths (lib/path-study.ts).
      deck = recordCorrect(deck, id);
    } else return; // "Pas encore" on an unsaved question: just for the reader
    try {
      saveNoteDeck(s, slug, deck);
    } catch {
      if (status) say(status, "quiz.noStorage");
      return;
    }
    window.dispatchEvent(new CustomEvent("gk:quiz-change"));
    showStatus(card, deck, id);
  });

  // A card linked from the review page (/posts/x/#q-…) opens revealed.
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!/^q-[a-z0-9-]+$/.test(id)) return;
    const card = document.getElementById(id);
    if (card && card.classList.contains("callout-quiz")) reveal(card, true);
  }
  // `[!quiz]+` cards are built revealed: give them their grade row too.
  document
    .querySelectorAll('.callout-quiz .quiz-reveal[aria-expanded="true"]')
    .forEach((b) => reveal(b.closest(".callout-quiz"), true));
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
})();
