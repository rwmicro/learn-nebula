// The exercises written in a note (lib/exercises.ts): `[!traduire]` (a word
// bank), `[!ordre]` (tap in order), `[!associer]` (pairs), `[!ligne]` (tap
// the line of a code block), and the "Place les événements" card after a
// mermaid timeline. Each card's answer is JSON in data-ex-data; the stage is
// built here, after the build, so Pagefind never indexes it. A right answer
// counts as a day of activity (the streak) and fires `gk:exercise`.
// Layout and keys follow revues/maquettes-duolingo-2026-10-24: numbered
// words and lettered steps for the keyboard, a foot with the hints and
// "Vérifier" (lesson.js moves that one to the bottom bar).
// Imported by quiz.js, so it rides in quiz.bundle.js.
import { recordActivity } from "../../lib/personal";
import { bankWords, sameSentence } from "../../lib/exercises.ts";

(function () {
  const LETTERS = "ABCDEFGHI";
  function tt(k, vars) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k, vars) : k;
  }
  function h(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function i18n(e, key, vars) {
    e.textContent = tt(key, vars);
    e.setAttribute("data-i18n", key);
    if (vars) e.setAttribute("data-i18n-vars", JSON.stringify(vars));
    return e;
  }
  /** A tile: its keyboard key (a number or a letter) in a small badge. */
  function chip(text, key) {
    const b = h("button", "ex-chip");
    b.type = "button";
    b.dataset.v = text;
    if (key) {
      b.dataset.k = key;
      b.append(h("span", "ex-k", key));
    }
    b.append(h("span", "ex-t", text));
    return b;
  }
  // Fisher-Yates; reshuffled until it differs from the answer's order.
  function shuffle(list) {
    const a = list.slice();
    for (let n = 0; n < 6; n++) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      if (a.length < 2 || a.some((x, i) => x !== list[i])) break;
    }
    return a;
  }
  const inLesson = (card) => !!card.closest(".lesson-stage");

  /** The feedback band and the explanation: shown once answered. In lesson
   *  mode the explanation also rides in the band (main.css shows it there). */
  function finish(card, ok, answerText) {
    card.classList.add("is-answered");
    const fb = card.querySelector(".quiz-feedback");
    const after = card.querySelector(".ex-after");
    if (fb) {
      fb.hidden = false;
      fb.className = `quiz-feedback quiz-feedback--${ok ? "ok" : "bad"}`;
      fb.replaceChildren(i18n(h("p", "quiz-feedback-title"), ok ? "ex.right" : "ex.wrong"));
      if (!ok && answerText) fb.appendChild(i18n(h("p", "ex-answer"), "ex.answer", { answer: answerText }));
      if (after) {
        const why = h("div", "ex-why");
        why.append(...[...after.childNodes].map((n) => n.cloneNode(true)));
        fb.appendChild(why);
      }
      const again = i18n(h("button", "quiz-btn ex-again"), "ex.again");
      again.type = "button";
      again.addEventListener("click", () => mount(card, true));
      fb.appendChild(again);
    }
    if (after) after.hidden = false;
    if (ok) {
      try {
        recordActivity("c");
      } catch {
        /* storage blocked */
      }
    }
    window.dispatchEvent(new CustomEvent("gk:exercise", { detail: { type: card.dataset.ex, ok } }));
  }

  function reset(card) {
    card.classList.remove("is-answered");
    const fb = card.querySelector(".quiz-feedback");
    if (fb) {
      fb.hidden = true;
      fb.replaceChildren();
    }
    const after = card.querySelector(".ex-after");
    if (after) after.hidden = true;
    card.querySelectorAll(".ex-pickable .line").forEach((l) => l.classList.remove("is-right", "is-wrong"));
  }

  /** The card's foot: the hints (keyboard ones with a fine pointer, the
   *  touch ones otherwise) and the buttons. Returns the buttons' slot. */
  function foot(card, type) {
    card.querySelector(":scope > .ex-foot")?.remove();
    const f = h("div", "ex-foot");
    f.setAttribute("data-pagefind-ignore", "");
    const keys = h("p", "ex-keys");
    keys.append(i18n(h("span", "ex-keys-kbd"), `ex.keys_${type}`), i18n(h("span", "ex-keys-tap"), `ex.tap_${type}`));
    const acts = h("div", "ex-acts");
    f.append(keys, acts);
    card.querySelector(":scope > .ex-stage").after(f);
    return acts;
  }

  function checkButton(acts, onCheck) {
    const b = i18n(h("button", "ex-check"), "ex.check");
    b.type = "button";
    b.disabled = true;
    b.addEventListener("click", () => !b.disabled && onCheck());
    acts.append(b);
    return b;
  }

  function count(card, n, total) {
    const c = card.querySelector(".ex-count");
    if (!c) return;
    if (total) i18n(c, "ex.countOf", { n, total });
    else c.replaceChildren();
  }

  /**
   * Words (traduire) or steps (ordre, frise): tap one in the bank to put it
   * at the end of the answer, tap it there to send it back. A word leaves a
   * ghost of its size in the bank, so the others don't move. With `list`,
   * steps stack, the answer shows numbered empty slots, and both columns
   * have a heading (side by side on a wide card).
   */
  function sequence(card, stage, pool, onCheck, { list = false, keys = "num", total = 0 } = {}) {
    const answer = h("div", "ex-line");
    answer.setAttribute("role", "group");
    answer.setAttribute("aria-label", tt("ex.lineAria"));
    const bank = h("div", "ex-bank");
    bank.setAttribute("role", "group");
    bank.setAttribute("aria-label", tt("ex.bankAria"));
    const acts = foot(card, card.classList.contains("ex-frise") ? "frise" : card.dataset.ex);
    const placed = () => [...answer.querySelectorAll(".ex-chip")];
    const check = checkButton(acts, () => onCheck(placed().map((c) => c.dataset.v), typed()));
    let input = null;
    const typed = () => (input && input.value.trim() ? input.value : null);
    function slots() {
      if (!list) return;
      answer.querySelectorAll(".ex-slot").forEach((s) => s.remove());
      const left = Math.max(0, total - placed().length);
      for (let k = 0; k < left; k++) {
        const s = h("div", "ex-slot");
        if (k === 0) i18n(s, "ex.nextSlot");
        answer.append(s);
      }
    }
    function sync() {
      slots();
      check.disabled = placed().length === 0 && !typed();
    }
    pool.forEach((v, idx) => {
      const c = chip(v, keys === "letter" ? LETTERS[idx] : idx < 9 ? String(idx + 1) : "");
      c.addEventListener("click", () => {
        if (card.classList.contains("is-answered")) return;
        if (c.parentElement === bank) {
          const ghost = h("span", "ex-ghost");
          ghost.style.width = `${c.offsetWidth}px`;
          ghost.style.height = `${c.offsetHeight}px`;
          c.replaceWith(ghost);
          c._ghost = ghost;
          const slot = answer.querySelector(".ex-slot");
          if (slot) slot.before(c);
          else answer.append(c);
        } else if (c._ghost && c._ghost.isConnected) {
          c._ghost.replaceWith(c);
          c._ghost = null;
        } else bank.append(c);
        sync();
      });
      bank.appendChild(c);
    });
    // Backspace: the last one back to the bank.
    card._exBack = () => {
      const all = placed();
      if (all.length) all[all.length - 1].click();
    };
    // Typing a letter on a translation: write the sentence instead.
    if (card.dataset.ex === "traduire") {
      card._exType = (ch) => {
        if (!input) {
          input = h("input", "ex-type");
          input.type = "text";
          input.setAttribute("aria-label", tt("ex.typeAria"));
          input.autocomplete = "off";
          input.spellcheck = false;
          input.addEventListener("input", sync);
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !check.disabled) {
              e.preventDefault();
              check.click();
            }
          });
          stage.classList.add("is-typing");
          answer.after(input);
        }
        input.focus();
        if (ch) {
          input.value += ch;
          sync();
        }
      };
    }
    if (list) {
      stage.classList.add("ex-stage--list");
      const a = h("div", "ex-col-a");
      a.append(i18n(h("p", "ex-colh"), "ex.yours"), answer);
      const b = h("div", "ex-col-b");
      b.append(i18n(h("p", "ex-colh"), "ex.steps"), bank);
      stage.append(a, b);
    } else stage.append(answer, bank);
    sync();
  }

  /** The speaker: reads the sentence to translate, when the browser has a
   *  voice for the page's language (no file, nothing leaves the browser). */
  function speaker(card) {
    const src = card.querySelector(".ex-src");
    if (!src || src.querySelector(".ex-say") || !("speechSynthesis" in window)) return;
    const lang = document.documentElement.lang || "fr";
    const b = h("button", "ex-say");
    b.type = "button";
    b.setAttribute("aria-label", tt("ex.listen"));
    b.setAttribute("data-i18n-aria-label", "ex.listen");
    b.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    b.addEventListener("click", () => {
      const text = [...src.childNodes].filter((n) => n !== b).map((n) => n.textContent).join("").trim();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    });
    src.prepend(b);
  }

  const play = {
    traduire(card, stage, d) {
      speaker(card);
      const words = shuffle([...bankWords(d.answer), ...d.traps]);
      sequence(card, stage, words, (got, typed) => {
        const said = typed ?? got.join(" ");
        const ok = [d.answer, ...d.also].some((a) => sameSentence(a, said));
        finish(card, ok, d.answer);
      });
    },
    ordre(card, stage, d) {
      sequence(
        card,
        stage,
        shuffle([...d.items, ...d.traps]),
        (got) => {
          const ok = got.length === d.items.length && got.every((v, i) => v === d.items[i]);
          finish(card, ok, d.items.join(" → "));
        },
        { list: true, keys: "letter", total: d.items.length },
      );
      if (d.traps.length) stage.prepend(i18n(h("p", "ex-hint"), "ex.trapsLeft"));
    },
    associer(card, stage, d) {
      // One row per pair: a name (numbered) and a phrase (lettered). A found
      // pair lines up on its row and fades; "1 sur 5" counts them.
      const grid = h("div", "ex-pairs");
      const acts = foot(card, "associer");
      const again = i18n(h("button", "ex-check ex-restart"), "ex.again");
      again.type = "button";
      again.addEventListener("click", () => mount(card, true));
      acts.append(again);
      const pairOf = new Map(d.pairs.map(([a, b]) => [a, b]));
      const L = shuffle(d.pairs.map(([a]) => a)).map((v, i) => chip(v, String(i + 1)));
      const R = shuffle(d.pairs.map(([, b]) => b)).map((v, i) => chip(v, LETTERS[i]));
      L.forEach((c) => c.classList.add("ex-who"));
      const draw = () => grid.replaceChildren(...L.flatMap((l, i) => [l, R[i]]));
      let picked = null;
      let wrong = 0;
      let done = 0;
      const tap = (c, side) => {
        if (c.disabled || card.classList.contains("is-answered")) return;
        if (!picked || picked.side === side) {
          if (picked) picked.c.classList.remove("is-picked");
          picked = { c, side };
          c.classList.add("is-picked");
          return;
        }
        const a = side === "l" ? c : picked.c;
        const b = side === "l" ? picked.c : c;
        picked.c.classList.remove("is-picked");
        picked = null;
        if (pairOf.get(a.dataset.v) === b.dataset.v) {
          const ia = L.indexOf(a);
          const ib = R.indexOf(b);
          [R[ia], R[ib]] = [R[ib], R[ia]];
          for (const x of [a, b]) {
            x.disabled = true;
            x.classList.add("is-right");
          }
          draw();
          count(card, ++done, d.pairs.length);
          if (done === d.pairs.length) finish(card, wrong === 0, "");
        } else {
          wrong++;
          for (const x of [a, b]) {
            x.classList.add("is-wrong");
            setTimeout(() => x.classList.remove("is-wrong"), 650);
          }
        }
      };
      L.forEach((c) => c.addEventListener("click", () => tap(c, "l")));
      R.forEach((c) => c.addEventListener("click", () => tap(c, "r")));
      draw();
      count(card, 0, d.pairs.length);
      stage.append(grid);
    },
    ligne(card, stage, d) {
      // Shiki writes one .line span per source line; fall back to the
      // text's own line breaks.
      const pre = card.querySelector(".ex-code pre");
      if (!pre) return;
      foot(card, "ligne");
      const code = pre.querySelector("code") || pre;
      let lines = [...code.querySelectorAll(":scope > .line")];
      if (!lines.length) {
        const text = code.textContent.replace(/\n$/, "");
        code.replaceChildren(
          ...text.split("\n").flatMap((l, i) => {
            const s = h("span", "line", l);
            return i ? ["\n", s] : [s];
          }),
        );
        lines = [...code.querySelectorAll(":scope > .line")];
      }
      pre.classList.add("ex-pickable");
      lines.forEach((l, i) => {
        l.tabIndex = 0;
        l.dataset.k = String(i + 1);
        l.setAttribute("role", "button");
        l.setAttribute("aria-label", tt("ex.lineN", { n: i + 1 }));
        const pick = () => {
          if (card.classList.contains("is-answered")) return;
          const ok = i + 1 === d.line;
          l.classList.add(ok ? "is-right" : "is-wrong");
          if (!ok) lines[d.line - 1]?.classList.add("is-right");
          finish(card, ok, tt("ex.lineN", { n: d.line }));
        };
        l.onclick = pick;
        l.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick();
          }
        };
      });
    },
  };

  function mount(card, again) {
    let d;
    try {
      d = JSON.parse(card.dataset.exData || "null");
    } catch {
      return;
    }
    const fn = play[card.dataset.ex];
    const stage = card.querySelector(".ex-stage");
    if (!d || !fn || !stage) return;
    if (again) reset(card);
    card._exBack = card._exType = null;
    stage.replaceChildren();
    stage.className = "ex-stage";
    count(card, 0, 0);
    fn(card, stage, d);
  }

  // A mermaid timeline's dates: a folded card under the diagram.
  function frise(box) {
    let items;
    try {
      items = JSON.parse(box.dataset.frise || "null");
    } catch {
      return;
    }
    if (!items || items.length < 3 || box.childElementCount) return;
    const open = i18n(h("button", "quiz-btn ex-frise-open"), "ex.friseOpen");
    open.type = "button";
    open.addEventListener("click", () => {
      open.remove();
      const card = h("div", "callout callout-ex quiz--choice ex-frise");
      card.dataset.ex = "ordre";
      card.dataset.exData = JSON.stringify({ items: items.map((e) => e.what), traps: [] });
      const head = h("div", "callout-title ex-head");
      const kick = h("span", "ex-kick");
      kick.append(i18n(h("span"), "ex.yourTurn"), " · ", i18n(h("span"), "ex.frise"));
      head.append(kick, h("span", "ex-count"));
      card.append(
        head,
        i18n(h("p", "ex-action"), "ex.do_frise"),
        i18n(h("p", "quiz-question ex-prompt"), "ex.frisePrompt"),
        h("div", "ex-stage"),
      );
      const fb = h("div", "quiz-feedback");
      fb.hidden = true;
      fb.setAttribute("aria-live", "polite");
      const after = h("ol", "callout-body ex-after ex-frise-key");
      after.hidden = true;
      for (const e of items) {
        const li = h("li");
        li.append(h("b", null, e.when), ` ${e.what}`);
        after.appendChild(li);
      }
      card.append(fb, after);
      box.appendChild(card);
      mount(card, false);
    });
    box.appendChild(open);
  }

  function init() {
    document.querySelectorAll(".callout-ex[data-ex]").forEach((c) => {
      const stage = c.querySelector(".ex-stage");
      if (!c.closest(".ex-frise") && stage && !stage.childElementCount) mount(c, false);
    });
    document.querySelectorAll(".frise-ex[data-frise]").forEach(frise);
  }

  // Keyboard: with the focus inside a card (or the card on a lesson's
  // screen), a digit presses the numbered word, name or line, a letter the
  // lettered step or phrase (on a translation, letters write the sentence),
  // Backspace takes the last one back, Enter checks.
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (!(t instanceof Element) || t.closest("input, textarea, select, [contenteditable]")) return;
    let card = t.closest(".callout-ex, .callout-quiz.quiz--choice, .callout-predict");
    if (!card) card = document.querySelector(".lesson-stage .callout-ex:not(.is-answered)");
    if (!card || card.classList.contains("is-answered")) return;
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!card.classList.contains("callout-ex")) {
      // Multiple choice and predictions: the Nth answer.
      if (!/^[1-9]$/.test(key)) return;
      const b = card.querySelectorAll(".quiz-choice:not(:disabled)")[Number(key) - 1];
      if (!b) return;
      e.preventDefault();
      b.click();
      return;
    }
    if (key === "Backspace" && card._exBack) {
      e.preventDefault();
      card._exBack();
      return;
    }
    if (key === "Enter" && !inLesson(card)) {
      const c = card.querySelector(".ex-foot .ex-check:not(.ex-restart)");
      if (c && !c.disabled && !(t instanceof HTMLButtonElement)) {
        e.preventDefault();
        c.click();
      }
      return;
    }
    if (!/^[1-9A-ZÀ-Ý]$/.test(key)) return;
    if (/^[A-Z]$/.test(key) && card._exType) {
      e.preventDefault();
      card._exType(e.key);
      return;
    }
    const target = card.querySelector(
      `.ex-bank .ex-chip[data-k="${key}"], .ex-pairs .ex-chip[data-k="${key}"]:not(:disabled), .ex-pickable .line[data-k="${key}"]`,
    );
    if (!target) return;
    e.preventDefault();
    target.click();
    if (!card.contains(document.activeElement)) card.querySelector(".ex-chip, .ex-check")?.focus({ preventScroll: true });
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  // A translation (translate.js) swaps the article body, cards included:
  // build the new ones.
  const body = document.querySelector(".article-body");
  if (body && "MutationObserver" in window) {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        init();
      });
    }).observe(body, { childList: true });
  }
})();
