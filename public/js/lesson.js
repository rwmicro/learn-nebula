// "Lire en leçon": the same note, one screen at a time (part of quiz.bundle.js,
// so only notes with questions load it; SinglePage shows the button on notes
// with two questions or more).
// - Each `##` section is one step; each question card (`[!quiz]`, `[!predict]`)
//   becomes a step of its own right after the text it follows, and the reader
//   answers it (or skips it) to go on.
// - The article's own nodes are moved into the lesson and put back on exit,
//   so quiz.js, the widgets and the glossary keep working on them unchanged.
// - The last screen counts the questions right at the first try and offers
//   the next step of the reading path; finishing marks the note read.
// - A run of three exercises or more in a row ([!traduire], [!associer],
//   multiple-choice [!quiz]…) folds into one card, "8 exercices sur cette
//   note", whose button opens the same screen on those exercises only: a
//   series. A miss comes back once at the end, and the last screen lists
//   what to review (added to the note's review deck on request).
import { recordActivity } from "../../lib/personal";
import { SELF_GRADE, addQuestion, loadNoteDeck, noteSlugFromPath, saveNoteDeck } from "../../lib/note-quiz.ts";
import { cardId } from "../../lib/srs.ts";
import {
  CHANGE_EVENT,
  isRead,
  loadStore,
  markRead,
  saveStore,
} from "../../lib/reading-progress";
import { keepAwake } from "../../lib/wake-lock";

