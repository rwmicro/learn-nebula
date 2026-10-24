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
import { recordActivity } from "../../lib/personal";
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
  if (!body || !btn) return;
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
      n.classList.contains("callout-ex"));
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

  let ui = null;

  function open() {
    if (ui) return;
    const steps = buildSteps();
    if (!steps.length) return;
    // "À ton avis ?" veils are pointless here: the order already holds back
    // the answer. Their explanation still shows when a guess is picked.
    body
      .querySelectorAll(".callout-predict .predict-skip:not([hidden])")
      .forEach((b) => b.click());

    const marks = [];
    const opener = document.activeElement;
    // The screen stays on for the lesson's length (lib/wake-lock.ts).
    const sleep = keepAwake();
    const root = document.createElement("div");
    root.className = "lesson";
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
        const h = document.createElement("div");
        h.className = "lesson-check";
        h.textContent = tt("lesson.check");
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
      back.hidden = k === 0;
      next.textContent = tt("lesson.next");
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
      const card = step.nodes[0];
      return (
        card.classList.contains("is-answered") ||
        card.classList.contains("is-revealed") ||
        card.classList.contains("is-open") ||
        (card.classList.contains("callout-predict") &&
          !card.querySelector(".quiz-choice"))
      );
    }
    function update() {
      if (i >= steps.length) return;
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
      attributeFilter: ["class"],
    });

    function finish() {
      obs.disconnect();
      segs.forEach((s) => {
        s.classList.add("is-done");
        s.classList.remove("is-current");
      });
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
        const opts = stage.querySelectorAll(
          ".quiz-choice:not(:disabled), .ex-bank .ex-chip, .ex-col .ex-chip:not(:disabled)",
        );
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
      show(i + 1);
    });
    next.onclick = () => {
      if (!next.disabled) show(i + 1);
    };
    ui = { close };
    show(0);
  }

  btn.addEventListener("click", open);
})();
