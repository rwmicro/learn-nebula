// agglutination: a Turkish or Azerbaijani word built suffix by suffix
// (lib/lang-agglutination.ts), each block with its meaning and the rule that
// shaped it.
//
// Props (all optional):
//   langue: turc | azeri
//   racine: ev
//   suffixes: pluriel, mon, locatif, ki   (or the ids pl, p1s, loc, ki)
import { el } from "../widget-kit.js";
import { ROOTS, SUFFIXES, allowed, build, frenchGloss, guessSoft, lower } from "../../../lib/lang-agglutination";
import { choice, fill } from "./common.js";

const ALIAS = {
  pluriel: "pl",
  mon: "p1s",
  ton: "p2s",
  son: "p3s",
  notre: "p1p",
  votre: "p2p",
  leur: "p3p",
  accusatif: "acc",
  datif: "dat",
  locatif: "loc",
  ablatif: "abl",
  genitif: "gen",
  génitif: "gen",
  "-ki": "ki",
};

const PRESETS = {
  tr: [
    ["ev", ["pl", "p1s", "loc", "ki"]],
    ["kitap", ["pl", "p1p", "abl"]],
    ["okul", ["loc"]],
    ["sokak", ["loc"]],
    ["araba", ["p3s", "dat"]],
  ],
  az: [
    ["ev", ["pl", "p1s", "loc"]],
    ["ev", ["pl", "p1s", "loc", "ki"]],
    ["kitab", ["pl", "p1p", "abl"]],
    ["uşaq", ["acc"]],
    ["küçə", ["loc"]],
  ],
};

const GROUP_LABEL = { pluriel: "Pluriel", possessif: "Possessifs", cas: "Cas", ki: "Relateur" };

