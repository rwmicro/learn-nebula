// ecritures: one word in several scripts, converted live (lib/lang-scripts.ts).
// Uyghur: Latin (ULY) ↔ Arabic (UEY) ↔ Cyrillic (USY), ULY as pivot.
// Kabyle: Latin ↔ Neo-Tifinagh.
//
// Props (all optional):
//   langue: ouighour | kabyle
//   mot: alma
import { el } from "../widget-kit.js";
import { isTifinagh, kabLettersUsed, kabToLatin, kabToTifinagh, uyConvert, uyLettersUsed } from "../../../lib/lang-scripts";
import { choice, fill } from "./common.js";

// Words from the vault's Ouighour and Kabyle notes (ULY spelled with e for ä, as the alphabet note does).
const UY_PRESETS = [
  ["alma", "pomme"],
  ["uyghurche", "ouïghour (la langue)"],
  ["rexmet", "merci"],
  ["yaxshimusiz", "comment allez-vous ?"],
  ["köz", "œil"],
  ["chay", "thé"],
  ["mëning ismim", "je m'appelle"],
];
const KAB_PRESETS = [
  ["azul", "bonjour"],
  ["tanemmirt", "merci"],
  ["axxam", "maison"],
  ["aγrum", "pain"],
  ["tameṭṭut", "femme"],
  ["amek telliḍ", "comment vas-tu ?"],
];
const KAB_SPECIAL = ["ɛ", "γ", "č", "ǧ", "ḍ", "ḥ", "ṛ", "ṣ", "ṭ", "ẓ"];

