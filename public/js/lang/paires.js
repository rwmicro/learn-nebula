// paires: minimal pairs. Two words that differ by one sound (a tone, a vowel
// length, r against rr); the reader hears one and picks which. The clips are
// the note's own pronunciation recordings, resolved to /vault URLs at build
// (lib/widget-data.ts paires).
//
// Props (from the build): title, hint, pairs: [[{src, label}, {src, label}], …]
import { el } from "../widget-kit.js";
import { fill } from "./common.js";

export function paires(props) {
  const pairs = props.pairs || [];
  if (!pairs.length) throw new Error("pas de paire");
  const audio = new Audio();
  let order = shuffle(pairs.map((_, i) => i));
  let k = 0, ok = 0, n = 0;
  let pair, answer, answered;
  const score = el("span", { class: "w-hint" });
  const opts = el("div", { class: "l-pairs" });
  const out = el("p", { class: "w-result", "aria-live": "polite" });
  const listen = el("button", { type: "button", class: "w-btn is-active", onclick: () => play() }, ["▶ Écouter"]);
  const next = el("button", { type: "button", class: "w-btn", onclick: () => ask(true) }, ["Paire suivante"]);

  function play(src) {
    audio.src = src || answer.src;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
  function ask(autoplay) {
    if (k >= order.length) {
      order = shuffle(order);
      k = 0;
    }
    pair = pairs[order[k++]];
    answer = pair[Math.floor(Math.random() * pair.length)];
    answered = false;
    out.textContent = "";
    next.hidden = true;
    fill(
      opts,
      ...pair.map((side) =>
        el("button", { type: "button", class: "l-pair", onclick: (ev) => pick(side, ev.currentTarget) }, [side.label]),
      ),
    );
    if (autoplay) play();
  }
  function pick(side, btn) {
    if (answered) {
      play(side.src); // after the answer, each button plays its own word
      return;
    }
    answered = true;
    n++;
    const good = side === answer;
    if (good) ok++;
    btn.classList.add(good ? "is-right" : "is-wrong");
    if (!good) opts.children[pair.indexOf(answer)].classList.add("is-right");
    score.textContent = `${ok} / ${n}`;
    fill(
      out,
      el("b", { class: good ? "l-ok" : "l-ko" }, [good ? "Bien entendu. " : `C'était ${answer.label}. `]),
      "Touche les deux mots pour les réécouter.",
    );
    next.hidden = false;
  }
  ask(false);
  return el("div", { class: "w-root l-paires" }, [
    el("p", { class: "w-chart-title" }, [props.title || "Quel mot entends-tu ?"]),
    props.hint && el("p", { class: "w-hint" }, [props.hint]),
    el("div", { class: "w-controls" }, [listen, score]),
    opts,
    out,
    el("div", { class: "w-controls" }, [next]),
  ]);
}

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
