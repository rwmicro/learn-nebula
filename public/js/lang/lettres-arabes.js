// lettres-arabes: an Arabic word taken apart letter by letter, each in the
// form its position gives it (the browser shapes it, lib/lang-arabic.ts
// decides the position), with the six letters that never join the next one
// marked where they break the word. Second mode: the full alphabet grid.
//
// Props (all optional):
//   mot: مدرسة           — starting word
//   mode: mot | alphabet
import { el } from "../widget-kit.js";
import { ALPHABET, NON_CONNECTORS, VARIANTS, analyse, forms, shape } from "../../../lib/lang-arabic";
import { choice, readout, fill } from "./common.js";

const POSITIONS = ["isolée", "initiale", "médiane", "finale"];

// Words from the vault's Arabic notes (Littéraire Alphabet-Prononciation, Libanais Phrases-Essentielles).
const PRESETS = [
  ["كتاب", "kitāb, livre"],
  ["مدرسة", "madrasse, école"],
  ["مرحبا", "mar7aba, bonjour"],
  ["شكرا", "shukran, merci"],
  ["بيت", "bēt / bayt, maison"],
  ["باب", "bāb, porte"],
];

export function lettresArabes(props) {
  let mode = props.mode === "alphabet" ? "alphabet" : "mot";
  let sel = 0;
  const input = el("input", {
    type: "text",
    class: "w-input l-ar-input",
    dir: "rtl",
    lang: "ar",
    value: String(props.mot || "مدرسة"),
    "aria-label": "Mot arabe",
    spellcheck: "false",
  });
  const wordView = el("p", { class: "l-ar l-ar-word", dir: "rtl", lang: "ar" });
  const strip = el("div", { class: "l-letters", dir: "rtl" });
  const detail = el("div", { class: "w-out" });
  const picker = el("div", { class: "l-picker", dir: "rtl" });
  const motPane = el("div", {});
  const gridPane = el("div", {});

  const modePick = choice(
    [
      ["mot", "Un mot"],
      ["alphabet", "L'alphabet"],
    ],
    mode,
    (v) => {
      mode = v;
      modePick.set(v);
      show();
    },
    "Mode",
  );

  function insert(ch) {
    const s = input.selectionStart ?? input.value.length;
    const e = input.selectionEnd ?? s;
    input.value = input.value.slice(0, s) + ch + input.value.slice(e);
    input.setSelectionRange?.(s + ch.length, s + ch.length);
    sel = 0;
    draw();
  }

  // On-screen keyboard: the 28 letters, the hamza seats, a space and a delete key.
  fill(picker, 
    ...[...ALPHABET, ...VARIANTS].map((l) =>
      el("button", { type: "button", class: "w-char l-key" + (NON_CONNECTORS.has(l.ch) ? " is-break" : ""), title: l.name + " (" + l.tr + ")", onclick: () => insert(l.ch) }, [l.ch]),
    ),
    el("button", { type: "button", class: "w-char l-key l-key-wide", title: "espace", onclick: () => insert(" ") }, ["espace"]),
    el(
      "button",
      {
        type: "button",
        class: "w-char l-key l-key-wide",
        title: "effacer la dernière lettre",
        "aria-label": "Effacer la dernière lettre",
        onclick: () => {
          input.value = [...input.value].slice(0, -1).join("");
          sel = 0;
          draw();
        },
      },
      ["⌫"],
    ),
  );

  function draw() {
    const letters = analyse(input.value);
    fill(wordView, input.value.trim() || "—");
    if (!letters.length) {
      fill(strip, el("span", { class: "w-hint" }, ["Tapez ou choisissez des lettres arabes ci-dessous."]));
      fill(detail);
      return;
    }
    if (sel >= letters.length) sel = 0;
    fill(strip, 
      ...letters.map((l, k) =>
        el(
          "button",
          {
            type: "button",
            class: "l-letter" + (k === sel ? " is-active" : "") + (l.breaks ? " is-break" : ""),
            "aria-pressed": k === sel ? "true" : "false",
            onclick: () => {
              sel = k;
              draw();
            },
          },
          [
            el("b", { lang: "ar" }, [shape(l.ch, l.position) + l.marks]),
            el("span", { dir: "ltr" }, [l.info.name]),
            el("em", { dir: "ltr" }, [l.position]),
          ],
        ),
      ),
    );
    const l = letters[sel];
    const f = forms(l.ch);
    fill(detail, 
      el(
        "div",
        { class: "l-four" },
        POSITIONS.map((p) =>
          el("div", { class: "l-four-c" + (p === l.position ? " is-active" : "") }, [el("b", { lang: "ar", dir: "rtl" }, [f[p]]), el("span", {}, [p])]),
        ),
      ),
      readout([
        ["Lettre", l.info.name + " — " + l.info.tr],
        ["Ici", "position " + l.position + (l.joinsNext ? ", liée à la suivante" : ", non liée à la suivante")],
        l.info.join === "R"
          ? ["Ne se lie pas à gauche", "comme ا د ذ ر ز و : la lettre suivante repart en forme initiale ou isolée, le mot se coupe ici"]
          : null,
        l.ch === "ل" ? ["Ligature", "ل suivi de ا s'écrit obligatoirement لا (lām-alif)"] : null,
      ]),
    );
  }

  function grid() {
    return el("div", { class: "w-scroll l-grid-wrap" }, [
      el("table", { class: "w-table l-grid" }, [
        el("thead", {}, [el("tr", {}, [el("th", {}, ["Nom"]), ...POSITIONS.map((p) => el("th", {}, [p]))])]),
        el(
          "tbody",
          {},
          ALPHABET.map((l) => {
            const f = forms(l.ch);
            return el("tr", { class: NON_CONNECTORS.has(l.ch) ? "is-break" : "" }, [
              el("th", {}, [l.name, el("small", {}, [" " + l.tr])]),
              ...POSITIONS.map((p) => el("td", { class: "l-ar", lang: "ar", dir: "rtl" }, [f[p]])),
            ]);
          }),
        ),
      ]),
    ]);
  }

  function show() {
    motPane.hidden = mode !== "mot";
    gridPane.hidden = mode !== "alphabet";
    if (mode === "alphabet" && !gridPane.querySelector(".l-grid")) gridPane.appendChild(grid());
  }

  input.addEventListener("input", () => {
    sel = 0;
    draw();
  });
  motPane.append(
    el("div", { class: "w-controls" }, [
      el("label", {}, ["Mot ", input]),
      ...PRESETS.map(([w, g]) =>
        el(
          "button",
          {
            type: "button",
            class: "w-btn",
            title: g,
            onclick: () => {
              input.value = w;
              sel = 0;
              draw();
            },
          },
          [el("span", { lang: "ar" }, [w])],
        ),
      ),
    ]),
    picker,
    wordView,
    strip,
    detail,
  );
  gridPane.append(
    el("p", { class: "w-hint" }, ["En couleur, les six lettres qui ne se lient jamais à la suivante : leurs formes initiale et médiane sont celles de l'isolée et de la finale."]),
  );
  draw();
  show();
  return el("div", { class: "w-root l-lettres" }, [
    modePick.node,
    motPane,
    gridPane,
    el("p", { class: "w-note" }, [
      "Chaque forme est dessinée par la police du navigateur : une lettre suivie d'un liant invisible (U+200D) prend sa forme initiale, précédée d'un liant sa forme finale. " +
        "Les lettres se lisent de droite à gauche ; ا د ذ ر ز و ne se lient qu'à la lettre précédente, d'où les blancs à l'intérieur d'un mot comme مدرسة.",
    ]),
  ]);
}
