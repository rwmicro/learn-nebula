// Widget "tableau-periodique": the 118 elements on the 18-column layout,
// coloured by family, with a "discovered before year X" slider and a detail
// panel (data: ./elements.js).
import { el } from "../widget-kit.js";
import { ELEMENTS, FAMILLES, position } from "./elements.js";
import { num, slider } from "./common.js";

const MIN_AN = 1660;
const MAX_AN = 2025;

const dateTexte = (e) =>
  e.annee === "Antiquité"
    ? "Antiquité"
    : e.annee == null
      ? "date incertaine, avant le XVIIIe siècle"
      : String(e.annee);
const connuEn = (e, an) => typeof e.annee !== "number" || e.annee <= an;

export function tableauPeriodique(props) {
  let an = Math.round(num(props.annee, MAX_AN, MIN_AN, MAX_AN));
  let famille = props.famille && FAMILLES[props.famille] ? props.famille : null;
  let choisi = ELEMENTS[Math.round(num(props.element, 6, 1, 118)) - 1];

  const grid = el("div", {
    class: "sci-pt",
    role: "grid",
    "aria-label": "tableau périodique des éléments",
  });
  const detail = el("div", { class: "sci-pt-detail", "aria-live": "polite" });
  const count = el("p", { class: "w-hint sci-pt-count" });
  const legend = el("div", {
    class: "sci-pt-legend",
    role: "group",
    "aria-label": "filtrer par famille",
  });

  const cells = new Map();
  for (const e of ELEMENTS) {
    const { row, col } = position(e.z);
    const b = el(
      "button",
      {
        type: "button",
        class: "sci-el is-" + e.fam,
        "aria-label": `${e.nom}, ${e.sym}, numéro ${e.z}`,
        onclick: () => {
          choisi = e;
          draw();
        },
      },
      [
        el("span", { class: "sci-el-z" }, [String(e.z)]),
        el("span", { class: "sci-el-s" }, [e.sym]),
      ],
    );
    b.style.gridRow = String(row);
    b.style.gridColumn = String(col);
    cells.set(e.z, b);
    grid.appendChild(b);
  }
  // Placeholders in group 3 for the f-block rows, and their labels.
  for (const [row, txt, fam] of [
    [6, "57–71", "lan"],
    [7, "89–103", "act"],
  ]) {
    const ph = el(
      "div",
      { class: "sci-el-ph is-" + fam, "aria-hidden": "true" },
      [txt],
    );
    ph.style.gridRow = String(row);
    ph.style.gridColumn = "3";
    grid.appendChild(ph);
    const lab = el("div", { class: "sci-el-rowlab", "aria-hidden": "true" }, [
      FAMILLES[fam],
    ]);
    lab.style.gridRow = String(row === 6 ? 9 : 10);
    lab.style.gridColumn = "1 / 3";
    grid.appendChild(lab);
  }
  const gap = el("div", { class: "sci-pt-gap", "aria-hidden": "true" });
  gap.style.gridRow = "8";
  gap.style.gridColumn = "1 / -1";
  grid.appendChild(gap);

  function drawLegend() {
    legend.replaceChildren(
      ...Object.entries(FAMILLES).map(([k, v]) =>
        el(
          "button",
          {
            type: "button",
            class: "sci-pt-fam is-" + k + (famille === k ? " is-on" : ""),
            "aria-pressed": String(famille === k),
            onclick: () => {
              famille = famille === k ? null : k;
              draw();
            },
          },
          [el("i", {}), v],
        ),
      ),
    );
  }

  const sAn = slider({
    label: "Connus en",
    min: MIN_AN,
    max: MAX_AN,
    step: 1,
    value: an,
    format: (v) => String(v),
    onInput: (v) => {
      an = v;
      draw();
    },
  });

  function draw() {
    let n = 0;
    for (const e of ELEMENTS) {
      const c = cells.get(e.z);
      const known = connuEn(e, an);
      if (known) n++;
      c.classList.toggle("is-unknown", !known);
      c.classList.toggle("is-dim", !!famille && e.fam !== famille);
      c.classList.toggle("is-sel", e === choisi);
      c.setAttribute("aria-pressed", String(e === choisi));
    }
    count.textContent =
      an >= MAX_AN
        ? "Les 118 éléments connus aujourd'hui."
        : `En ${an} : ${n} éléments sur 118 étaient connus.`;
    drawLegend();
    const e = choisi;
    detail.replaceChildren(
      el("div", { class: "sci-pt-big is-" + e.fam }, [
        el("span", { class: "sci-el-z" }, [String(e.z)]),
        el("span", { class: "sci-pt-sym" }, [e.sym]),
      ]),
      el("div", { class: "sci-pt-info" }, [
        el("p", { class: "sci-pt-name" }, [e.nom]),
        el("p", {}, [
          "Numéro atomique ",
          el("strong", {}, [String(e.z)]),
          " · ",
          FAMILLES[e.fam],
        ]),
        el("p", {}, [
          "Découverte : ",
          el("strong", {}, [dateTexte(e)]),
          e.qui ? " — " + e.qui : "",
        ]),
        e.note
          ? el("p", { class: "w-hint" }, [
              e.note[0].toUpperCase() + e.note.slice(1) + ".",
            ])
          : null,
        !connuEn(e, an)
          ? el("p", { class: "w-hint" }, [`Encore inconnu en ${an}.`])
          : null,
      ]),
    );
  }

  draw();
  return el("div", { class: "w-root sci-ptw" }, [
    el("div", { class: "w-controls" }, [
      sAn.node,
      el(
        "button",
        {
          type: "button",
          class: "w-btn",
          onclick: () => (sAn.set(MAX_AN), (an = MAX_AN), draw()),
        },
        ["Aujourd'hui"],
      ),
    ]),
    count,
    el("p", { class: "w-hint sci-pt-hint" }, [
      "Fais défiler le tableau vers la droite pour voir les 18 colonnes.",
    ]),
    el(
      "div",
      {
        class: "sci-pt-scroll",
        tabindex: "0",
        "aria-label": "tableau périodique, défilable horizontalement",
      },
      [grid],
    ),
    detail,
    legend,
    el("p", { class: "w-note" }, [
      "Touche un élément pour sa fiche, une famille pour la faire ressortir. Fais glisser l'année : en 1700 on ne connaît que 14 éléments, presque tous des métaux et non-métaux travaillés depuis l'Antiquité ; la chimie de Lavoisier, l'électrolyse de Davy (1807-1808), la spectroscopie de Bunsen et Kirchhoff (1860) puis la radioactivité et les accélérateurs remplissent ensuite le tableau par vagues. Mendeleïev le publie en 1869 en laissant des cases vides : gallium, scandium et germanium viennent les remplir entre 1875 et 1886. L'année retenue est celle de la première identification ; les éléments 109 à 118 n'ont été produits qu'à quelques atomes, trop peu pour mesurer leurs propriétés chimiques.",
    ]),
  ]);
}
