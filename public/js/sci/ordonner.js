// Widget "ordonner": put a short list back in order (events, periods,
// authors, steps). The list arrives shuffled; ↑ and ↓ move an item, « Vérifier »
// marks the items in the right place and reveals the detail written after
// « = » (a date, say). Models: parseListe / melange in lib/sci-algo.ts.
import { el } from "../widget-kit.js";
import { bienPlaces, graine, melange, parseListe } from "../../../lib/sci-algo.ts";

export function ordonner(props, fig, ctx) {
  const items = parseListe(props.elements).map((s) => {
    const m = /^(.*?)\s+=\s+(.*)$/.exec(s);
    return m ? { texte: m[1], detail: m[2] } : { texte: s, detail: "" };
  });
  if (items.length < 2) return null;
  const haut = props.haut || "";
  const bas = props.bas || "";
  let ordre = melange(items.length, graine(items.map((x) => x.texte).join("|")));
  let verifie = false;
  let essais = 0;

  const list = el("ol", { class: "ord-list" });
  const verdict = el("p", { class: "ord-verdict", "aria-live": "polite" });
  const btnCheck = el("button", { type: "button", class: "w-btn sci-cta", onclick: () => verifier() }, ["Vérifier"]);
  const btnSol = el(
    "button",
    {
      type: "button",
      class: "w-btn",
      onclick: () => {
        ordre = items.map((_, i) => i);
        verifie = true;
        draw();
      },
    },
    ["Voir la solution"],
  );
  const btnMel = el(
    "button",
    {
      type: "button",
      class: "w-btn",
      onclick: () => {
        ordre = melange(items.length, graine(String(Date.now())));
        verifie = false;
        draw();
      },
    },
    ["Mélanger"],
  );

  function bouge(pos, d) {
    const q = pos + d;
    if (q < 0 || q >= ordre.length) return;
    [ordre[pos], ordre[q]] = [ordre[q], ordre[pos]];
    verifie = false;
    draw(q, d);
  }

  function verifier() {
    verifie = true;
    essais++;
    draw();
  }

  function draw(focusPos, dir) {
    const ok = bienPlaces(ordre);
    const nOk = ok.filter(Boolean).length;
    list.replaceChildren(
      ...ordre.map((idx, pos) => {
        const it = items[idx];
        const cls = verifie ? (ok[pos] ? "ord-item is-ok" : "ord-item is-bad") : "ord-item";
        const up = el("button", { type: "button", class: "w-btn ord-mv", "aria-label": "monter « " + it.texte + " »", disabled: pos === 0, onclick: () => bouge(pos, -1) }, ["↑"]);
        const down = el(
          "button",
          { type: "button", class: "w-btn ord-mv", "aria-label": "descendre « " + it.texte + " »", disabled: pos === ordre.length - 1, onclick: () => bouge(pos, 1) },
          ["↓"],
        );
        return el("li", { class: cls }, [
          el("span", { class: "ord-text" }, [it.texte, verifie && ok[pos] && it.detail ? el("span", { class: "ord-detail" }, [" — " + it.detail]) : null]),
          el("span", { class: "ord-btns" }, [up, down]),
        ]);
      }),
    );
    if (focusPos != null) {
      // Keep the keyboard on the item that moved.
      const btn = list.children[focusPos]?.querySelectorAll("button")[dir < 0 ? 0 : 1];
      (btn && !btn.disabled ? btn : list.children[focusPos]?.querySelector("button:not([disabled])"))?.focus();
    }
    const tout = nOk === items.length;
    verdict.className = "ord-verdict" + (verifie ? (tout ? " is-ok" : " is-bad") : "");
    verdict.textContent = verifie
      ? tout
        ? essais <= 1
          ? "Tout est en ordre du premier coup."
          : "Tout est en ordre."
        : `${nOk} sur ${items.length} à la bonne place. Déplacez les autres et vérifiez encore.`
      : "";
    ctx?.report({ bien: nOk, total: items.length, juste: verifie && tout ? 1 : 0, essais });
  }

  draw();
  return el("div", { class: "w-root ord" }, [
    props.consigne ? el("p", { class: "ord-consigne" }, [props.consigne]) : null,
    haut ? el("p", { class: "ord-end" }, ["↑ " + haut]) : null,
    list,
    bas ? el("p", { class: "ord-end" }, ["↓ " + bas]) : null,
    el("div", { class: "w-controls" }, [btnCheck, btnMel, btnSol]),
    verdict,
  ]);
}
