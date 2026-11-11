// The note's study tools (audit pédagogie 2026-11-10), its own bundle so
// lib/note-quiz.ts stays out of note.bundle.js:
// - mastery dots in the contents (drawer and rail): per section, how many of
//   its [!quiz] questions the reader has got right, and what the end-of-note
//   self-check says;
// - [!solution]: the worked solution's numbered steps, one at a time;
// - "Réviser cette formule" under each display formula: a card in the
//   note's review deck;
// - "Sûr·e / J'hésite" before a multiple-choice answer, the calibration
//   /progression/ sums up (lib/study-tools.ts);
// - at the end of the note, the self-check ("Je sais / Pas sûr / Non" per
//   objective or section → what to read again) and a 60 s free recall
//   compared with the outline;
// - a highlight made into a cloze card (the "Carte à trous" button of
//   public/js/highlights.js's card sends gk:cloze).
// Everything is built after the page loads, so Pagefind never indexes it.
import { addQuestion, loadNoteDeck, noteSlugFromPath, saveNoteDeck } from "../../lib/note-quiz.ts";
import { dayKey } from "../../lib/srs.ts";
import {
  CALIBRATION_KEY,
  addCalibration,
  clozeOf,
  parseCalibration,
  parseStudy,
  recallCoverage,
  studyKey,
  toReread,
} from "../../lib/study-tools.ts";

