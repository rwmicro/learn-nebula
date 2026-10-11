// conjugaison: a verb's present (and a few other tenses) in the garden's
// languages, the ending coloured apart from the stem so the pattern shows:
// German endings and vowel change, Spanish stem changes, Turkish suffixes
// stacked on the stem, Romanian endings — and Indonesian, which has none.
//
// Props (all optional):
//   langue: Allemand | Espagnol | Turc | Roumain | Indonésien
//   verbe:  one of that language's verbs below (default: the first)
import { el } from "../widget-kit.js";
import { fill } from "./common.js";

const PRON = {
  Allemand: ["ich", "du", "er / sie / es", "wir", "ihr", "sie / Sie"],
  Espagnol: ["yo", "tú", "él / ella", "nosotros", "vosotros", "ellos"],
  Turc: ["ben", "sen", "o", "biz", "siz", "onlar"],
  Roumain: ["eu", "tu", "el / ea", "noi", "voi", "ei / ele"],
  Indonésien: ["saya", "kamu", "dia", "kami / kita", "kalian", "mereka"],
};

// Each form is [stem, suffix, ending]. A stem starting with "!" changed
// (German umlaut, Spanish e→ie, an irregular form).
const VERBS = {
  Allemand: {
    "machen · faire": ["mach||e", "mach||st", "mach||t", "mach||en", "mach||t", "mach||en"],
    "fahren · aller (en véhicule)": ["fahr||e", "!fähr||st", "!fähr||t", "fahr||en", "fahr||t", "fahr||en"],
    "haben · avoir": ["hab||e", "!ha||st", "!ha||t", "hab||en", "hab||t", "hab||en"],
    "sein · être": ["!bin||", "!bist||", "!ist||", "!sind||", "!seid||", "!sind||"],
  },
  Espagnol: {
    "hablar · parler": ["habl||o", "habl||as", "habl||a", "habl||amos", "habl||áis", "habl||an"],
    "comer · manger": ["com||o", "com||es", "com||e", "com||emos", "com||éis", "com||en"],
    "vivir · vivre": ["viv||o", "viv||es", "viv||e", "viv||imos", "viv||ís", "viv||en"],
    "tener · avoir": ["!teng||o", "!tien||es", "!tien||e", "ten||emos", "ten||éis", "!tien||en"],
    "ser · être": ["!soy||", "!eres||", "!es||", "!somos||", "!sois||", "!son||"],
  },
  Turc: {
    "gelmek · venir, présent continu": ["gel|iyor|um", "gel|iyor|sun", "gel|iyor|", "gel|iyor|uz", "gel|iyor|sunuz", "gel|iyor|lar"],
    "okumak · lire, présent continu": ["oku|yor|um", "oku|yor|sun", "oku|yor|", "oku|yor|uz", "oku|yor|sunuz", "oku|yor|lar"],
    "gelmek · venir, passé": ["gel|di|m", "gel|di|n", "gel|di|", "gel|di|k", "gel|di|niz", "gel|di|ler"],
    "gelmek · venir, futur": ["gel|eceğ|im", "gel|ecek|sin", "gel|ecek|", "gel|eceğ|iz", "gel|ecek|siniz", "gel|ecek|ler"],
  },
  Roumain: {
    "a lucra · travailler": ["lucr||ez", "lucr||ezi", "lucr||ează", "lucr||ăm", "lucr||ați", "lucr||ează"],
    "a merge · aller": ["merg||", "merg||i", "merg||e", "merg||em", "merg||eți", "merg||"],
    "a fi · être": ["!sunt||", "!ești||", "!este||", "!suntem||", "!sunteți||", "!sunt||"],
  },
  Indonésien: {
    "makan · manger": ["makan||", "makan||", "makan||", "makan||", "makan||", "makan||"],
  },
};

const NOTE = {
  Allemand: "En vert la terminaison ; en bleu le radical qui change (inflexion a → ä à la 2e et 3e personne, verbes irréguliers).",
  Espagnol: "En vert la terminaison, qui dit seule la personne : le pronom est souvent omis. En bleu les radicaux qui changent (tener : teng-, tien-).",
  Turc: "Le turc colle les suffixes au radical : temps (en orange) puis personne (en vert). Les voyelles s'accordent avec celle du radical : gel-iyor, oku-yor.",
  Roumain: "En vert la terminaison. Beaucoup de verbes en -a prennent -ez- (lucrez), comme l'italien -isc-.",
  Indonésien: "Le verbe ne change jamais : le pronom dit qui, et des mots comme sudah (déjà), sedang (en train de) ou akan (futur) disent quand.",
};

export function conjugaison(props) {
  let lang = VERBS[props.langue] ? props.langue : "Allemand";
  let verb = VERBS[lang][props.verbe] ? props.verbe : Object.keys(VERBS[lang])[0];
  const table = el("table", { class: "w-table l-conj" });
  const note = el("p", { class: "w-note" });
  const verbSel = el("select", { class: "l-select", "aria-label": "Verbe" });
  verbSel.addEventListener("change", () => {
    verb = verbSel.value;
    draw();
  });
  const langSel = el("select", { class: "l-select", "aria-label": "Langue" }, Object.keys(VERBS).map((l) => el("option", { value: l, selected: l === lang }, [l])));
  langSel.addEventListener("change", () => {
    lang = langSel.value;
    verb = Object.keys(VERBS[lang])[0];
    fillVerbs();
    draw();
  });
  function fillVerbs() {
    fill(verbSel, ...Object.keys(VERBS[lang]).map((v) => el("option", { value: v, selected: v === verb }, [v])));
  }
  function draw() {
    fill(
      table,
      ...VERBS[lang][verb].map((form, i) => {
        let [stem, mid, end] = form.split("|");
        const changed = stem.startsWith("!");
        if (changed) stem = stem.slice(1);
        return el("tr", {}, [
          el("th", {}, [PRON[lang][i]]),
          el("td", {}, [el("span", { class: changed ? "l-chg" : "" }, [stem]), mid && el("span", { class: "l-mid" }, [mid]), end && el("span", { class: "l-end" }, [end])]),
        ]);
      }),
    );
    note.textContent = NOTE[lang];
  }
  fillVerbs();
  draw();
  return el("div", { class: "w-root l-conj-root" }, [
    el("div", { class: "w-controls" }, [el("label", {}, ["Langue ", langSel]), el("label", {}, ["Verbe ", verbSel])]),
    table,
    note,
  ]);
}