export function ecritures(props) {
  let lang = /^kab/i.test(String(props.langue || "")) ? "kab" : "uy";
  const start = String(props.mot || "").trim();

  const pane = el("div", {});
  const table = el("div", { class: "w-out" });
  const langPick = choice(
    [
      ["uy", "Ouïghour"],
      ["kab", "Kabyle"],
    ],
    lang,
    (v) => {
      lang = v;
      langPick.set(v);
      mount(v === "uy" ? UY_PRESETS[0][0] : KAB_PRESETS[0][0]);
    },
    "Langue",
  );

  function field(label, attrs) {
    const input = el("input", { type: "text", class: "w-input l-script-in", spellcheck: "false", autocapitalize: "off", autocomplete: "off", ...attrs });
    return { input, node: el("label", { class: "l-script" }, [el("span", { class: "w-hint" }, [label]), input]) };
  }

  function mountUy(word) {
    const uly = field("Latin (ULY)", { "aria-label": "Latin ULY", lang: "ug-Latn" });
    const uey = field("Arabe (UEY)", { dir: "rtl", "aria-label": "Arabe UEY", lang: "ug-Arab", class: "w-input l-script-in l-ar" });
    const usy = field("Cyrillique (USY)", { "aria-label": "Cyrillique USY", lang: "ug-Cyrl" });
    const F = { uly, uey, usy };
    function sync(from) {
      const v = F[from].input.value;
      for (const k of Object.keys(F)) if (k !== from) F[k].input.value = uyConvert(v, from, k);
      const used = uyLettersUsed(v, from);
      fill(table, 
        used.length
          ? el("table", { class: "w-table l-map" }, [
              el("thead", {}, [el("tr", {}, [el("th", {}, ["Latin"]), el("th", {}, ["Arabe"]), el("th", {}, ["Cyrillique"])])]),
              el(
                "tbody",
                {},
                used.map((l) => el("tr", {}, [el("td", { class: "w-mono" }, [l.uly]), el("td", { class: "l-ar", lang: "ug-Arab" }, [l.uey]), el("td", {}, [l.usy])])),
              ),
            ])
          : el("p", { class: "w-hint" }, ["Aucune lettre reconnue."]),
        used.some((l) => l.hamza)
          ? el("p", { class: "w-hint" }, ["En arabe, une voyelle en début de mot (ou de syllabe) s'écrit sur le support ئ, sans valeur de son : ئالما, alma."])
          : null,
        /y[au]/.test(F.uly.input.value) ? el("p", { class: "w-hint" }, ["En cyrillique, ya et yu s'écrivent я et ю."]) : null,
      );
    }
    for (const k of Object.keys(F)) F[k].input.addEventListener("input", () => sync(k));
    uly.input.value = word;
    fill(pane, 
      el("div", { class: "l-scripts" }, [uly.node, uey.node, usy.node]),
      el(
        "div",
        { class: "w-controls" },
        UY_PRESETS.map(([w, g]) => el("button", { type: "button", class: "w-btn", title: g, onclick: () => ((uly.input.value = w), sync("uly")) }, [w])),
      ),
    );
    sync("uly");
  }

  function mountKab(word) {
    const lat = field("Latin", { "aria-label": "Kabyle en latin", lang: "kab-Latn" });
    const tif = field("Tifinagh", { "aria-label": "Kabyle en tifinagh", lang: "kab-Tfng", class: "w-input l-script-in l-tif" });
    function sync(from) {
      if (from === "lat") tif.input.value = kabToTifinagh(lat.input.value);
      else lat.input.value = kabToLatin(tif.input.value);
      const used = kabLettersUsed(from === "lat" ? lat.input.value : tif.input.value);
      fill(table, 
        used.length
          ? el("table", { class: "w-table l-map" }, [
              el("thead", {}, [el("tr", {}, [el("th", {}, ["Latin"]), el("th", {}, ["Tifinagh"])])]),
              el(
                "tbody",
                {},
                used.map((l) => el("tr", {}, [el("td", { class: "w-mono" }, [l.latin]), el("td", { class: "l-tif" }, [l.tif])])),
              ),
            ])
          : el("p", { class: "w-hint" }, ["Aucune lettre reconnue."]),
      );
    }
    lat.input.addEventListener("input", () => sync("lat"));
    tif.input.addEventListener("input", () => sync("tif"));
    const insert = (ch) => {
      lat.input.value += ch;
      sync("lat");
    };
    if (isTifinagh(word)) tif.input.value = word;
    else lat.input.value = word;
    fill(pane, 
      el("div", { class: "l-scripts" }, [lat.node, tif.node]),
      el("div", { class: "w-controls" }, [
        el("span", { class: "w-hint l-choice-label" }, ["Lettres spéciales"]),
        ...KAB_SPECIAL.map((c) => el("button", { type: "button", class: "w-char l-key", title: "ajouter " + c, onclick: () => insert(c) }, [c])),
      ]),
      el(
        "div",
        { class: "w-controls" },
        KAB_PRESETS.map(([w, g]) => el("button", { type: "button", class: "w-btn", title: g, onclick: () => ((lat.input.value = w), sync("lat")) }, [w])),
      ),
    );
    sync(isTifinagh(word) ? "tif" : "lat");
  }

  function mount(word) {
    if (lang === "uy") mountUy(word);
    else mountKab(word);
  }

  mount(start || (lang === "uy" ? UY_PRESETS[0][0] : KAB_PRESETS[0][0]));
  return el("div", { class: "w-root l-ecritures" }, [
    langPick.node,
    pane,
    el("p", { class: "w-hint" }, ["Lettres du mot affiché"]),
    table,
    el("p", { class: "w-note" }, [
      "Chaque champ se modifie : les autres suivent. Pour l'ouïghour, tout passe par l'écriture latine : ch, sh, gh, ng, zh y comptent pour une lettre (n'g pour n puis g), " +
        "et les notes écrivent parfois ä pour e et é pour ë, ce qui est accepté. La colonne cyrillique suit l'alphabet en usage au Kazakhstan, qui n'est pas dans les notes. " +
        "Le kabyle passe au néo-tifinagh de l'IRCAM (ⵖ pour γ, ⵄ pour ɛ).",
    ]),
  ]);
}