(function () {
  const article = document.querySelector(".article-body");
  const slug = noteSlugFromPath(location.pathname);
  if (!article || !slug) return;
  const I = () => window.__i18n || {};
  const tt = (k, v) => (I().t ? I().t(k, v) : k);
  const title = (document.querySelector("h1.title-note")?.textContent || document.title).trim();

  function store() {
    try {
      const s = window.localStorage;
      s.setItem("gkStudy:probe", "1");
      s.removeItem("gkStudy:probe");
      return s;
    } catch {
      return null;
    }
  }
  const ls = store();

  /** Text that follows the locale: data-i18n(-vars) for the runtime swap. */
  function label(el, key, vars) {
    el.textContent = tt(key, vars);
    el.setAttribute("data-i18n", key);
    if (vars) el.setAttribute("data-i18n-vars", JSON.stringify(vars));
    else el.removeAttribute("data-i18n-vars");
    return el;
  }
  function make(tag, cls, key, vars) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (key) label(el, key, vars);
    if (tag === "button") el.type = "button";
    return el;
  }
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // --- sections ---------------------------------------------------------------
  const sections = Array.from(article.querySelectorAll("h2[id]"));
  const headingText = (h) => {
    const c = h.cloneNode(true);
    c.querySelectorAll(".anchor").forEach((a) => a.remove());
    return (c.textContent || "").trim();
  };
  /** The section (h2) an element sits in, or null before the first one. */
  function sectionOf(el) {
    let found = null;
    for (const h of sections) {
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = h;
      else break;
    }
    return found;
  }

  function loadStudy() {
    return parseStudy(ls ? ls.getItem(studyKey(slug)) : null);
  }
  function saveStudy(st) {
    try {
      ls?.setItem(studyKey(slug), JSON.stringify(st));
    } catch {
      /* full or blocked */
    }
  }

  /** Add a card to this note's review deck; false when it can't be stored. */
  function addCard(id, item) {
    if (!ls) return false;
    try {
      let deck = loadNoteDeck(ls, slug);
      if (deck.items[id]) return true;
      deck = addQuestion(deck, id, { ...item, title }, null);
      saveNoteDeck(ls, slug, deck);
      window.dispatchEvent(new CustomEvent("gk:quiz-change"));
      return true;
    } catch {
      return false;
    }
  }

  // --- mastery dots in the contents --------------------------------------------
  function paintDots() {
    if (sections.length < 2) return;
    const deck = ls ? loadNoteDeck(ls, slug) : { ok: {} };
    const study = loadStudy();
    const per = new Map(sections.map((h) => [h.id, { n: 0, ok: 0 }]));
    article.querySelectorAll(".callout-quiz[data-quiz-id]").forEach((card) => {
      const h = sectionOf(card);
      if (!h) return;
      const s = per.get(h.id);
      s.n++;
      if ((deck.ok && deck.ok[card.dataset.quizId]) || card.dataset.self === "knew") s.ok++;
    });
    for (const h of sections) {
      const s = per.get(h.id);
      const check = study.check[`s:${h.id}`];
      let state = null;
      if (check === "doute" || check === "non") state = "reread";
      else if (s.n && s.ok === s.n) state = "done";
      else if (s.ok) state = "some";
      else if (s.n) state = "todo";
      else if (check === "sait") state = "done";
      document.querySelectorAll(`.toc a[href="#${CSS.escape(h.id)}"]`).forEach((a) => {
        let dot = a.querySelector(".toc-dot");
        if (!state) {
          dot?.remove();
          return;
        }
        if (!dot) {
          dot = document.createElement("span");
          dot.className = "toc-dot";
          a.prepend(dot);
        }
        dot.dataset.state = state;
        const key =
          state === "reread" ? "study.dotReread" : s.n ? "study.dotQuiz" : "study.dotKnown";
        dot.setAttribute("title", tt(key, { ok: s.ok, n: s.n }));
        dot.setAttribute("aria-label", tt(key, { ok: s.ok, n: s.n }));
        dot.setAttribute("role", "img");
      });
    }
  }

  // --- [!solution]: one step at a time -----------------------------------------
  function solutions() {
    article.querySelectorAll(".callout-solution").forEach((box) => {
      if (box.dataset.steps) return;
      const ol = box.querySelector(".callout-body ol, ol");
      const steps = ol ? Array.from(ol.children).filter((li) => li.tagName === "LI") : [];
      if (steps.length < 2) return;
      box.dataset.steps = "1";
      let shown = 1;
      steps.forEach((li, i) => (li.hidden = i > 0));
      const row = make("div", "solution-controls");
      row.setAttribute("data-pagefind-ignore", "");
      const next = make("button", "solution-next");
      const all = make("button", "solution-all", "study.solutionAll");
      const paint = () => {
        steps.forEach((li, i) => (li.hidden = i >= shown));
        if (shown >= steps.length) row.remove();
        else label(next, "study.solutionNext", { n: shown + 1, total: steps.length });
      };
      next.addEventListener("click", () => {
        shown++;
        paint();
        steps[shown - 1]?.classList.add("solution-step-new");
      });
      all.addEventListener("click", () => {
        shown = steps.length;
        paint();
      });
      row.append(next, all);
      ol.after(row);
      paint();
    });
  }

  // --- "Réviser cette formule" -------------------------------------------------
  function formulas() {
    article.querySelectorAll(".katex-display").forEach((k) => {
      if (k.dataset.card || k.closest(".callout-quiz, .quiz-answer")) return;
      k.dataset.card = "1";
      const tex = k.querySelector("annotation")?.textContent || k.textContent || "";
      if (!tex.trim()) return;
      const id = `f-${hash(tex)}`;
      const btn = make("button", "formula-card", "study.formulaAdd");
      btn.setAttribute("data-pagefind-ignore", "");
      if (ls && loadNoteDeck(ls, slug).items[id]) {
        label(btn, "study.formulaAdded");
        btn.disabled = true;
      }
      btn.addEventListener("click", () => {
        const h = sectionOf(k);
        const where = h ? headingText(h) : title;
        const ok = addCard(id, {
          q: `<p>${I().escapeHtml ? I().escapeHtml(tt("study.formulaQ", { section: where })) : where}</p>`,
          a: k.outerHTML,
          url: `${location.pathname}${h ? `#${h.id}` : ""}`,
        });
        label(btn, ok ? "study.formulaAdded" : "quiz.noStorage");
        btn.disabled = ok;
      });
      k.after(btn);
    });
  }

  // --- calibration: sure or hesitant, before answering --------------------------
  function calibration() {
    article.querySelectorAll(".callout-quiz.quiz--choice").forEach((card) => {
      if (card.querySelector(".quiz-sure")) return;
      const choices = card.querySelector(".quiz-choices");
      if (!choices) return;
      const row = make("div", "quiz-sure");
      row.setAttribute("role", "group");
      row.setAttribute("data-pagefind-ignore", "");
      label(row.appendChild(make("span", "quiz-sure-k")), "study.sureAsk");
      for (const v of ["sure", "unsure"]) {
        const b = make("button", "quiz-sure-btn", v === "sure" ? "study.sure" : "study.unsure");
        b.dataset.sure = v;
        b.setAttribute("aria-pressed", "false");
        row.appendChild(b);
      }
      choices.before(row);
    });
  }
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const sure = t && t.closest(".quiz-sure-btn");
    if (sure) {
      const card = sure.closest(".callout-quiz");
      if (card.classList.contains("is-answered") || card.dataset.calibrated) return;
      card.dataset.sure = sure.dataset.sure;
      card.querySelectorAll(".quiz-sure-btn").forEach((b) => b.setAttribute("aria-pressed", String(b === sure)));
      return;
    }
    const pick = t && t.closest(".quiz-choice");
    if (!pick) return;
    const card = pick.closest(".callout-quiz");
    // The first pick only, and only when the reader said how sure they were.
    if (!card || !card.dataset.sure || card.dataset.calibrated || pick.disabled) return;
    card.dataset.calibrated = "1";
    const isSure = card.dataset.sure === "sure";
    const ok = pick.dataset.ok === "1";
    if (ls) {
      try {
        const list = addCalibration(parseCalibration(ls.getItem(CALIBRATION_KEY)), { sure: isSure, ok, d: dayKey() });
        ls.setItem(CALIBRATION_KEY, JSON.stringify(list));
      } catch {
        /* full or blocked */
      }
    }
    const row = card.querySelector(".quiz-sure");
    if (row) {
      const key = isSure ? (ok ? "study.sureRight" : "study.sureWrong") : ok ? "study.unsureRight" : "study.unsureWrong";
      row.replaceChildren(label(make("span", "quiz-sure-said"), key));
      row.dataset.verdict = isSure && !ok ? "warn" : "ok";
    }
  }, true);

  // --- end of the note: self-check and free recall ------------------------------
  function endTools() {
    if (document.querySelector(".study-end")) return;
    const objectives = Array.from(document.querySelectorAll(".note-objectives li")).map((li) => ({
      key: `o:${hash((li.textContent || "").trim())}`,
      text: (li.textContent || "").trim(),
      href: null,
    }));
    const items = objectives.length
      ? objectives
      : sections.map((h) => ({ key: `s:${h.id}`, text: headingText(h), href: `#${h.id}` }));
    if (items.length < 2) return;

    const box = make("section", "study-end");
    box.setAttribute("data-pagefind-ignore", "");
    box.setAttribute("aria-labelledby", "study-end-h");
    const h = box.appendChild(make("h2", "study-end-h", "study.checkTitle"));
    h.id = "study-end-h";
    box.appendChild(make("p", "study-end-intro", objectives.length ? "study.checkIntroObj" : "study.checkIntro"));

    const list = box.appendChild(make("ul", "study-check"));
    const reread = make("p", "study-reread");
    reread.setAttribute("aria-live", "polite");
    const paintReread = () => {
      const st = loadStudy();
      const keys = toReread(st, items.map((i) => i.key));
      reread.replaceChildren();
      if (!keys.length) {
        reread.hidden = !items.some((i) => st.check[i.key]);
        if (!reread.hidden) label(reread.appendChild(make("span")), "study.rereadNone");
        return;
      }
      reread.hidden = false;
      label(reread.appendChild(make("b")), "study.reread");
      keys.forEach((k, n) => {
        const it = items.find((i) => i.key === k);
        if (n) reread.append(" · ");
        else reread.append(" ");
        const a = document.createElement(it.href ? "a" : "span");
        if (it.href) a.href = it.href;
        a.textContent = it.text;
        reread.appendChild(a);
      });
    };
    for (const it of items) {
      const li = list.appendChild(make("li"));
      li.appendChild(make("span", "study-check-t")).textContent = it.text;
      const group = li.appendChild(make("span", "study-check-btns"));
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", it.text);
      const current = loadStudy().check[it.key];
      for (const v of ["sait", "doute", "non"]) {
        const b = group.appendChild(make("button", "study-check-btn", `study.${v}`));
        b.dataset.v = v;
        b.setAttribute("aria-pressed", String(current === v));
        b.addEventListener("click", () => {
          const st = loadStudy();
          if (st.check[it.key] === v) delete st.check[it.key];
          else st.check[it.key] = v;
          saveStudy(st);
          group.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(st.check[it.key] === x.dataset.v)));
          paintReread();
          paintDots();
        });
      }
    }
    box.appendChild(reread);
    paintReread();

    // Free recall: write what's left of the note for a minute, then compare.
    if (sections.length >= 2) {
      const recall = box.appendChild(make("div", "study-recall"));
      recall.appendChild(make("p", "study-recall-k", "study.recallTitle"));
      recall.appendChild(make("p", "study-recall-p", "study.recallIntro"));
      const start = recall.appendChild(make("button", "study-recall-start", "study.recallStart"));
      start.addEventListener("click", () => {
        start.remove();
        const ta = document.createElement("textarea");
        ta.className = "study-recall-ta";
        ta.rows = 6;
        ta.setAttribute("aria-label", tt("study.recallTitle"));
        ta.setAttribute("data-i18n-aria-label", "study.recallTitle");
        ta.placeholder = tt("study.recallPlaceholder");
        ta.setAttribute("data-i18n-placeholder", "study.recallPlaceholder");
        const bar = make("div", "study-recall-bar");
        const clock = bar.appendChild(make("span", "study-recall-clock"));
        const done = bar.appendChild(make("button", "study-recall-done", "study.recallDone"));
        recall.append(ta, bar);
        ta.focus();
        let left = 60;
        clock.textContent = "1:00";
        const timer = setInterval(() => {
          left--;
          clock.textContent = `0:${String(Math.max(0, left)).padStart(2, "0")}`;
          if (left <= 0) finish();
        }, 1000);
        function finish() {
          clearInterval(timer);
          ta.readOnly = true;
          bar.remove();
          const names = sections.map(headingText);
          const cov = recallCoverage(ta.value, names);
          const n = cov.filter(Boolean).length;
          const out = make("div", "study-recall-out");
          out.appendChild(make("p", "study-recall-score", "study.recallScore", { n, total: names.length }));
          const ul = out.appendChild(make("ul"));
          sections.forEach((h, i) => {
            const li = ul.appendChild(make("li"));
            li.dataset.hit = cov[i] ? "1" : "0";
            const a = li.appendChild(document.createElement("a"));
            a.href = `#${h.id}`;
            a.textContent = names[i];
          });
          if (n < names.length) out.appendChild(make("p", "study-recall-tip", "study.recallTip"));
          recall.appendChild(out);
        }
        done.addEventListener("click", finish);
      });
    }

    const anchor = document.querySelector(".note-colophon") || article;
    anchor.after(box);
  }

  // --- a highlight as a cloze card ---------------------------------------------
  window.addEventListener("gk:cloze", (e) => {
    const d = e.detail || {};
    const mark = d.mark;
    const quote = (d.quote || "").trim();
    const block = mark && mark.closest("p, li, td, blockquote");
    const sentence = block ? block.textContent || "" : "";
    // The sentence the quote sits in, not the whole paragraph.
    const parts = sentence.split(/(?<=[.!?…])\s+/);
    const one = parts.find((p) => p.includes(quote)) || sentence;
    const cloze = clozeOf(one, quote);
    const reply = (key) => d.done && d.done(key);
    if (!cloze) return reply("study.clozeNone");
    const esc = I().escapeHtml || ((s) => s);
    const h = sectionOf(mark);
    const ok = addCard(`c-${hash(quote + one)}`, {
      q: `<p>${esc(cloze)}</p>`,
      a: `<p><strong>${esc(quote)}</strong></p><p>${esc(one)}</p>`,
      url: `${location.pathname}${h ? `#${h.id}` : ""}`,
    });
    reply(ok ? "study.clozeAdded" : "quiz.noStorage");
  });

  function init() {
    solutions();
    formulas();
    calibration();
    endTools();
    paintDots();
  }
  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });
  // The rail is cloned by toc.js; repaint once it is surely there, and on
  // every graded question.
  setTimeout(paintDots, 1500);
  window.addEventListener("gk:quiz-change", paintDots);
  document.addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest(".quiz-self-btn, .quiz-choice")) setTimeout(paintDots, 0);
  });
})();
