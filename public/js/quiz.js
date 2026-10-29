// Retrieval-practice cards in the note body (`> [!quiz] Question`, rendered by
// lib/markdown.ts as .callout-quiz with a hidden .quiz-answer).
// - "Afficher la réponse" toggles the answer (aria-expanded on the button);
// - once revealed, the reader grades themselves ("Je savais" / "Pas encore")
//   and can add the question to their spaced-repetition reviews, stored with
//   the Anki decks' scheduler under `srs:note:<note-slug>` (lib/note-quiz.ts)
//   and reviewed at /cartes/revision/.
// - multiple-choice cards (`- [ ]` / `- [x]` in the callout): the reader picks
//   an answer, gets its own explanation, and the pick grades the card;
//   "Indice : …" lines are hints shown one at a time;
// - "À ton avis ?" (`[!predict]`): the rest of the section stays veiled until
//   the reader picks an answer or reads on anyway.
// Click handling is delegated from the document, so it keeps working after
// /js/translate.js swaps the article body. The self-grade row is created
// here, after the build, so Pagefind never indexes it; print hides it.
import { recordActivity } from "../../lib/personal";
import { FEEDBACK_BAD, FEEDBACK_GOOD } from "../../lib/deco-art";
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
import { loadSettings } from "../../lib/srs-settings.ts";
// "Lire en leçon" rides along: only notes with questions offer it.
import "./lesson.js";
// The other exercises of a note ([!traduire], [!ordre]…, lib/exercises.ts).
import "./exercises.js";

