// Widget "ancrage": the reader goes through Tversky & Kahneman's (1974)
// wheel-of-fortune experiment before reading about it. Nothing leaves the
// browser; the reader's own tries are kept in localStorage (if available).
import { el, fmt, reducedMotion } from "../widget-kit.js";
import { lsGet, lsSet, table } from "./common.js";

const KEY = "w-ancrage-v1";
// African member states of the UN: 54 of 193 — every sovereign African state;
// the Sahrawi Republic, an African Union member, is not a UN member.
const AFRIQUE = 54;
const ONU = 193;
const VRAI = (AFRIQUE / ONU) * 100;

export function ancrage() {
  const host = el("div", { class: "sci-anc" });
  let essais = lsGet(KEY, []);
  if (!Array.isArray(essais)) essais = [];
  let ancre = 0;

  function roue() {
    const wheel = el("div", { class: "sci-wheel", "aria-live": "polite" }, [
      "?",
    ]);
    const go = el(
      "button",
      { type: "button", class: "w-btn sci-cta", onclick: spin },
      ["Lancer la roue"],
    );
    host.replaceChildren(
      el("p", {}, [
        "Lance la roue : elle tire un nombre entre 0 et 100. Ce nombre n'a aucun rapport avec la question qui suit.",
      ]),
      el("div", { class: "sci-anc-row" }, [wheel, go]),
    );
    function spin() {
      go.disabled = true;
      // Like the 1974 wheel, rigged to stop on 10 or 65 only.
      ancre = Math.random() < 0.5 ? 10 : 65;
      if (reducedMotion()) return question(ancre);
      let n = 0;
      const tick = () => {
        n++;
        wheel.textContent = String(Math.floor(Math.random() * 101));
        if (n < 22) setTimeout(tick, 40 + n * 6);
        else {
          wheel.textContent = String(ancre);
          setTimeout(() => question(ancre), 500);
        }
      };
      tick();
    }
  }

  function question(a) {
    const ask = (dir) => estimation(a, dir);
    host.replaceChildren(
      el("div", { class: "sci-anc-row" }, [
        el("div", { class: "sci-wheel is-done" }, [String(a)]),
        el("p", { class: "sci-anc-q" }, [
          "Le pourcentage de pays africains parmi les membres de l'ONU est-il supérieur ou inférieur à ",
          el("strong", {}, [String(a)]),
          " % ?",
        ]),
      ]),
      el("div", { class: "w-controls" }, [
        el(
          "button",
          { type: "button", class: "w-btn", onclick: () => ask("sup") },
          ["Supérieur"],
        ),
        el(
          "button",
          { type: "button", class: "w-btn", onclick: () => ask("inf") },
          ["Inférieur"],
        ),
      ]),
    );
  }

  function estimation(a, dir) {
    const input = el("input", {
      type: "number",
      min: "0",
      max: "100",
      step: "1",
      inputmode: "numeric",
      class: "w-input",
      "aria-label": "ton estimation en pour cent",
    });
    const warn = el("p", { class: "w-warn", hidden: true }, [
      "Donne un nombre entre 0 et 100.",
    ]);
    const submit = () => {
      const v = Number(String(input.value).replace(",", "."));
      if (input.value === "" || !Number.isFinite(v) || v < 0 || v > 100) {
        warn.hidden = false;
        return;
      }
      essais.push({ ancre: a, estimation: v, sens: dir, date: Date.now() });
      essais = essais.slice(-30);
      lsSet(KEY, essais);
      verdict(a, v);
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && submit());
    host.replaceChildren(
      el("p", { class: "sci-anc-q" }, [
        "Ton estimation : quel pourcentage des membres de l'ONU sont des pays africains ?",
      ]),
      el("div", { class: "w-controls" }, [
        el("label", {}, [input, " %"]),
        el(
          "button",
          { type: "button", class: "w-btn sci-cta", onclick: submit },
          ["Valider"],
        ),
      ]),
      warn,
    );
    input.focus({ preventScroll: true });
  }

  function verdict(a, v) {
    const bas = essais.filter((e) => e.ancre === 10);
    const haut = essais.filter((e) => e.ancre === 65);
    const med = (xs) => {
      const s = xs.map((e) => e.estimation).sort((p, q) => p - q);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const rows = [
      ["Ton ancre", a + " %"],
      ["Ton estimation", fmt(v, 0) + " %"],
      [
        "Valeur réelle",
        AFRIQUE + " pays sur " + ONU + " membres, soit " + fmt(VRAI, 1) + " %",
      ],
    ];
    if (essais.length > 1) {
      rows.push([
        "Tes essais (ancre 10)",
        bas.length
          ? bas.length +
            " essai" +
            (bas.length > 1 ? "s" : "") +
            ", médiane " +
            fmt(med(bas), 0) +
            " %"
          : "aucun",
      ]);
      rows.push([
        "Tes essais (ancre 65)",
        haut.length
          ? haut.length +
            " essai" +
            (haut.length > 1 ? "s" : "") +
            ", médiane " +
            fmt(med(haut), 0) +
            " %"
          : "aucun",
      ]);
    }
    const tire = a === 10 ? v < VRAI : v > VRAI;
    host.replaceChildren(
      table(rows),
      el("p", { class: "w-note" }, [
        (tire
          ? "Ton estimation s'est écartée de la vraie valeur du côté de l'ancre. "
          : "Ton estimation ne penche pas vers l'ancre cette fois-ci, mais l'effet est statistique : il se voit sur des groupes, pas forcément sur une réponse. ") +
          "Dans l'expérience de Tversky et Kahneman (Science, 1974), une roue truquée s'arrêtait sur 10 ou sur 65 devant les participants ; ceux qui avaient vu 10 donnaient une estimation médiane de 25 %, ceux qui avaient vu 65, de 45 %. Un nombre tiré au hasard, sans aucun lien avec la question, suffisait à déplacer la réponse de 20 points. (La roue de ce widget est truquée de la même façon : elle ne s'arrête que sur 10 ou 65.) On ajuste à partir de l'ancre, mais pas assez.",
      ]),
      el("p", { class: "w-note" }, [
        "Réserve : maintenant que tu connais la réponse, tes essais suivants ne mesurent plus grand-chose — fais plutôt essayer quelqu'un d'autre. Tes réponses restent dans ce navigateur et ne sont envoyées nulle part.",
      ]),
      el("div", { class: "w-controls" }, [
        el("button", { type: "button", class: "w-btn", onclick: roue }, [
          "Recommencer",
        ]),
        essais.length
          ? el(
              "button",
              {
                type: "button",
                class: "w-btn",
                onclick: () => {
                  essais = [];
                  lsSet(KEY, essais);
                  roue();
                },
              },
              ["Effacer mes essais"],
            )
          : null,
      ]),
    );
  }

  roue();
  return el("div", { class: "w-root sci-ancrage" }, [host]);
}