(function () {
  const body = document.querySelector(".article-body");
  const btn = document.querySelector(".lesson-btn");
  if (!body) return;
  const tt = (k, v) =>
    window.__i18n && window.__i18n.t ? window.__i18n.t(k, v) : k;
  const slug =
    document
      .querySelector(".read-state[data-slug]")
      ?.getAttribute("data-slug") || null;
  btn.hidden = false;

  const isQuestion = (n) =>
    n instanceof Element &&
    (n.classList.contains("callout-quiz") ||
      n.classList.contains("callout-predict") ||
      n.classList.contains("callout-ex") ||
      // The timeline exercise under a mermaid frise (exercises.js).
      (n.classList.contains("frise-ex") && !!n.querySelector(".callout-ex")) ||
      // A widget with a goal (widgets.js withGoals) is a question too.
      (n.classList.contains("widget") && !!n.querySelector(".w-goals")));
  const isHeading = (n) => n instanceof Element && /^H[1-6]$/.test(n.tagName);
  const isBlank = (n) => n.nodeType === Node.TEXT_NODE && !n.textContent.trim();

  // Steps from the article's top-level nodes, in order.
  function buildSteps() {
    const steps = [];
    let cur = [];
    const flush = () => {
      if (cur.some((n) => !isBlank(n)))
        steps.push({ kind: "text", nodes: cur });
      cur = [];
    };
    const split = body.querySelector(":scope > h2") ? "H2" : "H3";
    for (const n of Array.from(body.childNodes)) {
      if (isQuestion(n)) {
        // A section that opens on its question: the heading alone would be
        // a step of its own; the kicker says where we are instead.
        if (cur.every((x) => isBlank(x) || isHeading(x))) cur = [];
        flush();
        steps.push({ kind: "question", nodes: [n] });
        continue;
      }
      if (n instanceof Element && n.tagName === split) flush();
      cur.push(n);
    }
    flush();
    return steps;
  }

  // The card of a question step (a frise's sits inside its box).
  const cardOf = (step) => {
    const n = step.nodes[0];
    return n.classList.contains("frise-ex") ? n.querySelector(".callout-ex") || n : n;
  };

  let ui = null;

  function open(opts) {
    if (ui) return;
    // A series: only the given exercises, one step each.
    const series = opts && Array.isArray(opts.items) ? opts.items : null;
    const steps = series ? series.map((n) => ({ kind: "question", nodes: [n] })) : buildSteps();
    if (!steps.length) return;
    const first = new Map(); // card → right at the first try (series)
    // "À ton avis ?" veils are pointless here: the order already holds back
    // the answer. Their explanation still shows when a guess is picked.
    body
      .querySelectorAll(".callout-predict .predict-skip:not([hidden])")
      .forEach((b) => b.click());

    const marks = [];
    const opener = document.activeElement;
    const crumbs = document.querySelectorAll(".note-header .crumbs a");
    const place = crumbs.length ? crumbs[crumbs.length - 1].textContent.trim() : "";
    const title = (document.querySelector(".note-header h1, h1")?.textContent || "").trim();
    const kicker = [place, title].filter(Boolean).join(" · ");
    // The screen stays on for the lesson's length (lib/wake-lock.ts).
    const sleep = keepAwake();
    const root = document.createElement("div");
    root.className = series ? "lesson lesson--series" : "lesson";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", tt("lesson.aria"));
    root.setAttribute("data-pagefind-ignore", "");
    root.innerHTML =
      `<div class="lesson-top">` +
      `<button type="button" class="lesson-exit" aria-label="${tt("lesson.exit")}">×</button>` +
      `<div class="lesson-segs" aria-hidden="true">${steps.map((s) => `<i class="lesson-seg lesson-seg--${s.kind}"></i>`).join("")}</div>` +
      `<span class="lesson-count" aria-live="polite"></span>` +
      `</div>` +
      `<div class="lesson-scroll"><div class="lesson-stage article-body"></div></div>` +
      `<div class="lesson-bottom">` +
      `<button type="button" class="lesson-back"></button>` +
      `<p class="lesson-wait" hidden></p>` +
      `<button type="button" class="lesson-skip" hidden></button>` +
      `<button type="button" class="lesson-next"></button>` +
      `</div>`;
    (document.querySelector("main#main") || document.body).appendChild(root);
    document.documentElement.classList.add("lesson-open");

    // The answered question's feedback docks just above this bar (main.css).
    const bottom = root.querySelector(".lesson-bottom");
    const sizeBottom = () =>
      root.style.setProperty("--lesson-bottom-h", `${bottom.offsetHeight}px`);
    const ro = new ResizeObserver(sizeBottom);
    ro.observe(bottom);
    const stage = root.querySelector(".lesson-stage");
    const scroll = root.querySelector(".lesson-scroll");
    const count = root.querySelector(".lesson-count");
    const segs = Array.from(root.querySelectorAll(".lesson-seg"));
    const back = root.querySelector(".lesson-back");
    const next = root.querySelector(".lesson-next");
    const skip = root.querySelector(".lesson-skip");
    const wait = root.querySelector(".lesson-wait");
    back.textContent = tt("lesson.back");
    skip.textContent = tt("lesson.skip");
    wait.textContent = tt("lesson.answerFirst");
    let i = 0;
    const skipped = new Set();

    // Move a step's nodes onto the stage, leaving a marker to put them back.
    function show(k) {
      for (const n of Array.from(stage.childNodes)) {
        const m = marks.find((x) => x.node === n);
        if (m) m.mark.replaceWith(n);
        else n.remove();
      }
      marks.length = 0;
      i = k;
      if (k >= steps.length) return finish();
      for (const n of steps[k].nodes) {
        const mark = document.createComment("lesson");
        n.replaceWith(mark);
        marks.push({ node: n, mark });
        stage.appendChild(n);
      }
      // The note's dropcap belongs to its opening only (main.css).
      stage.toggleAttribute("data-later", k > 0);
      if (steps[k].kind === "question") {
        // "Discipline · Note" above the question, as the mockups' kicker.
        const h = document.createElement("div");
        h.className = "lesson-check";
        h.textContent = kicker || tt("lesson.check");
        stage.prepend(h);
      }
      segs.forEach((s, j) => {
        s.classList.toggle("is-done", j < k);
        s.classList.toggle("is-current", j === k);
      });
      count.textContent = tt("lesson.progress", {
        n: k + 1,
        total: steps.length,
      });
      back.hidden = k === 0 || !!series;
      next.textContent = tt("lesson.next");
      // A miss back for its second try: start it afresh.
      if (steps[k].retry) {
        const card = cardOf(steps[k]);
        card.querySelector(".quiz-feedback .ex-again")?.click();
      }
      scroll.scrollTop = 0;
      update();
      const focusable = stage.querySelector(
        ".quiz-choice:not(:disabled), .quiz-reveal, .ex-bank .ex-chip, .ex-col .ex-chip",
      );
      (focusable || next).focus({ preventScroll: true });
    }

    function answered() {
      const step = steps[i];
      if (!step || step.kind !== "question" || skipped.has(i)) return true;
      const card = cardOf(step);
      return (
        !!card.querySelector('.w-goal-foot:is([data-state="ok"], [data-state="done"])') ||
        card.classList.contains("is-answered") ||
        card.classList.contains("is-revealed") ||
        card.classList.contains("is-open") ||
        (card.classList.contains("callout-predict") &&
          !card.querySelector(".quiz-choice"))
      );
    }
    // An exercise not yet answered: the bottom button is its "Vérifier"
    // (the card's own is hidden here, main.css).
    function proxyCheck() {
      const step = steps[i];
      if (!step || step.kind !== "question" || skipped.has(i)) return null;
      const card = cardOf(step);
      if (!card.classList.contains("callout-ex") || card.classList.contains("is-answered")) return null;
      return card.querySelector(".ex-foot .ex-check:not(.ex-restart)");
    }
    function update() {
      if (i >= steps.length) return;
      const pc = proxyCheck();
      if (pc) {
        next.textContent = tt("ex.check");
        next.disabled = pc.disabled;
        skip.hidden = false;
        wait.hidden = true;
        return;
      }
      next.textContent = tt("lesson.next");
      const ok = answered();
      next.disabled = !ok;
      skip.hidden = ok;
      wait.hidden = ok;
    }
    // quiz.js changes the card's classes: follow them to unlock "Continuer".
    const obs = new MutationObserver(update);
    obs.observe(stage, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class", "disabled"],
    });

    // Series: how the step just left went, the first time; a missed
    // exercise comes back once, at the end.
    function settleStep(k) {
      const step = steps[k];
      if (!series || !step || step.retry) return;
      const card = cardOf(step);
      if (first.has(card)) return;
      const ok =
        !skipped.has(k) &&
        (card.classList.contains("callout-ex")
          ? !!card.querySelector(".quiz-feedback--ok")
          : card.dataset.self === "knew");
      first.set(card, ok);
      if (!ok && card.classList.contains("callout-ex") && card.classList.contains("is-answered")) {
        steps.push({ kind: "question", nodes: [card], retry: true });
        const seg = document.createElement("i");
        seg.className = "lesson-seg lesson-seg--question";
        root.querySelector(".lesson-segs").appendChild(seg);
        segs.push(seg);
      }
    }

    function finish() {
      obs.disconnect();
      segs.forEach((s) => {
        s.classList.add("is-done");
        s.classList.remove("is-current");
      });
      if (series) return finishSeries();
      const cards = steps
        .filter(
          (s) =>
            s.kind === "question" &&
            s.nodes[0].classList.contains("callout-quiz"),
        )
        .map((s) => s.nodes[0]);
      const right = cards.filter((c) => c.dataset.self === "knew").length;
      if (slug) {
        const store = loadStore();
        if (!isRead(store, slug)) {
          saveStore(markRead(store, slug));
          window.dispatchEvent(new Event(CHANGE_EVENT));
          recordActivity("r");
        }
      }
      const nextStep = document.querySelector('.path-step a[rel="next"]');
      const nextTitle =
        nextStep?.querySelector(".path-step-name")?.textContent || "";
      stage.innerHTML = "";
      const end = document.createElement("div");
      end.className = "lesson-end";
      end.innerHTML =
        `<div class="lesson-medal" aria-hidden="true"><span>✓</span></div>` +
        `<h2 class="lesson-end-title"></h2><p class="lesson-end-stats"></p>`;
      end.querySelector(".lesson-end-title").textContent = tt("lesson.done");
      end.querySelector(".lesson-end-stats").textContent = cards.length
        ? tt("lesson.doneStats", { right, total: cards.length })
        : tt("lesson.doneNoQuiz");
      stage.appendChild(end);
      count.textContent = tt("lesson.done");
      back.hidden = true;
      skip.hidden = true;
      wait.hidden = true;
      next.disabled = false;
      if (nextStep) {
        next.textContent = tt("lesson.nextNote", { title: nextTitle });
        next.onclick = () => {
          close();
          location.href = nextStep.href;
        };
        const toNote = document.createElement("button");
        toNote.type = "button";
        toNote.className = "lesson-to-note";
        toNote.textContent = tt("lesson.toNote");
        toNote.addEventListener("click", close);
        end.appendChild(toNote);
      } else {
        next.textContent = tt("lesson.toNote");
        next.onclick = close;
      }
      next.focus({ preventScroll: true });
    }

    // The prompt and the expected answer of a card, as text.
    function promptOf(card) {
      const q = card.querySelector(".ex-prompt, .quiz-question");
      if (!q) return "";
      const c = q.cloneNode(true);
      c.querySelectorAll("button, .ex-say").forEach((x) => x.remove());
      return c.textContent.replace(/\s+/g, " ").trim();
    }
    function answerOf(card) {
      if (card.classList.contains("callout-quiz")) {
        const r = card.querySelector('.quiz-choice[data-ok="1"]');
        if (!r) return "";
        const c = r.cloneNode(true);
        c.querySelectorAll(".quiz-why, .quiz-sprout, .quiz-key").forEach((x) => x.remove());
        return c.textContent.replace(/\s+/g, " ").trim();
      }
      let d = null;
      try {
        d = JSON.parse(card.dataset.exData || "null");
      } catch {
        /* no data */
      }
      if (!d) return "";
      if (d.answer) return d.answer;
      if (d.items) return d.items.map((x) => (typeof x === "string" ? x : x.what)).join(" → ");
      if (d.pairs) return d.pairs.map(([a, b]) => `${a} = ${b}`).join(" · ");
      if (d.line) return tt("ex.lineN", { n: d.line });
      return "";
    }
    const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const lsGet = () => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    };

    function finishSeries() {
      const total = series.length;
      const missed = series.filter((c) => first.get(c) === false || !first.has(c));
      const right = total - missed.length;
      const ls = lsGet();
      const nslug = noteSlugFromPath(location.pathname);
      if (ls && nslug && opts.key) {
        try {
          ls.setItem(`ex-series:${nslug}:${opts.key}`, JSON.stringify({ right, total }));
        } catch {
          /* full or blocked */
        }
      }
      stage.innerHTML = "";
      const end = document.createElement("div");
      end.className = "lesson-end series-end";
      const ring = document.createElement("div");
      ring.className = "series-ring";
      ring.style.setProperty("--p", String(total ? right / total : 0));
      ring.innerHTML = `<span><b></b><small></small></span>`;
      ring.querySelector("b").textContent = `${right}/${total}`;
      ring.querySelector("small").textContent = tt("ex.endRight");
      const title = document.createElement("h2");
      title.className = "lesson-end-title";
      title.textContent = tt("ex.endTitle");
      end.append(ring, title);
      let add = null;
      if (missed.length) {
        const box = document.createElement("div");
        box.className = "series-missed";
        const k = document.createElement("p");
        k.className = "series-missed-k";
        k.textContent = tt("ex.endMissed");
        const list = document.createElement("ul");
        for (const c of missed) {
          const li = document.createElement("li");
          const q = document.createElement("span");
          q.className = "series-q";
          q.textContent = promptOf(c);
          const a = document.createElement("span");
          a.className = "series-a";
          a.textContent = answerOf(c);
          li.append(q, a);
          list.appendChild(li);
        }
        const label = document.createElement("label");
        label.className = "series-add";
        add = document.createElement("input");
        add.type = "checkbox";
        add.checked = true;
        label.append(add, document.createTextNode(` ${tt("ex.endAdd")}`));
        box.append(k, list, label);
        end.appendChild(box);
      } else {
        const p = document.createElement("p");
        p.className = "lesson-end-stats";
        p.textContent = tt("ex.endAll");
        end.appendChild(p);
      }
      stage.appendChild(end);
      count.textContent = tt("ex.endTitle");
      back.hidden = true;
      skip.hidden = true;
      wait.hidden = true;
      next.disabled = false;
      // The misses go to the note's review deck, if asked, on the way out.
      const keep = () => {
        if (!add || !add.checked || !ls || !nslug) return;
        let deck = loadNoteDeck(ls, nslug);
        const h1 = document.querySelector("h1.title-note");
        for (const c of missed) {
          const q = promptOf(c);
          const a = answerOf(c);
          if (!q || !a) continue;
          const id = c.dataset.quizId || `ex-${cardId(q, a)}`;
          deck = addQuestion(
            deck,
            id,
            {
              q: esc(q),
              a: esc(a),
              url: c.id ? `${location.pathname}#${c.id}` : location.pathname,
              title: h1 ? (h1.textContent || "").trim() : document.title,
            },
            SELF_GRADE.notYet,
          );
        }
        try {
          saveNoteDeck(ls, nslug, deck);
          window.dispatchEvent(new CustomEvent("gk:quiz-change"));
        } catch {
          /* full or blocked */
        }
      };
      next.textContent = tt("ex.endBack");
      next.onclick = () => {
        keep();
        close();
      };
      // The missed exercises again (multiple choice can't be undone: those
      // wait for the reviews).
      const redo = missed.filter((c) => c.classList.contains("callout-ex"));
      if (redo.length) {
        const again = document.createElement("button");
        again.type = "button";
        again.className = "lesson-to-note series-again";
        again.textContent = tt("ex.endRetry");
        again.addEventListener("click", () => {
          keep();
          close();
          for (const c of redo) c.querySelector(".quiz-feedback .ex-again")?.click();
          open({ items: redo, key: null });
        });
        end.appendChild(again);
      }
      next.focus({ preventScroll: true });
    }

    function close() {
      sleep();
      obs.disconnect();
      ro.disconnect();
      for (const m of marks) m.mark.replaceWith(m.node);
      marks.length = 0;
      root.remove();
      document.documentElement.classList.remove("lesson-open");
      document.removeEventListener("keydown", onKey, true);
      ui = null;
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    }

    function onKey(e) {
      // Desktop: answer with the keyboard. 1–9 press the Nth answer (or
      // word, or item) of the current card, Enter goes on once answered.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        // (Exercises have their own keys, exercises.js.)
        const opts = stage.querySelectorAll(".quiz-choice:not(:disabled)");
        const b = opts[Number(e.key) - 1];
        if (b) {
          e.preventDefault();
          b.click();
          return;
        }
      }
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement) && !next.disabled) {
        e.preventDefault();
        next.click();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        // Keep focus inside the lesson.
        const f = Array.from(
          root.querySelectorAll(
            "button:not([disabled]):not([hidden]), a[href], [tabindex]:not([tabindex='-1'])",
          ),
        ).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey, true);

    root.querySelector(".lesson-exit").addEventListener("click", close);
    back.addEventListener("click", () => i > 0 && show(i - 1));
    skip.addEventListener("click", () => {
      skipped.add(i);
      update();
      settleStep(i);
      show(i + 1);
    });
    next.onclick = () => {
      if (next.disabled) return;
      const pc = proxyCheck();
      if (pc) pc.click();
      else {
        settleStep(i);
        show(i + 1);
      }
    };
    ui = { close };
    show(0);
  }

  if (btn) btn.addEventListener("click", () => open());

  // --- Runs of exercises: one card in the note, a series on demand ----------
  const isRunItem = (n) =>
    n instanceof Element &&
    ((n.classList.contains("callout-ex") && n.hasAttribute("data-ex")) ||
      (n.classList.contains("callout-quiz") && n.classList.contains("quiz--choice")));
  const SECONDS = { traduire: 30, associer: 45, ordre: 40, ligne: 30, choisir: 25 };
  const typeOf = (n) => (n.classList.contains("callout-quiz") ? "choisir" : n.dataset.ex);

  function launcher(items, key) {
    const box = document.createElement("div");
    box.className = "ex-launch";
    box.setAttribute("data-pagefind-ignore", "");
    const counts = {};
    for (const n of items) counts[typeOf(n)] = (counts[typeOf(n)] || 0) + 1;
    const secs = items.reduce((t, n) => t + (SECONDS[typeOf(n)] || 30), 0);
    const t = (k, v) => {
      const e = document.createElement("span");
      e.textContent = tt(k, v);
      e.setAttribute("data-i18n", k);
      if (v) e.setAttribute("data-i18n-vars", JSON.stringify(v));
      return e;
    };
    const top = document.createElement("div");
    top.className = "ex-launch-top";
    const kick = t("ex.yourTurn");
    kick.className = "ex-launch-k";
    const time = t("ex.runTime", { n: Math.max(1, Math.round(secs / 60)) });
    time.className = "ex-launch-time";
    top.append(kick, time);
    const title = document.createElement("p");
    title.className = "ex-launch-title";
    title.append(t("ex.runTitle", { n: items.length }));
    const pills = document.createElement("div");
    pills.className = "ex-launch-pills";
    for (const [type, n] of Object.entries(counts)) pills.append(t(`ex.pill_${type}`, { n }));
    const last = document.createElement("p");
    last.className = "ex-launch-last";
    last.hidden = true;
    const ls = lsGetGlobal();
    const nslug = noteSlugFromPath(location.pathname);
    let before = null;
    try {
      before = ls && nslug ? JSON.parse(ls.getItem(`ex-series:${nslug}:${key}`) || "null") : null;
    } catch {
      before = null;
    }
    if (before && before.total) {
      last.hidden = false;
      last.append(t("ex.runLast", { right: before.right, total: before.total }));
    }
    const go = document.createElement("button");
    go.type = "button";
    go.className = "ex-launch-go";
    go.append(t(before ? "ex.runAgain" : "ex.runStart"));
    go.addEventListener("click", () => {
      // A fresh start for the cards already answered in the page.
      for (const n of items) n.querySelector(".quiz-feedback .ex-again")?.click();
      open({ items, key });
    });
    const show = document.createElement("button");
    show.type = "button";
    show.className = "ex-launch-show";
    show.setAttribute("aria-expanded", "false");
    show.append(t("ex.runShow"));
    show.addEventListener("click", () => {
      const opening = show.getAttribute("aria-expanded") !== "true";
      show.setAttribute("aria-expanded", String(opening));
      show.replaceChildren(t(opening ? "ex.runHide" : "ex.runShow"));
      for (const n of items) n.classList.toggle("ex-folded", !opening);
    });
    box.append(top, title, pills, last, go, show);
    return box;
  }
  function lsGetGlobal() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function foldRuns() {
    if (document.documentElement.classList.contains("lesson-open") || body.querySelector(":scope > .ex-launch")) return;
    const runs = [];
    let cur = [];
    for (const n of Array.from(body.childNodes)) {
      if (isRunItem(n)) cur.push(n);
      else if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) continue;
      else {
        if (cur.length) runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);
    runs
      .filter((r) => r.length >= 3)
      .forEach((items, k) => {
        items[0].before(launcher(items, String(k)));
        for (const n of items) n.classList.add("ex-folded");
      });
  }
  foldRuns();
  // A translation (translate.js) swaps the article body: fold it again.
  if ("MutationObserver" in window) {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        foldRuns();
      });
    }).observe(body, { childList: true });
  }
})();
