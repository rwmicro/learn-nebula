// etymologie-tok-pisin: Tok Pisin words traced to the language they came from,
// a filter by source, and a bar with the share of each source in this list.
//
// Props (all optional):
//   source: anglais | allemand | portugais | tolai | malais | polynesien  — starting filter
import { el, seriesVar } from "../widget-kit.js";
import { choice, fill } from "./common.js";

const SOURCES = [
  ["anglais", "Anglais"],
  ["allemand", "Allemand"],
  ["portugais", "Portugais"],
  ["tolai", "Tolai (kuanua)"],
  ["malais", "Malais"],
  ["polynesien", "Polynésien"],
];

// [word, gloss, source, etymon, vault?]. vault = true: word, origin and gloss
// from the Tok Pisin notes (03-Grammaire/Tok-Pisin-Complet.md, 04-Vocabulaire,
// 01-Phonologie). The others are the textbook etymologies of the language.
const WORDS = [
  ["haus", "maison", "anglais", "house", true],
  ["wara", "eau, rivière", "anglais", "water", true],
  ["pik", "cochon", "anglais", "pig", true],
  ["dok", "chien", "anglais", "dog", true],
  ["gras", "herbe, poils, barbe", "anglais", "grass", true],
  ["paia", "feu", "anglais", "fire", true],
  ["mun", "lune", "anglais", "moon", true],
  ["san", "soleil", "anglais", "sun", true],
  ["ston", "pierre", "anglais", "stone", true],
  ["ailan", "île", "anglais", "island", true],
  ["sik", "malade", "anglais", "sick", true],
  ["bikpela", "grand", "anglais", "big + fellow", true],
  ["gutpela", "bon, beau", "anglais", "good + fellow", false],
  ["tupela", "deux", "anglais", "two + fellow", true],
  ["wantok", "compatriote de même langue", "anglais", "one + talk", true],
  ["solwara", "mer", "anglais", "salt + water", true],
  ["tenkyu", "merci", "anglais", "thank you", true],
  ["nogut", "mauvais", "anglais", "no good", false],
  ["sindaun", "s'asseoir", "anglais", "sit down", false],
  ["kirap", "se lever", "anglais", "get up", false],
  ["sanap", "se tenir debout", "anglais", "stand up", false],
  ["bagarap", "cassé, abîmé, en panne", "anglais", "bugger up", false],
  ["mausgras", "moustache", "anglais", "mouth + grass", false],
  ["tumora", "demain", "anglais", "tomorrow", false],
  ["bihain", "après, plus tard", "anglais", "behind", false],
  ["raus", "sortir, dehors", "allemand", "heraus", true],
  ["beten", "prier", "allemand", "beten", true],
  ["borim", "percer, forer", "allemand", "bohren", true],
  ["gumi", "caoutchouc", "allemand", "Gummi", true],
  ["save", "savoir ; marque de l'habitude", "portugais", "saber", true],
  ["pikinini", "enfant", "portugais", "pequenino (« tout petit »)", true],
  ["kiau", "œuf", "tolai", "kiau", false],
  ["susu", "lait, sein", "malais", "susu", false],
  ["binatang", "insecte", "malais", "binatang (« animal »)", false],
  ["kaikai", "nourriture, manger", "polynesien", "kai (« nourriture »)", false],
];

export function etymologieTokPisin(props) {
  let filter = SOURCES.some(([k]) => k === props.source) ? props.source : "tous";
  const bar = el("div", { class: "l-share", role: "img" });
  const legend = el("ul", { class: "w-legend l-share-legend" });
  const list = el("div", { class: "l-etyms" });
  const count = {};
  for (const w of WORDS) count[w[2]] = (count[w[2]] || 0) + 1;
  const color = (src) => seriesVar(SOURCES.findIndex(([k]) => k === src));

  const pick = choice(
    [["tous", "Toutes"], ...SOURCES],
    filter,
    (v) => {
      filter = v;
      pick.set(v);
      draw();
    },
    "Origine",
  );

  function draw() {
    const total = WORDS.length;
    bar.setAttribute("aria-label", SOURCES.map(([k, n]) => n + " " + (count[k] || 0)).join(", ") + " sur " + total + " mots");
    fill(bar, 
      ...SOURCES.filter(([k]) => count[k]).map(([k, n]) =>
        el("span", {
          class: "l-share-seg" + (filter !== "tous" && filter !== k ? " is-dim" : ""),
          style: "flex:" + count[k] + ";background:" + color(k),
          title: n + " : " + count[k] + " mot" + (count[k] > 1 ? "s" : ""),
        }),
      ),
    );
    fill(legend, 
      ...SOURCES.filter(([k]) => count[k]).map(([k, n]) =>
        el("li", { class: filter !== "tous" && filter !== k ? "is-dim" : "" }, [
          el("i", { style: "background:" + color(k) }),
          n + " " + Math.round((100 * count[k]) / total) + " % (" + count[k] + ")",
        ]),
      ),
    );
    const shown = WORDS.filter((w) => filter === "tous" || w[2] === filter);
    fill(list, 
      ...shown.map(([word, gloss, src, etym, vault]) =>
        el("div", { class: "l-etym", style: "--src:" + color(src) }, [
          el("b", {}, [word]),
          el("span", { class: "l-etym-gloss" }, [gloss]),
          el("span", { class: "l-etym-from" }, [
            "← ",
            el("i", {}, [etym]),
            " · " + SOURCES.find(([k]) => k === src)[1],
            vault ? null : el("span", { class: "w-hint", title: "étymologie classique, pas encore dans les notes" }, [" °"]),
          ]),
        ]),
      ),
    );
  }

  draw();
  return el("div", { class: "w-root l-tokpisin" }, [
    pick.node,
    el("p", { class: "w-hint" }, ["Part de chaque origine parmi les " + WORDS.length + " mots ci-dessous"]),
    bar,
    legend,
    list,
    el("p", { class: "w-note" }, [
      "Ces parts décrivent cet échantillon, pas tout le lexique : la fiche de prononciation estime l'ensemble à environ 80 % d'anglais, 10 % de mélanésien et 5 % d'allemand. " +
        "« -pela » vient de fellow ; bien des mots anglais ont changé de sens (gras : l'herbe, mais aussi les poils). " +
        "° : étymologie classique du tok pisin, absente des notes pour l'instant.",
    ]),
  ]);
}