(function () {
  const slug = noteSlugFromPath(location.pathname);
  // The reader's target retention (/cartes/ deck settings) for the grades below.
  loadSettings();

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

  // Grade a card ("knew" / "notYet") and, with `add`, toggle it in the
  // reviews: what the self-grade buttons and "add" do, and what a picked
  // answer of a multiple-choice card does on its own.
  function record(card, { self, add } = {}) {
    const id = card.dataset.quizId;
    const s = store();
    const status = card.querySelector(".quiz-status");
    if (self) {
      card.querySelectorAll(".quiz-self-btn").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.self === self)),
      );
      card.dataset.self = self;
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
    if (g) recordActivity("c");
    showStatus(card, deck, id);
  }

  // --- multiple choice ("quiz--choice") and "À ton avis ?" ("callout-predict")

  // The feedback band under the answers: what the picked answer says (its
  // own line in the vault, else a stock sentence), and what to do next.
  function feedback(card, kind, whyHtml, actions) {
    const box = card.querySelector(".quiz-feedback");
    if (!box) return;
    box.className = `quiz-feedback quiz-feedback--${kind}`;
    box.replaceChildren();
    const head = document.createElement("p");
    head.className = "quiz-feedback-title";
    const key = {
      ok: "quiz.right",
      shown: "quiz.answerShown",
      bad: "quiz.notQuite",
      guess: "predict.thanks",
      predictOk: "predict.right",
      predictBad: "predict.wrong",
    }[kind];
    setText(head, key);
    box.appendChild(head);
    if (whyHtml) {
      const why = document.createElement("div");
      why.className = "quiz-feedback-why";
      why.innerHTML = whyHtml;
      box.appendChild(why);
    }
    if (actions && actions.length) {
      const row = document.createElement("div");
      row.className = "quiz-feedback-actions";
      for (const [cls, k] of actions) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `quiz-btn ${cls}`;
        setText(b, k);
        row.appendChild(b);
      }
      box.appendChild(row);
    }
    box.hidden = false;
  }

  // The picked answer's drawing (lib/deco-art.ts): a leaf unfolds when it is
  // right; when it is wrong the sprout only bends, nothing wilts.
  function sprout(btn, art) {
    if (btn.querySelector(".quiz-sprout")) return;
    const s = document.createElement("span");
    s.className = "quiz-sprout deco";
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = art;
    btn.appendChild(s);
  }

  const whyOf = (btn) => btn.querySelector(".quiz-why")?.innerHTML || "";

  function lockChoices(card) {
    card.classList.add("is-answered");
    card.querySelectorAll(".quiz-choice").forEach((b) => {
      if (b.dataset.ok === "1") b.classList.add("is-right");
      b.disabled = true;
    });
  }

  // After a pick, a choice card ends on one band (the feedback): the green
  // answer already says which one is right, so the answer panel only stays
  // for what else the note says, and "add to my reviews" joins the band.
  function settle(card) {
    const answer = card.querySelector(".quiz-answer");
    const box = card.querySelector(".quiz-feedback");
    if (answer) {
      const extra = [...answer.children].some(
        (n) => !n.matches(".quiz-right, .quiz-right-why") && !n.hidden,
      );
      answer.hidden = !extra;
    }
    const row = card.querySelector(".quiz-grade");
    if (box && row) {
      box.hidden = false;
      box.appendChild(row);
    }
  }

  function pickQuiz(card, btn) {
    if (card.classList.contains("is-answered")) return;
    card.querySelectorAll(".quiz-choice.is-wrong-now").forEach((b) => b.classList.remove("is-wrong-now"));
    const tries = Number(card.dataset.tries || 0) + 1;
    card.dataset.tries = String(tries);
    if (btn.dataset.ok === "1") {
      btn.classList.add("is-picked");
      sprout(btn, FEEDBACK_GOOD);
      lockChoices(card);
      feedback(card, "ok", whyOf(btn));
      reveal(card, true);
      // Right at the first try: "Je savais"; after a miss: "Pas encore".
      record(card, { self: tries === 1 ? "knew" : "notYet" });
      settle(card);
    } else {
      btn.classList.add("is-wrong", "is-wrong-now");
      btn.disabled = true;
      sprout(btn, FEEDBACK_BAD);
      feedback(card, "bad", whyOf(btn) || "", [
        ["quiz-retry", "quiz.retry"],
        ["quiz-show", "quiz.showAnswer"],
      ]);
    }
  }

  function showAnswer(card) {
    lockChoices(card);
    const right = card.querySelector('.quiz-choice[data-ok="1"]');
    if (card.classList.contains("callout-quiz")) {
      // Why the right answer is right, in the same band.
      feedback(card, "shown", right ? whyOf(right) : "");
      reveal(card, true);
      if (!card.dataset.self) record(card, { self: "notYet" });
      settle(card);
    } else if (right) {
      feedback(card, "predictBad", whyOf(right));
    }
  }

  // "À ton avis ?": the rest of the section, veiled until an answer.
  function restOf(card) {
    const next = card.nextElementSibling;
    return next && next.matches("[data-predict-rest]") ? next : null;
  }
  function unveil(card) {
    card.classList.add("is-open");
    const rest = restOf(card);
    if (rest) {
      rest.classList.remove("is-veiled");
      rest.removeAttribute("inert");
      rest.removeAttribute("aria-hidden");
    }
    const after = card.querySelector("[data-predict-after]");
    if (after) after.hidden = false;
    const skip = card.querySelector(".predict-skip");
    if (skip) skip.hidden = true;
    card.querySelector(".predict-veil-note")?.remove();
  }
  function pickPredict(card, btn) {
    if (card.classList.contains("is-answered")) return;
    const hasRight = !!card.querySelector('.quiz-choice[data-ok="1"]');
    btn.classList.add("is-picked");
    lockChoices(card);
    if (!hasRight) feedback(card, "guess", whyOf(btn));
    else if (btn.dataset.ok === "1") {
      sprout(btn, FEEDBACK_GOOD);
      feedback(card, "predictOk", whyOf(btn));
    } else {
      btn.classList.add("is-wrong");
      sprout(btn, FEEDBACK_BAD);
      const right = card.querySelector('.quiz-choice[data-ok="1"]');
      feedback(card, "predictBad", [whyOf(btn), whyOf(right)].filter(Boolean).join(" "));
    }
    unveil(card);
  }

  // Veil each "À ton avis ?" section until it is answered. A card linked
  // to by a hash, or one the reader has scrolled past, stays open.
  document.querySelectorAll(".callout-predict").forEach((card) => {
    const rest = restOf(card);
    const after = card.querySelector("[data-predict-after]");
    if (after) after.hidden = true;
    if (!card.querySelector(".quiz-choice") && !rest) return;
    const skip = card.querySelector(".predict-skip");
    if (skip) skip.hidden = false;
    if (!rest) return;
    if (card.getBoundingClientRect().bottom < 0) return unveil(card);
    rest.classList.add("is-veiled");
    rest.setAttribute("inert", "");
    rest.setAttribute("aria-hidden", "true");
    const note = document.createElement("p");
    note.className = "predict-veil-note";
    setText(note, "predict.veiled");
    card.appendChild(note);
  });

  // Hints: one more at each click; the button goes once all are shown.
  function nextHint(card, btn) {
    const hidden = card.querySelector(".quiz-hint[hidden]");
    if (hidden) hidden.hidden = false;
    if (!card.querySelector(".quiz-hint[hidden]")) btn.hidden = true;
    else setText(btn, "quiz.hintMore");
  }

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const predict = t.closest(".callout-predict");
    if (predict) {
      const choice = t.closest(".quiz-choice");
      if (choice) return pickPredict(predict, choice);
      if (t.closest(".predict-skip")) return unveil(predict);
      const hb = t.closest(".quiz-hint-btn");
      if (hb) return nextHint(predict, hb);
      return;
    }
    const card = t.closest(".callout-quiz");
    if (!card) return;

    const choice = t.closest(".quiz-choice");
    if (choice) return pickQuiz(card, choice);
    if (t.closest(".quiz-retry")) {
      card.querySelector(".quiz-feedback").hidden = true;
      card.querySelector(".quiz-choice:not(:disabled)")?.focus();
      return;
    }
    if (t.closest(".quiz-show")) return showAnswer(card);
    const hb = t.closest(".quiz-hint-btn");
    if (hb) return nextHint(card, hb);

    if (t.closest(".quiz-reveal")) {
      const opening = card.querySelector(".quiz-answer").hidden;
      // Revealing a multiple-choice card before picking gives the answer away.
      if (opening && card.classList.contains("quiz--choice") && !card.classList.contains("is-answered"))
        return showAnswer(card);
      reveal(card, opening);
      return;
    }

    const self = t.closest(".quiz-self-btn");
    const add = t.closest(".quiz-add");
    if (!self && !add) return;
    record(card, { self: self ? self.dataset.self : undefined, add: add || undefined });
  });

  // A card linked from the review page (/posts/x/#q-…) opens revealed.
  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!/^q-[a-z0-9-]+$/.test(id)) return;
    const card = document.getElementById(id);
    if (!card || !card.classList.contains("callout-quiz")) return;
    if (card.classList.contains("quiz--choice")) showAnswer(card);
    else reveal(card, true);
  }
  // `[!quiz]+` cards are built revealed: give them their grade row too.
  document
    .querySelectorAll('.callout-quiz .quiz-reveal[aria-expanded="true"]')
    .forEach((b) => reveal(b.closest(".callout-quiz"), true));
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
})();
