// affixes-indonesiens: a root, an affix, and the derived word built with the
// real morphophonology (lib/lang-affixes.ts), the applied rule highlighted.
//
// Props (all optional):
//   langue: indonesien | malais   — whose roots the picker lists
//   racine: tulis                 — starting root (any root can be typed)
//   affixe: meN | meN-kan | meN-i | ber | di | ter | peN | an | ke-an | peN-an | per-an
import { el } from "../widget-kit.js";
import { AFFIXES, ROOTS, derive, meaning } from "../../../lib/lang-affixes";
import { choice, readout, fill } from "./common.js";

const LANGS = { indonesien: "id", malais: "ms" };

export function affixesIndonesiens(props) {
  let lang = LANGS[String(props.langue || "").toLowerCase()] || "id";
  let root = String(props.racine || "tulis").trim().toLowerCase();
  let affix = AFFIXES.some((a) => a.id === props.affixe) ? props.affixe : "meN";

  const select = el("select", { class: "w-input l-select", "aria-label": "Racine" });
  const input = el("input", { type: "text", class: "w-input", value: root, "aria-label": "Racine tapée", spellcheck: "false", autocapitalize: "off" });
  input.style.width = "9ch";
  const word = el("p", { class: "l-word", "aria-live": "polite" });
  const out = el("div", { class: "w-out" });
  const all = el("div", { class: "l-forms" });

  const langPick = choice(
    [
      ["id", "Indonésien"],
      ["ms", "Malais"],
    ],
    lang,
    (v) => {
      lang = v;
      langPick.set(v);
      fillSelect();
      draw();
    },
    "Racines des notes",
  );
  const affixPick = choice(
    AFFIXES.map((a) => [a.id, a.label, a.role]),
    affix,
    (v) => {
      affix = v;
      affixPick.set(v);
      draw();
    },
    "Affixe",
  );

  function fillSelect() {
    const list = ROOTS.filter((r) => r.src.includes(lang));
    fill(select, 
      el("option", { value: "" }, ["— choisir —"]),
      ...list.map((r) => el("option", { value: r.root }, [r.root + " · " + r.gloss])),
    );
    select.value = list.some((r) => r.root === root) ? root : "";
  }
  select.addEventListener("change", () => {
    if (!select.value) return;
    root = select.value;
    input.value = root;
    draw();
  });
  input.addEventListener("input", () => {
    root = input.value.trim().toLowerCase().replace(/[^a-z]/g, "");
    select.value = ROOTS.some((r) => r.root === root && r.src.includes(lang)) ? root : "";
    draw();
  });

  function wordNode(d) {
    const kids = [];
    for (const p of d.parts) {
      if (p.kind === "root" && d.dropped) {
        kids.push(el("s", { class: "l-dropped", title: "consonne absorbée par la nasale" }, [d.dropped]));
      }
      kids.push(el("span", { class: "l-part l-" + p.kind }, [p.text]));
    }
    return kids;
  }

  function draw() {
    if (!root) {
      fill(word, el("span", { class: "w-hint" }, ["Tapez une racine (lettres latines)."]));
      fill(out);
      fill(all);
      return;
    }
    const d = derive(root, affix);
    const info = ROOTS.find((r) => r.root === root);
    const sens = meaning(root, affix);
    const def = AFFIXES.find((a) => a.id === affix);
    fill(word, 
      el("span", { class: "l-src" }, [root]),
      el("span", { class: "l-arrow", "aria-hidden": "true" }, ["→"]),
      ...wordNode(d),
    );
    fill(out, 
      readout([
        ["Règle appliquée", el("span", { class: d.exception ? "l-rule is-exception" : "l-rule" }, [d.rule])],
        ["Affixe", def.label + " — " + def.role],
        ["Racine", info ? root + " — « " + info.gloss + " »" : root + " — pas dans les notes"],
        [
          "Sens du dérivé",
          sens
            ? "« " + sens + " » (donné par les notes)"
            : el("span", { class: "w-hint" }, ["Forme construite par la règle ; les notes ne la donnent pas, elle peut ne pas être en usage."]),
        ],
      ]),
    );
    // Every affix on this root, so the family reads at a glance.
    fill(all, 
      el("p", { class: "w-hint" }, ["Toute la famille de « " + root + " » — en gras, les formes que les notes donnent"]),
      el(
        "div",
        { class: "l-forms-grid" },
        AFFIXES.map((a) => {
          const x = derive(root, a.id);
          const m = meaning(root, a.id);
          return el(
            "button",
            {
              type: "button",
              class: "l-form" + (a.id === affix ? " is-active" : "") + (m ? " is-attested" : ""),
              onclick: () => {
                affix = a.id;
                affixPick.set(a.id);
                draw();
              },
            },
            [el("span", { class: "l-form-a" }, [a.label]), el("span", { class: "l-form-w" }, [x.word]), m ? el("span", { class: "l-form-m" }, [m]) : null],
          );
        }),
      ),
    );
  }

  fillSelect();
  draw();
  return el("div", { class: "w-root l-affixes" }, [
    langPick.node,
    el("div", { class: "w-controls" }, [el("label", {}, ["Racine ", select]), el("label", {}, ["ou ", input])]),
    affixPick.node,
    word,
    el("p", { class: "l-legend w-hint" }, [
      el("span", { class: "l-part l-prefix" }, ["préfixe"]),
      " ",
      el("span", { class: "l-part l-root" }, ["racine"]),
      " ",
      el("span", { class: "l-part l-suffix" }, ["suffixe"]),
      " ",
      el("s", { class: "l-dropped" }, ["k"]),
      " consonne qui tombe",
    ]),
    out,
    all,
    el("p", { class: "w-note" }, [
      "La règle nasale (m, n, ng, ny ; k, p, t, s qui tombent) est celle de la fiche. Elle a ses exceptions : une racine d'une syllabe prend menge- (cat → mengecat), " +
        "un groupe de consonnes garde sa première lettre (proses → memproses, kritik → mengkritik), et quelques mots sont figés (belajar, mempunyai, mengetahui, pekerja). " +
        "Le malais suit les mêmes règles ; seules les racines proposées changent.",
    ]),
  ]);
}
