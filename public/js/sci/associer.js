// Widget "associer": match each item of a left column with one of a
// shuffled right column (Greek god ↔ Roman god, concept ↔ author…). Each row
// has a menu of the right-hand items, so it works the same with a mouse, a
// finger or a keyboard; « Vérifier » marks each row. Models: parsePaires /
// melange in lib/sci-algo.ts.
import { el } from "../widget-kit.js";
import { graine, melange, parsePaires } from "../../../lib/sci-algo.ts";

export function associer(props, fig, ctx) {
  const paires = parsePaires(props.paires);
  if (paires.length < 2) return null;
  const perm = melange(paires.length, graine(paires.map((p) => p[0]).join("|")));
  // Right-hand options in a shuffled order, by index into `paires`.
  const options = perm;
  const choix = paires.map(() => -1);
  let verifie = false;
  let essais = 0;

  const rows = el("div", { class: "ass-rows" });
  const verdict = el("p", { class: "ord-verdict", "aria-live": "polite" });
  const btnCheck = el(
    "button",
    {
      type: "button",
      class: "w-btn sci-cta",
      onclick: () => {
        verifie = true;
        essais++;
        draw();
      },
    },
    ["Vérifier"],
  );
  const btnSol = el(
    "button",
    {
      type: "button",
      class: "w-btn",
      onclick: () => {
        paires.forEach((_, i) => (choix[i] = i));
        verifie = true;
        draw();
      },
    },
    ["Voir la solution"],
  );
  const btnReset = el(
    "button",
    {
      type: "button",
      class: "w-btn",
      onclick: () => {
        choix.fill(-1);
        verifie = false;
        draw();
      },
    },
    ["Effacer"],
  );

  function draw() {
    const pris = new Set(choix.filter((c) => c >= 0));
    rows.replaceChildren(
      ...paires.map(([g], i) => {
        const sel = el(
          "select",
          { class: "w-input ass-sel", "aria-label": "associer à « " + g + " »" },
          [
            el("option", { value: "-1" }, ["— choisir —"]),
            ...options.map((j) =>
              el("option", { value: String(j), selected: choix[i] === j ? "" : null }, [
                paires[j][1] + (pris.has(j) && choix[i] !== j ? " (déjà pris)" : ""),
              ]),
            ),
          ],
        );
        sel.addEventListener("change", () => {
          choix[i] = Number(sel.value);
          verifie = false;
          draw();
          rows.querySelectorAll("select")[i]?.focus();
        });
        const etat = !verifie || choix[i] < 0 ? "" : choix[i] === i ? " is-ok" : " is-bad";
        return el("div", { class: "ass-row" + etat }, [
          el("span", { class: "ass-left" }, [g]),
          el("span", { class: "ass-arrow", "aria-hidden": "true" }, ["→"]),
          sel,
        ]);
      }),
    );
    const nOk = choix.filter((c, i) => c === i).length;
    const remplis = choix.filter((c) => c >= 0).length;
    const tout = nOk === paires.length;
    verdict.className = "ord-verdict" + (verifie ? (tout ? " is-ok" : " is-bad") : "");
    verdict.textContent = verifie
      ? tout
        ? essais <= 1
          ? "Toutes les associations sont justes du premier coup."
          : "Toutes les associations sont justes."
        : `${nOk} sur ${paires.length} justes` + (remplis < paires.length ? `, ${paires.length - remplis} sans réponse.` : ".")
      : "";
    ctx?.report({ bien: nOk, total: paires.length, juste: verifie && tout ? 1 : 0, essais });
  }

  draw();
  return el("div", { class: "w-root ass" }, [
    props.consigne ? el("p", { class: "ord-consigne" }, [props.consigne]) : null,
    rows,
    el("div", { class: "w-controls" }, [btnCheck, btnReset, btnSol]),
    verdict,
  ]);
}
