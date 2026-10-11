// meme-mot: one concept across the garden's languages, grouped by family as
// in Familles-Linguistiques.md. Click a word for its transliteration and source.
//
// Props (all optional):
//   concept: eau | mère | deux | soleil | manger | merci | main | maison
import { el, seriesVar } from "../widget-kit.js";
import { choice, fill } from "./common.js";

const CONCEPTS = ["eau", "mère", "deux", "soleil", "manger", "merci", "main", "maison"];

// The tree of Familles-Linguistiques.md (Ouïghour from its Turkic table,
// Arabe littéraire next to the Lebanese).
export const FAMILIES = [
  { name: "Indo-européennes", branches: [["Germaniques", ["en", "de"]], ["Romanes", ["es", "ro"]], ["Indo-iraniennes", ["hi"]]] },
  { name: "Turciques", branches: [["Oghouz", ["tr", "az"]], ["Karlouk", ["ug"]]] },
  { name: "Sino-tibétaines", branches: [["Sinitiques", ["zh", "hak"]]] },
  { name: "Austronésiennes", branches: [["Malayiques", ["id", "ms", "sbs"]]] },
  { name: "Dravidiennes", branches: [["", ["ta"]]] },
  { name: "Afro-asiatiques", branches: [["Sémitiques", ["ar", "lb"]], ["Berbères", ["kab"]]] },
  { name: "Créoles à base anglaise", branches: [["", ["tpi"]]] },
];

export const LANG = {
  en: "Anglais",
  de: "Allemand",
  es: "Espagnol",
  ro: "Roumain",
  hi: "Hindi",
  tr: "Turc",
  az: "Azéri",
  ug: "Ouïghour",
  zh: "Mandarin",
  hak: "Hakka",
  id: "Indonésien",
  ms: "Malais",
  sbs: "Sambas",
  ta: "Tamoul",
  ar: "Arabe littéraire",
  lb: "Arabe libanais",
  kab: "Kabyle",
  tpi: "Tok Pisin",
};

// [word, transliteration or "", source]: "v" = found in the vault's notes,
// "c" = common word not (yet) in the notes. An absent cell is a word that
// was neither in the notes nor certain enough to write.
const W = {
  eau: {
    en: ["water", "", "v"], de: ["Wasser", "", "c"], es: ["agua", "", "c"], ro: ["apă", "", "v"], hi: ["पानी", "pānī", "v"],
    tr: ["su", "", "v"], az: ["su", "", "v"], ug: ["su", "", "c"], zh: ["水", "shuǐ", "v"], hak: ["sui", "", "v"],
    id: ["air", "", "v"], ms: ["air", "", "v"], sbs: ["aek", "", "v"], ta: ["தண்ணீர்", "taṇṇīr", "v"],
    ar: ["ماء", "māʾ", "v"], lb: ["مي", "mayy", "v"], kab: ["aman", "", "v"], tpi: ["wara", "", "v"],
  },
  mère: {
    en: ["mother", "", "c"], de: ["Mutter", "", "c"], es: ["madre", "", "v"], ro: ["mamă", "", "v"], hi: ["माँ", "mā̃", "v"],
    tr: ["anne", "", "v"], az: ["ana", "", "v"], ug: ["ana", "", "v"], zh: ["妈妈", "māma", "v"],
    id: ["ibu", "", "v"], ms: ["ibu", "", "v"], sbs: ["uma'k", "", "v"], ta: ["அம்மா", "ammā", "c"],
    ar: ["أُمّ", "umm", "c"], lb: ["إمّ", "imm", "v"], kab: ["yemma", "", "v"], tpi: ["mama", "", "v"],
  },
  deux: {
    en: ["two", "", "c"], de: ["zwei", "", "v"], es: ["dos", "", "v"], ro: ["doi / două", "", "v"], hi: ["दो", "do", "v"],
    tr: ["iki", "", "v"], az: ["iki", "", "v"], ug: ["ikki", "", "v"], zh: ["二 / 两", "èr / liǎng", "v"], hak: ["nyi", "", "v"],
    id: ["dua", "", "v"], ms: ["dua", "", "v"], ta: ["இரண்டு", "iraṇṭu", "v"],
    ar: ["اِثْنان", "ithnān", "v"], lb: ["تنين", "tnēn", "v"], kab: ["sin / snat", "", "v"], tpi: ["tupela", "", "v"],
  },
  soleil: {
    en: ["sun", "", "v"], de: ["Sonne", "", "v"], es: ["sol", "", "v"], ro: ["soare", "", "v"], hi: ["सूरज", "sūraj", "c"],
    tr: ["güneş", "", "c"], az: ["günəş", "", "c"], zh: ["太阳", "tàiyáng", "c"],
    id: ["matahari", "", "v"], ms: ["matahari", "", "c"], ta: ["சூரியன்", "cūriyaṉ", "c"],
    ar: ["شَمْس", "shams", "c"], lb: ["شمس", "shams", "v"], kab: ["iṭij", "", "c"], tpi: ["san", "", "v"],
  },
  manger: {
    en: ["eat", "", "v"], de: ["essen", "", "v"], es: ["comer", "", "v"], ro: ["a mânca", "", "v"], hi: ["खाना", "khānā", "v"],
    tr: ["yemek", "", "v"], az: ["yemək", "", "v"], ug: ["yëmek", "", "v"], zh: ["吃", "chī", "v"], hak: ["sit", "", "v"],
    id: ["makan", "", "v"], ms: ["makan", "", "v"], sbs: ["majoh", "", "v"], ta: ["சாப்பிட", "cāppiṭa", "v"],
    ar: ["أَكَلَ", "akala", "v"], lb: ["أكل", "akal", "v"], kab: ["ečč", "", "v"], tpi: ["kaikai", "", "v"],
  },
  merci: {
    en: ["thank you", "", "v"], de: ["danke", "", "v"], es: ["gracias", "", "v"], ro: ["mulțumesc", "", "v"], hi: ["धन्यवाद / शुक्रिया", "dhanyavād / shukriyā", "v"],
    tr: ["teşekkür ederim", "", "v"], az: ["sağ ol", "", "v"], ug: ["rexmet", "", "v"], zh: ["谢谢", "xièxie", "v"],
    id: ["terima kasih", "", "v"], ms: ["terima kasih", "", "v"], sbs: ["terima kasih", "", "v"], ta: ["நன்றி", "naṉṟi", "v"],
    ar: ["شُكْراً", "shukran", "v"], lb: ["شكراً / مرسي", "shukran / mersi", "v"], kab: ["tanemmirt", "", "v"], tpi: ["tenkyu", "", "v"],
  },
  main: {
    en: ["hand", "", "c"], de: ["Hand", "", "c"], es: ["mano", "", "c"], ro: ["mână", "", "v"], hi: ["हाथ", "hāth", "c"],
    tr: ["el", "", "v"], az: ["əl", "", "v"], ug: ["qol", "", "v"], zh: ["手", "shǒu", "v"],
    id: ["tangan", "", "v"], ms: ["tangan", "", "c"], ta: ["கை", "kai", "c"],
    ar: ["يَد", "yad", "c"], lb: ["إيد", "īd", "v"], kab: ["afus", "", "v"], tpi: ["han", "", "v"],
  },
  maison: {
    en: ["house", "", "v"], de: ["Haus", "", "c"], es: ["casa", "", "c"], ro: ["casă", "", "v"], hi: ["घर", "ghar", "v"],
    tr: ["ev", "", "v"], az: ["ev", "", "v"], ug: ["öy", "", "v"], zh: ["房子", "fángzi", "v"],
    id: ["rumah", "", "v"], ms: ["rumah", "", "v"], sbs: ["rumah", "", "v"], ta: ["வீடு", "vīṭu", "v"],
    ar: ["بَيْت", "bayt", "v"], lb: ["بيت", "bēt", "v"], kab: ["axxam", "", "v"], tpi: ["haus", "", "v"],
  },
};

