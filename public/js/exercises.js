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
import { bankWords, periodYear, sameSentence } from "../../lib/exercises.ts";

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
    const c = card.querySelector(".ex-count:not(.ex-from)");
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
    card._exBack = card._exType = card._exPin = null;
    if (stage._ro) stage._ro.disconnect();
    stage.replaceChildren();
    stage.className = "ex-stage";
    count(card, 0, 0);
    fn(card, stage, d);
  }

  // A mermaid timeline's dates: place the events on a graduated axis
  // (vertical on a narrow card, horizontal on a wide one). The pins sit at
  // their years; the labels wait in a tray, lettered. Tap (or drag) a label,
  // then its pin; tap a placed label to take it back.
  const yearLabel = (y) => (y < 0 ? `${-y} av.` : String(y));
  function friseTicks(lo, hi) {
    const span = Math.max(1, hi - lo);
    const step = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000].find((s) => span / s <= 6) || 10000;
    const a = Math.floor(lo / step) * step;
    const b = Math.ceil(hi / step) * step;
    const out = [];
    for (let y = a; y <= b; y += step) out.push(y);
    return { a, b: b === a ? a + step : b, out };
  }
  // Keep `pos` (sorted) at least `gap` apart, inside [0, max].
  function spread(pos, gap, max) {
    const p = pos.slice();
    for (let i = 1; i < p.length; i++) p[i] = Math.max(p[i], p[i - 1] + gap);
    const over = p.length ? p[p.length - 1] - max : 0;
    if (over > 0) {
      p[p.length - 1] = max;
      for (let i = p.length - 2; i >= 0; i--) p[i] = Math.min(p[i], p[i + 1] - gap);
    }
    return p.map((v) => Math.max(0, v));
  }

  play.frise = (card, stage, d) => {
    const ev = d.items.map((e, i) => ({ ...e, i, y: periodYear(e.when) }));
    const ys = ev.map((e) => e.y).filter(Number.isFinite);
    const { a, b, out: ticks } = friseTicks(Math.min(...ys), Math.max(...ys));
    const frac = (y) => (y - a) / (b - a);
    const acts = foot(card, "frise");
    const placed = new Map(); // pin index → event index
    const tray = h("div", "ex-frise-tray");
    const axisBox = h("div", "ex-frise-axis");
    const order = shuffle(ev.map((e) => e.i));
    const chips = order.map((idx, k) => {
      const c = chip(ev[idx].what, LETTERS[k]);
      c.dataset.ev = String(idx);
      return c;
    });
    let selected = null;
    const check = checkButton(acts, () => {
      let ok = true;
      for (const [pin, idx] of placed) {
        const right = ev[idx].y === ev[pin].y;
        if (!right) ok = false;
        const c = chips.find((x) => x.dataset.ev === String(idx));
        c.classList.add(right ? "is-right" : "is-wrong");
        c.disabled = true;
        const tag = h("small", "ex-when", `${ev[idx].when} ${right ? "✓" : "✗"}`);
        c.prepend(tag);
      }
      finish(card, ok, "");
    });
    const select = (c) => {
      if (card.classList.contains("is-answered")) return;
      if (c.parentElement !== tray) {
        // A placed label goes back to the tray.
        for (const [pin, idx] of placed) if (String(idx) === c.dataset.ev) placed.delete(pin);
        selected = null;
        draw();
        return;
      }
      selected = selected === c ? null : c;
      chips.forEach((x) => x.classList.toggle("is-picked", x === selected));
    };
    const drop = (pin, c = selected) => {
      if (!c || card.classList.contains("is-answered")) return;
      for (const [p, idx] of placed) if (String(idx) === c.dataset.ev) placed.delete(p);
      placed.set(pin, Number(c.dataset.ev));
      selected = null;
      draw();
    };
    chips.forEach((c) => {
      c.addEventListener("click", () => {
        if (c._dragged) return;
        select(c);
      });
      // Drag a label onto a pin (mouse, pen or finger).
      c.addEventListener("pointerdown", (e) => {
        if (card.classList.contains("is-answered") || e.button !== 0) return;
        const x0 = e.clientX;
        const y0 = e.clientY;
        c._dragged = false;
        const move = (m) => {
          const dx = m.clientX - x0;
          const dy = m.clientY - y0;
          if (!c._dragged && Math.hypot(dx, dy) < 6) return;
          c._dragged = true;
          c.classList.add("is-dragging");
          c.style.transform = `translate(${dx}px, ${dy}px) rotate(-2deg)`;
          const under = document.elementsFromPoint(m.clientX, m.clientY).find((n) => n.classList?.contains("ex-pin"));
          axisBox.querySelectorAll(".ex-pin").forEach((p) => p.classList.toggle("is-over", p === under));
        };
        const up = (u) => {
          removeEventListener("pointermove", move);
          removeEventListener("pointerup", up);
          c.classList.remove("is-dragging");
          c.style.transform = "";
          axisBox.querySelectorAll(".ex-pin.is-over").forEach((p) => p.classList.remove("is-over"));
          if (!c._dragged) return;
          const under = document.elementsFromPoint(u.clientX, u.clientY).find((n) => n.classList?.contains("ex-pin"));
          if (under) drop(Number(under.dataset.pin), c);
          setTimeout(() => (c._dragged = false), 0);
        };
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
      });
    });

    function draw() {
      const wide = stage.clientWidth >= 520;
      stage.classList.toggle("is-wide", wide);
      const PAD = wide ? 28 : 20;
      const len = wide ? Math.max(200, stage.clientWidth - 2 * PAD - 8) : 400;
      const pinPos = spread(ev.map((e) => frac(e.y) * len), 26, len);
      const pins = [...placed.keys()].sort((x, y) => x - y);
      // Narrow: labels right of the axis, pushed apart so none overlap.
      // Wide: rows above the axis, a label going up a row when it would
      // touch the previous one on its row.
      const labelPos = wide ? pins.map((p) => pinPos[p]) : spread(pins.map((p) => pinPos[p]), 56, len);
      const rowOf = [];
      const ends = [];
      pins.forEach((_, k) => {
        let row = ends.findIndex((end) => end < labelPos[k] - 100);
        if (row < 0) row = ends.length;
        ends[row] = labelPos[k] + 100;
        rowOf.push(row);
      });
      const rows = Math.max(1, ends.length);
      axisBox.replaceChildren();
      // Wide rows grow with their tallest label, so build the labels first.
      const wraps = pins.map((pin) => {
        const c = chips.find((x) => x.dataset.ev === String(placed.get(pin)));
        c.style.transform = "";
        const wrap = h("div", "ex-ev");
        if (wide) wrap.append(c, h("i", "ex-stem"));
        axisBox.append(wrap);
        return wrap;
      });
      const rowH = Array.from({ length: rows }, () => 0);
      if (wide) wraps.forEach((w, k) => (rowH[rowOf[k]] = Math.max(rowH[rowOf[k]], w.firstChild.offsetHeight)));
      const rowTop = []; // distance from the axis to the top of each row
      rowH.reduce((acc, ht, r) => (rowTop[r] = acc + 16 + ht), 0);
      const axisAt = wide ? 16 + rowTop[rows - 1] + 2 : 62; // y of the axis (wide), x (narrow)
      const along = (v) => (wide ? { left: `${PAD + v}px`, top: `${axisAt}px` } : { left: `${axisAt}px`, top: `${14 + v}px` });
      axisBox.style.height = wide ? `${axisAt + 34}px` : `${len + 28}px`;
      const line = h("i", "ex-axis-line");
      Object.assign(line.style, wide
        ? { left: `${PAD}px`, width: `${len}px`, top: `${axisAt - 2}px` }
        : { top: "14px", height: `${len}px`, left: `${axisAt - 2}px` });
      axisBox.prepend(line);
      for (const t of ticks) {
        const k = h("span", "ex-tick", yearLabel(t));
        Object.assign(k.style, along(frac(t) * len));
        axisBox.append(k);
      }
      pins.forEach((pin, k) => {
        const wrap = wraps[k];
        const c = wrap.firstChild || chips.find((x) => x.dataset.ev === String(placed.get(pin)));
        if (wide) {
          const top = axisAt - rowTop[rowOf[k]];
          Object.assign(wrap.style, { left: `${PAD + labelPos[k]}px`, top: `${top}px`, height: `${axisAt - top}px`, zIndex: String(rows - rowOf[k]) });
          // Keep the label inside the card: slide it, not its stem.
          const x = PAD + labelPos[k];
          const half = c.offsetWidth / 2;
          const shift = Math.max(0, half - x) || Math.min(0, axisBox.clientWidth - x - half);
          if (shift) c.style.transform = `translateX(${shift}px)`;
        } else {
          Object.assign(wrap.style, { left: `${axisAt + 26}px`, top: `${14 + labelPos[k]}px` });
          const dy = pinPos[pin] - labelPos[k];
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("class", "ex-stem");
          svg.setAttribute("width", "26");
          svg.setAttribute("height", String(Math.abs(dy) + 4));
          svg.style.top = `calc(50% + ${Math.min(dy, 0) - 2}px)`;
          const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
          l.setAttribute("x1", "0");
          l.setAttribute("y1", String((dy > 0 ? Math.abs(dy) : 0) + 2));
          l.setAttribute("x2", "26");
          l.setAttribute("y2", String((dy > 0 ? 0 : Math.abs(dy)) + 2));
          svg.append(l);
          wrap.append(svg, c);
        }
      });
      ev.forEach((e, pin) => {
        const p = h("button", "ex-pin");
        p.type = "button";
        p.dataset.pin = String(pin);
        p.dataset.k = String(pin + 1);
        Object.assign(p.style, along(pinPos[pin]));
        p.setAttribute("aria-label", tt("ex.pinN", { n: pin + 1 }));
        if (placed.has(pin)) p.classList.add("is-full");
        p.addEventListener("click", () => {
          if (selected) drop(pin);
          else if (placed.has(pin)) select(chips.find((x) => x.dataset.ev === String(placed.get(pin))));
        });
        axisBox.append(p);
      });
      tray.replaceChildren(...chips.filter((c) => ![...placed.values()].includes(Number(c.dataset.ev))));
      tray.hidden = !tray.childElementCount;
      check.disabled = placed.size < ev.length;
    }
    card._exBack = () => {
      const pins = [...placed.keys()];
      if (pins.length) {
        placed.delete(pins[pins.length - 1]);
        draw();
      }
    };
    card._exPin = (n) => selected && n >= 1 && n <= ev.length && drop(n - 1);
    stage.classList.add("ex-stage--frise");
    stage.append(axisBox, tray);
    draw();
    let wasWide = stage.classList.contains("is-wide");
    if ("ResizeObserver" in window) {
      stage._ro = new ResizeObserver(() => {
        const wide = stage.clientWidth >= 520;
        if (wide !== wasWide && stage.isConnected) {
          wasWide = wide;
          draw();
        }
      });
      stage._ro.observe(stage);
    }
  };

  function frise(box) {
    let items;
    try {
      items = JSON.parse(box.dataset.frise || "null");
    } catch {
      return;
    }
    if (!items || items.length < 3 || box.childElementCount) return;
    const card = h("div", "callout callout-ex quiz--choice ex-frise");
    card.dataset.ex = "frise";
    card.dataset.exData = JSON.stringify({ items });
    const head = h("div", "callout-title ex-head");
    const kick = h("span", "ex-kick");
    kick.append(i18n(h("span"), "ex.yourTurn"), " · ", i18n(h("span"), "ex.frise"));
    head.append(kick, i18n(h("span", "ex-count ex-from"), "ex.friseFrom"));
    card.append(
      head,
      i18n(h("p", "ex-action"), "ex.do_frise"),
      i18n(h("p", "quiz-question ex-prompt"), "ex.friseAsk", { n: items.length }),
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
  }

  function init() {
    document.querySelectorAll(".callout-ex[data-ex]").forEach((c) => {
      const stage = c.querySelector(".ex-stage");
      if (stage && !stage.childElementCount) mount(c, false);
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
    if (/^[1-9]$/.test(key) && card._exPin && card.querySelector(".ex-chip.is-picked")) {
      e.preventDefault();
      card._exPin(Number(key));
      return;
    }
    if (/^[A-Z]$/.test(key) && card._exType) {
      e.preventDefault();
      card._exType(e.key);
      return;
    }
    const target = card.querySelector(
      `.ex-bank .ex-chip[data-k="${key}"], .ex-frise-tray .ex-chip[data-k="${key}"], .ex-pairs .ex-chip[data-k="${key}"]:not(:disabled), .ex-pickable .line[data-k="${key}"]`,
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
