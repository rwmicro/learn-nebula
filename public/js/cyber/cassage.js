// Widget "cassage": the same password against four hash functions, in time
// to try every candidate on one GPU. What protects is bcrypt's deliberate
// slowness and not being in a wordlist, more than length alone.
// Model and rates: lib/cyber.ts (keyspace, HASH_RATES, humanDuration).
import { el } from "../widget-kit.js";
import {
  CHARSETS,
  HASH_RATES,
  humanDuration,
  keyspace,
} from "../../../lib/cyber.ts";
import { slider } from "../sci/common.js";

const SAMPLE = {
  minuscules: "abcdefghijkmnopqrstuvwxyz",
  majuscules: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  chiffres: "23456789",
  symboles: "!#$%&*+-=?@^_~",
};
const LABEL = {
  minuscules: "minuscules",
  majuscules: "majuscules",
  chiffres: "chiffres",
  symboles: "symboles",
};

export function cassage(props, fig, ctx) {
  let len = Math.max(4, Math.min(20, Number(props.longueur) || 10));
  const want = String(
    props.jeux || "minuscules, majuscules, chiffres",
  ).toLowerCase();
  const boxes = Object.keys(CHARSETS).map((k) => {
    const b = el("input", {
      type: "checkbox",
      checked: want.includes(k.slice(0, 5)),
    });
    b.addEventListener("change", draw);
    return [k, b];
  });
  const dict = el("input", {
    type: "checkbox",
    checked: /^(oui|1)$/i.test(props.dictionnaire || ""),
  });
  dict.addEventListener("change", draw);
  const len$ = slider({
    label: "Longueur",
    min: 4,
    max: 20,
    step: 1,
    value: len,
    format: (v) => v + " car.",
    onInput: (v) => ((len = v), draw()),
  });
  const ex = el("span", { class: "cy-pw" });
  const space = el("span", { class: "w-hint" });
  const rows = el("div", { class: "cy-ck" });
  const note = el("p", { class: "w-note" });

  function sample(sets) {
    const chars = sets.map((s) => SAMPLE[s]).join("");
    let seed = len * 31 + chars.length;
    let out = "";
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      out += chars[seed % chars.length];
    }
    return out;
  }

  function draw() {
    const sets = boxes.filter(([, b]) => b.checked).map(([k]) => k);
    for (const [, b] of boxes) b.disabled = dict.checked;
    len$.input.disabled = dict.checked;
    const ks = keyspace(len, sets, dict.checked);
    if (!ks) {
      ex.textContent = "—";
      space.textContent = "Cochez au moins un jeu de caractères.";
      rows.replaceChildren();
      return;
    }
    ex.textContent = dict.checked ? "soleil42" : sample(sets);
    space.textContent = dict.checked
      ? " 14 millions de mots × 100 suffixes"
      : ` ${ks.toExponential(1).replace(".", ",").replace("e+", " × 10^")} combinaisons`;
    const lo = -3;
    const hi = 20;
    rows.replaceChildren(
      ...HASH_RATES.map((h) => {
        const t = ks / h.rate;
        const w = Math.max(
          2,
          Math.min(
            100,
            ((Math.log10(Math.max(t, 1e-3)) - lo) / (hi - lo)) * 100,
          ),
        );
        const tone = t < 86400 ? "is-fast" : t > 3.15e9 ? "is-slow" : "";
        return el("div", { class: "cy-ck-row" }, [
          el("span", { class: "cy-ck-n" }, [h.name, el("small", {}, [h.note])]),
          el("span", { class: "cy-ck-bar" }, [
            el("i", { class: tone, style: `width:${w}%` }),
          ]),
          el("span", { class: "cy-ck-t" }, [
            humanDuration(t),
            el("small", {}, [
              `${h.rate.toExponential(1).replace(".", ",")} essais/s`,
            ]),
          ]),
        ]);
      }),
    );
    note.textContent = dict.checked
      ? "Un mot du dictionnaire tombe en quelques secondes, même en bcrypt : une attaque commence toujours par les listes (rockyou) et leurs règles de mutation."
      : "Temps pour tout essayer (la moitié suffit en moyenne) avec hashcat sur une RTX 4090. Ordres de grandeur, barres en échelle logarithmique.";
    ctx?.report({
      longueur: len,
      jeux: sets.length,
      dictionnaire: dict.checked ? 1 : 0,
      ntlm_s: Math.round(ks / HASH_RATES[0].rate),
      bcrypt_s: Math.round(ks / HASH_RATES[3].rate),
    });
  }

  draw();
  return el("div", { class: "w-root cy-ck-root" }, [
    el("div", { class: "sci-sliders" }, [len$.node]),
    el("div", { class: "w-controls" }, [
      ...boxes.map(([k, b]) =>
        el("label", { class: "sci-check" }, [b, " " + LABEL[k]]),
      ),
      el("label", { class: "sci-check" }, [
        dict,
        " un mot du dictionnaire + 2 chiffres",
      ]),
    ]),
    el("p", { class: "cy-ck-ex" }, ["Exemple : ", ex, space]),
    rows,
    note,
  ]);
}
