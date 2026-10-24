// The exercises written in a note (lib/exercises.ts): `[!traduire]` (a word
// bank), `[!ordre]` (tap in order), `[!associer]` (pairs), `[!ligne]` (tap
// the line of a code block), and the "Remettre dans l'ordre" card after a
// mermaid timeline. Each card's answer is JSON in data-ex-data; the stage is
// built here, after the build, so Pagefind never indexes it. A right answer
// counts as a day of activity (the streak) and fires `gk:exercise`.
// Imported by quiz.js, so it rides in quiz.bundle.js.
import { recordActivity } from "../../lib/personal";
import { bankWords, sameSentence } from "../../lib/exercises.ts";

(function () {
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
  function chip(text) {
    const b = h("button", "ex-chip", text);
    b.type = "button";
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

  /** The feedback band and the explanation: shown once answered. */
  function finish(card, ok, answerText) {
    card.classList.add("is-answered");
    const fb = card.querySelector(".quiz-feedback");
    if (fb) {
      fb.hidden = false;
      fb.className = `quiz-feedback quiz-feedback--${ok ? "ok" : "bad"}`;
      fb.replaceChildren(i18n(h("p", "quiz-feedback-title"), ok ? "ex.right" : "ex.wrong"));
      if (!ok && answerText) fb.appendChild(i18n(h("p", "ex-answer"), "ex.answer", { answer: answerText }));
      const again = i18n(h("button", "quiz-btn ex-again"), "ex.again");
      again.type = "button";
      again.addEventListener("click", () => mount(card, true));
      fb.appendChild(again);
    }
    const after = card.querySelector(".ex-after");
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
  }

  function checkButton(onCheck) {
    const b = i18n(h("button", "ex-check"), "ex.check");
    b.type = "button";
    b.disabled = true;
    b.addEventListener("click", onCheck);
    return b;
  }

  // Words (traduire) or items (ordre, frise): tap one in the bank to put it
  // at the end of the answer line, tap it in the line to send it back.
  function sequence(stage, pool, onCheck) {
    const line = h("div", "ex-line");
    line.setAttribute("role", "group");
    line.setAttribute("aria-label", tt("ex.lineAria"));
    const bank = h("div", "ex-bank");
    bank.setAttribute("role", "group");
    bank.setAttribute("aria-label", tt("ex.bankAria"));
    const check = checkButton(() => onCheck([...line.children].map((c) => c.dataset.v)));
    pool.forEach((v) => {
      const c = chip(v);
      c.dataset.v = v;
      c.addEventListener("click", () => {
        if (stage.closest(".is-answered")) return;
        (c.parentElement === bank ? line : bank).appendChild(c);
        check.disabled = line.children.length === 0;
      });
      bank.appendChild(c);
    });
    stage.append(line, bank, check);
  }

  const play = {
    traduire(card, stage, d) {
      const words = shuffle([...bankWords(d.answer), ...d.traps]);
      sequence(stage, words, (got) => {
        const said = got.join(" ");
        const ok = [d.answer, ...d.also].some((a) => sameSentence(a, said));
        finish(card, ok, d.answer);
      });
    },
    ordre(card, stage, d) {
      stage.classList.add("ex-stage--list");
      sequence(stage, shuffle([...d.items, ...d.traps]), (got) => {
        const ok = got.length === d.items.length && got.every((v, i) => v === d.items[i]);
        finish(card, ok, d.items.join(" → "));
      });
      if (d.traps.length) stage.prepend(i18n(h("p", "ex-hint"), "ex.trapsLeft"));
    },
    associer(card, stage, d) {
      const left = h("div", "ex-col");
      const right = h("div", "ex-col");
      let picked = null;
      let wrong = 0;
      let done = 0;
      const pairOf = new Map(d.pairs.map(([a, b]) => [a, b]));
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
          for (const x of [a, b]) {
            x.disabled = true;
            x.classList.add("is-right");
            x.dataset.pair = String(done + 1);
          }
          if (++done === d.pairs.length) finish(card, wrong === 0, "");
        } else {
          wrong++;
          for (const x of [a, b]) {
            x.classList.add("is-wrong");
            setTimeout(() => x.classList.remove("is-wrong"), 650);
          }
        }
      };
      for (const [a] of shuffle(d.pairs)) {
        const c = chip(a);
        c.dataset.v = a;
        c.addEventListener("click", () => tap(c, "l"));
        left.appendChild(c);
      }
      for (const [, b] of shuffle(d.pairs)) {
        const c = chip(b);
        c.dataset.v = b;
        c.addEventListener("click", () => tap(c, "r"));
        right.appendChild(c);
      }
      stage.classList.add("ex-stage--pairs");
      stage.append(left, right);
    },
    ligne(card, stage, d) {
      // Shiki writes one .line span per source line; fall back to the
      // text's own line breaks.
      const pre = card.querySelector(".ex-code pre");
      if (!pre) return;
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
    if (again) {
      reset(card);
      card.querySelectorAll(".ex-pickable .line").forEach((l) => l.classList.remove("is-right", "is-wrong"));
    }
    stage.replaceChildren();
    stage.className = "ex-stage";
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
      card.append(
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