export function agglutination(props) {
  let lang = /^az/i.test(String(props.langue || "")) ? "az" : "tr";
  let root = lower(String(props.racine || "ev"), lang);
  let chain = String(props.suffixes || "")
    .split(/[\s,;+-]+/)
    .map((s) => ALIAS[s.toLowerCase()] || s.toLowerCase())
    .filter((s) => SUFFIXES.some((x) => x.id === s));
  // Keep only a valid prefix of the chain.
  chain = chain.reduce((acc, s) => (allowed(acc, lang).includes(s) ? [...acc, s] : acc), []);

  const select = el("select", { class: "w-input l-select", "aria-label": "Racine" });
  const input = el("input", { type: "text", class: "w-input", value: root, "aria-label": "Racine tapée", spellcheck: "false", autocapitalize: "off" });
  input.style.width = "9ch";
  const blocks = el("div", { class: "l-blocks", "aria-live": "polite" });
  const result = el("p", { class: "l-word" });
  const steps = el("div", { class: "w-steps" });
  const sufRows = el("div", { class: "l-sufrows" });
  const presetRow = el("div", { class: "w-controls" });
  const warn = el("p", { class: "w-hint" });

  const langPick = choice(
    [
      ["tr", "Turc"],
      ["az", "Azéri"],
    ],
    lang,
    (v) => {
      lang = v;
      langPick.set(v);
      root = ROOTS[lang][0].root;
      input.value = root;
      chain = [];
      fillSelect();
      draw();
    },
    "Langue",
  );

  function fillSelect() {
    fill(select, 
      el("option", { value: "" }, ["— choisir —"]),
      ...ROOTS[lang].map((r) => el("option", { value: r.root }, [r.root + " · " + r.gloss])),
    );
    select.value = ROOTS[lang].some((r) => r.root === root) ? root : "";
    fill(presetRow, 
      el("span", { class: "w-hint l-choice-label" }, ["Exemples"]),
      ...PRESETS[lang].map(([r, c]) =>
        el(
          "button",
          {
            type: "button",
            class: "w-btn",
            onclick: () => {
              root = r;
              input.value = r;
              select.value = r;
              chain = c.slice();
              draw();
            },
          },
          [build(r, c, lang).parts.map((p) => p.text).join("-")],
        ),
      ),
    );
  }
  select.addEventListener("change", () => {
    if (!select.value) return;
    root = select.value;
    input.value = root;
    draw();
  });
  input.addEventListener("input", () => {
    root = lower(input.value, lang).replace(/[^a-zçğıöşüəqx]/g, "");
    select.value = ROOTS[lang].some((r) => r.root === root) ? root : "";
    draw();
  });

  function draw() {
    const ok = allowed(chain, lang);
    fill(sufRows, 
      ...["pluriel", "possessif", "cas", "ki"].map((g) =>
        el("div", { class: "w-controls l-sufrow" }, [
          el("span", { class: "w-hint l-choice-label" }, [GROUP_LABEL[g]]),
          ...SUFFIXES.filter((s) => s.group === g).map((s) =>
            el(
              "button",
              {
                type: "button",
                class: "w-btn l-suf l-g-" + g,
                disabled: !root || !ok.includes(s.id),
                title: s.nom + " : " + s.sens,
                onclick: () => {
                  chain.push(s.id);
                  draw();
                },
              },
              [s.form[lang]],
            ),
          ),
        ]),
      ),
      el("div", { class: "w-controls" }, [
        el("button", { type: "button", class: "w-btn", disabled: !chain.length, onclick: () => (chain.pop(), draw()) }, ["Retirer le dernier"]),
        el("button", { type: "button", class: "w-btn", disabled: !chain.length, onclick: () => ((chain = []), draw()) }, ["Effacer"]),
      ]),
    );
    if (!root) {
      fill(blocks);
      fill(result, el("span", { class: "w-hint" }, ["Tapez une racine."]));
      fill(steps);
      return;
    }
    const r = build(root, chain, lang);
    const info = ROOTS[lang].find((x) => x.root === root);
    fill(blocks, 
      ...r.parts.map((p) => {
        const s = SUFFIXES.find((x) => x.id === p.id);
        return el("span", { class: "l-block " + (s ? "l-g-" + s.group : "l-g-root") }, [
          el("b", {}, [p.text]),
          el("em", {}, [s ? s.form[lang] : "racine"]),
          el("small", {}, [s ? s.sens : info ? info.gloss : "—"]),
        ]);
      }),
    );
    const fr = frenchGloss(root, chain, lang);
    fill(result, r.word, fr ? el("span", { class: "l-gloss" }, ["« " + fr + " »"]) : null);
    fill(steps, 
      ...r.steps.map((s) => {
        const def = SUFFIXES.find((x) => x.id === s.id);
        return el("div", { class: "w-step" }, [
          el("code", {}, [s.before + " + " + s.add + " → " + s.after]),
          el("em", {}, [def.nom + " " + def.form[lang] + (s.rules.length ? " · " + s.rules.join(" · ") : "")]),
        ]);
      }),
    );
    warn.textContent =
      !info && guessSoft(root, lang)
        ? "Racine tapée : la consonne finale est adoucie par la règle générale ; certains mots y échappent (turc hukuk → hukuku)."
        : !info
          ? "Racine tapée : pas de traduction, et les emprunts qui échappent à l'harmonie (turc saat → saati) ne sont pas repérés."
          : "";
  }

  fillSelect();
  draw();
  return el("div", { class: "w-root l-aggl" }, [
    langPick.node,
    el("div", { class: "w-controls" }, [el("label", {}, ["Racine ", select]), el("label", {}, ["ou ", input])]),
    presetRow,
    sufRows,
    blocks,
    result,
    warn,
    steps,
    el("p", { class: "w-note" }, [
      "Ordre fixe : pluriel, possessif, cas, puis -ki (seulement après le locatif, ou le génitif en turc), qui fait du mot un nouveau nom et accepte à son tour pluriel et cas. " +
        "A = a/e (azéri a/ə), I = ı/i/u/ü, D = d/t ; la lettre entre parenthèses n'apparaît qu'après une voyelle. " +
        "En azéri, le locatif et l'ablatif gardent leur d après une consonne sourde (dostda, turc arkadaşta).",
    ]),
  ]);
}
