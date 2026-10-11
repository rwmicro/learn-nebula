// Widget "rotation-cultures": 4 plots × N years; the reader picks a crop family
// and taps cells; a qualitative nitrogen gauge and pest flags follow
// (lib/sci-rotation.ts, an illustrative model).
import { el } from "../widget-kit.js";
import {
  AZOTE_MAX,
  FAMILLES,
  ORDRE_FAMILLES,
  SEUIL_CARENCE,
  parseFamille,
  simulerParcelle,
} from "../../../lib/sci-rotation.ts";
import { num, table } from "./common.js";

const PARCELLES = 4;
// The classic four-course vegetable rotation: legumes, then leaves (which use
// the nitrogen they leave), then fruits, then roots; each plot one step ahead.
const CLASSIQUE = ["legumineuses", "feuilles", "fruits", "racines"];

export function rotationCultures(props) {
  const annees = Math.round(num(props.annees, 4, 2, 6));
  let choix = "legumineuses";
  const plan = Array.from({ length: PARCELLES }, (_, p) =>
    Array.from({ length: annees }, (_, a) => {
      const custom = props["parcelle" + (p + 1)];
      if (custom) return parseFamille(String(custom).split(/[,;]/)[a]);
      return CLASSIQUE[(a + p) % 4];
    }),
  );

  const palette = el("div", {
    class: "sci-palette",
    role: "group",
    "aria-label": "famille à planter",
  });
  const grid = el("div", { class: "sci-rot-grid", style: null });
  grid.style.setProperty("--cols", String(annees));
  const out = el("div", { class: "w-out" });

  function drawPalette() {
    palette.replaceChildren(
      ...[...ORDRE_FAMILLES, null].map((f) =>
        el(
          "button",
          {
            type: "button",
            class:
              "w-btn sci-fam-btn" +
              (choix === f ? " is-active" : "") +
              (f ? " is-" + f : ""),
            "aria-pressed": String(choix === f),
            onclick: () => {
              choix = f;
              drawPalette();
            },
          },
          [f ? FAMILLES[f].nom : "Jachère (vide)"],
        ),
      ),
    );
  }

  function draw() {
    const sims = plan.map((cultures) => simulerParcelle(cultures));
    const cells = [el("div", { class: "sci-rot-h" }, [""])];
    for (let a = 0; a < annees; a++)
      cells.push(el("div", { class: "sci-rot-h" }, ["Année " + (a + 1)]));
    cells.push(el("div", { class: "sci-rot-h" }, ["Azote"]));
    sims.forEach((sim, p) => {
      cells.push(el("div", { class: "sci-rot-p" }, ["P" + (p + 1)]));
      sim.forEach((s, a) => {
        const flags = [];
        if (s.repetition)
          flags.push(
            el(
              "span",
              {
                class: "sci-flag is-bad",
                title: "même famille que l'an dernier",
              },
              ["⚠ répétée"],
            ),
          );
        else if (s.retourRapide)
          flags.push(
            el(
              "span",
              {
                class: "sci-flag is-warn",
                title: "même famille qu'il y a deux ans",
              },
              ["retour rapide"],
            ),
          );
        if (s.carence)
          flags.push(
            el(
              "span",
              {
                class: "sci-flag is-bad",
                title: "culture gourmande sur sol pauvre",
              },
              ["carence"],
            ),
          );
        cells.push(
          el(
            "button",
            {
              type: "button",
              class:
                "sci-rot-cell" + (s.famille ? " is-" + s.famille : " is-vide"),
              "aria-label": `parcelle ${p + 1}, année ${a + 1} : ${s.famille ? FAMILLES[s.famille].nom : "jachère"}. Remplacer par ${choix ? FAMILLES[choix].nom : "jachère"}`,
              onclick: () => {
                plan[p][a] = choix;
                draw();
              },
            },
            [
              el("span", { class: "sci-rot-name" }, [
                s.famille ? FAMILLES[s.famille].court : "—",
              ]),
              el("span", { class: "sci-gauge", "aria-hidden": "true" }, [
                el("i", { style: null }),
              ]),
              ...flags,
            ],
          ),
        );
        const bar = cells[cells.length - 1].querySelector(".sci-gauge i");
        bar.style.width = (s.azoteApres / AZOTE_MAX) * 100 + "%";
        bar.classList.toggle("is-low", s.azoteApres < SEUIL_CARENCE);
      });
      const fin = sim[sim.length - 1].azoteApres;
      cells.push(
        el(
          "div",
          { class: "sci-rot-end" + (fin < SEUIL_CARENCE ? " is-low" : "") },
          [fin + "/" + AZOTE_MAX],
        ),
      );
    });
    grid.replaceChildren(...cells);

    const all = sims.flat();
    const rep = all.filter((s) => s.repetition).length;
    const vite = all.filter((s) => s.retourRapide).length;
    const car = all.filter((s) => s.carence).length;
    const moy =
      sims.reduce((a, s) => a + s[s.length - 1].azoteApres, 0) / PARCELLES;
    out.replaceChildren(
      table([
        [
          "Même famille deux ans de suite",
          rep
            ? rep +
              " fois — maladies et ravageurs de la famille s'installent dans le sol"
            : "jamais",
        ],
        ["Retour après un an seulement", vite ? vite + " fois" : "jamais"],
        ["Culture gourmande sur sol pauvre", car ? car + " fois" : "jamais"],
        [
          "Azote moyen en fin de plan",
          moy.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) +
            " / " +
            AZOTE_MAX +
            " (départ : 5)",
        ],
      ]),
      el("p", { class: "w-note" }, [
        "Les légumineuses vivent en symbiose avec des bactéries (Rhizobium) qui fixent l'azote de l'air dans des nodosités de leurs racines ; une partie reste dans le sol après elles, comme avec un engrais vert enfoui. Les cultures de feuilles et de fruits en consomment beaucoup, les racines moins. Même une bonne rotation finit un peu sous son point de départ : chaque récolte emporte de l'azote, que le jardinier rend avec du compost ou un engrais vert. Faire revenir la même famille au même endroit laisse se multiplier ses parasites propres (hernie du chou, mildiou et nématodes des solanacées…). Le modèle est illustratif : les scores d'azote sont qualitatifs, pas des kilos par hectare, et le vrai bilan dépend du sol, du climat et des apports.",
      ]),
    );
  }

  const presets = el("div", { class: "w-controls" }, [
    el("span", { class: "w-hint" }, ["Plans :"]),
    el(
      "button",
      {
        type: "button",
        class: "w-btn",
        onclick: () => {
          plan.forEach((row, p) =>
            row.forEach((_, a) => (row[a] = CLASSIQUE[(a + p) % 4])),
          );
          draw();
        },
      },
      ["Rotation sur 4 ans"],
    ),
    el(
      "button",
      {
        type: "button",
        class: "w-btn",
        onclick: () => {
          plan.forEach((row) => row.forEach((_, a) => (row[a] = "fruits")));
          draw();
        },
      },
      ["Monoculture de tomates"],
    ),
    el(
      "button",
      {
        type: "button",
        class: "w-btn",
        onclick: () => {
          plan.forEach((row) => row.forEach((_, a) => (row[a] = null)));
          draw();
        },
      },
      ["Tout vider"],
    ),
  ]);

  drawPalette();
  draw();
  return el("div", { class: "w-root sci-rot" }, [
    el("p", { class: "w-hint sci-cal-hint" }, [
      "Choisis une famille, puis touche les cases à planter. La barre sous chaque case montre l'azote du sol après la récolte.",
    ]),
    palette,
    el("div", { class: "sci-rot-scroll" }, [grid]),
    presets,
    out,
  ]);
}
