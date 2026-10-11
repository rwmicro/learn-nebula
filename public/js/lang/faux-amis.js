// faux-amis: false friends, one word at a time — it looks like a French word
// and means something else. Pick the meaning, read why.
//
// Props:
//   titre:  heading (optional)
//   langue: language of the words, shown above each one
//   motN:   mot | bonne réponse | piège ; autre piège | explication
import { el } from "../widget-kit.js";
import { numbered, fill } from "./common.js";

export function fauxAmis(props) {
  const words = numbered(props, "mot")
    .map(({ v }) => {
      const [word, right, wrong, why] = String(v).split("|").map((s) => s.trim());
      const choices = [right, ...(wrong || "").split(";").map((s) => s.trim()).filter(Boolean)];
      return word && right ? { word, right, choices, why: why || "" } : null;
    })
    .filter(Boolean);
  if (!words.length) throw new Error("pas de mot");
  let i = 0, ok = 0, n = 0;
  const lang = el("p", { class: "l-ff-lang" }, [props.langue || ""]);
  const word = el("p", { class: "l-ff-word" });
  const opts = el("div", { class: "l-pairs" });
  const out = el("p", { class: "w-result", "aria-live": "polite" });
  const score = el("span", { class: "w-hint" });
  const next = el("button", { type: "button", class: "w-btn", onclick: () => show(i + 1) }, ["Mot suivant"]);
  function show(k) {
    i = k % words.length;
    const w = words[i];
    word.textContent = w.word;
    out.textContent = "";
    next.hidden = true;
    let done = false;
    const order = w.choices.slice().sort(() => Math.random() - 0.5);
    fill(
      opts,
      ...order.map((c) =>
        el("button", {
          type: "button",
          class: "l-pair",
          onclick: (ev) => {
            if (done) return;
            done = true;
            n++;
            const good = c === w.right;
            if (good) ok++;
            ev.currentTarget.classList.add(good ? "is-right" : "is-wrong");
            if (!good) [...opts.children].find((b) => b.textContent === w.right)?.classList.add("is-right");
            fill(out, el("b", { class: good ? "l-ok" : "l-ko" }, [good ? "Oui. " : "Piège ! "]), w.why);
            score.textContent = `${ok} / ${n}`;
            next.hidden = false;
          },
        }, [c]),
      ),
    );
  }
  show(0);
  return el("div", { class: "w-root l-faux-amis" }, [
    el("p", { class: "w-chart-title" }, [props.titre || "Faux amis : que veut dire ce mot ?"]),
    el("div", { class: "w-controls" }, [lang, score]),
    word,
    opts,
    out,
    el("div", { class: "w-controls" }, [next]),
  ]);
}