const RTL = new Set(["ar", "lb"]);

export function memeMot(props) {
  const want = String(props.concept || "").toLowerCase();
  let concept = CONCEPTS.includes(want) ? want : "eau";
  let open = null; // language code whose detail is shown
  const tree = el("div", { class: "l-tree" });
  const detail = el("p", { class: "l-detail", "aria-live": "polite" });
  const count = el("p", { class: "w-hint" });

  const pick = choice(
    CONCEPTS.map((c) => [c, c]),
    concept,
    (v) => {
      concept = v;
      open = null;
      pick.set(v);
      draw();
    },
    "Mot",
  );

  function cell(code) {
    const w = W[concept][code];
    if (!w) return el("span", { class: "l-mm-word is-empty", title: "pas dans les notes" }, ["—"]);
    return el(
      "button",
      {
        type: "button",
        class: "l-mm-word" + (open === code ? " is-active" : ""),
        "aria-expanded": open === code ? "true" : "false",
        onclick: () => {
          open = open === code ? null : code;
          draw();
        },
      },
      [el("span", { dir: RTL.has(code) ? "rtl" : null, lang: code === "lb" ? "ar" : code }, [w[0]])],
    );
  }

  function draw() {
    fill(tree, 
      ...FAMILIES.map((f, fi) =>
        el("section", { class: "l-fam", style: "--fam:" + (fi < 6 ? seriesVar(fi) : "var(--muted)") }, [
          el("h4", { class: "l-fam-name" }, [f.name]),
          ...f.branches.map(([b, langs]) =>
            el("div", { class: "l-branch" }, [
              b ? el("p", { class: "l-branch-name" }, [b]) : null,
              ...langs.map((code) => el("div", { class: "l-mm-row" }, [el("span", { class: "l-mm-lang" }, [LANG[code]]), cell(code)])),
            ]),
          ),
        ]),
      ),
    );
    const filled = Object.keys(W[concept]).length;
    count.textContent = filled + " langues sur " + Object.keys(LANG).length + " ont une forme ici ; « — » : pas de forme sûre dans les notes.";
    if (open && W[concept][open]) {
      const [word, tr, src] = W[concept][open];
      fill(detail, 
        el("b", {}, [LANG[open] + " : "]),
        el("span", { dir: RTL.has(open) ? "rtl" : null }, [word]),
        tr ? " — " + tr : " (écriture latine)",
        el("span", { class: "w-hint" }, [src === "v" ? " · d'après les notes du jardin" : " · mot courant, pas encore dans les notes"]),
      );
    } else fill(detail, el("span", { class: "w-hint" }, ["Cliquer un mot pour sa translittération et sa source."]));
  }

  draw();
  return el("div", { class: "w-root l-meme" }, [
    pick.node,
    detail,
    tree,
    count,
    el("p", { class: "w-note" }, [
      "Les ressemblances suivent la famille (Wasser / water, su / su, air / air / aek) ou l'emprunt (tenkyu de l'anglais, mersi du français en libanais, shukriyā de l'arabe en hindi). " +
        "Deux langues d'une même famille peuvent aussi tout changer : comparer mère en arabe littéraire et en kabyle.",
    ]),
  ]);
}
