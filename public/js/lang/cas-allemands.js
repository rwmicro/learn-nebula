// cas-allemands: German article declension. Pick the article type, the gender
// and the case; the table lights the form, with an example sentence, and
// optionally the adjective ending (weak / mixed / strong).
//
// Props (all optional):
//   article: defini | indefini | kein | mein | aucun   (aucun = sans article)
//   genre: m | f | n | pl
//   cas: nom | acc | dat | gen
//   adjectif: oui
import { el } from "../widget-kit.js";
import { choice, fill } from "./common.js";

const CASES = ["nom", "acc", "dat", "gen"];
const CASE_NAME = { nom: "Nominatif", acc: "Accusatif", dat: "Datif", gen: "Génitif" };
const GENRES = ["m", "f", "n", "pl"];
const GENRE_NAME = { m: "Masculin", f: "Féminin", n: "Neutre", pl: "Pluriel" };

// Articles: rows nom/acc/dat/gen, columns m/f/n/pl. Allemand/03-Grammaire/Grammaire.md
// gives der and ein; kein and mein (the possessives) decline like ein, with a plural.
const ARTICLES = {
  defini: { label: "défini (der)", forms: [["der", "die", "das", "die"], ["den", "die", "das", "die"], ["dem", "der", "dem", "den"], ["des", "der", "des", "der"]], decl: "faible" },
  indefini: { label: "indéfini (ein)", forms: [["ein", "eine", "ein", null], ["einen", "eine", "ein", null], ["einem", "einer", "einem", null], ["eines", "einer", "eines", null]], decl: "mixte" },
  kein: { label: "négatif (kein)", forms: [["kein", "keine", "kein", "keine"], ["keinen", "keine", "kein", "keine"], ["keinem", "keiner", "keinem", "keinen"], ["keines", "keiner", "keines", "keiner"]], decl: "mixte" },
  mein: { label: "possessif (mein)", forms: [["mein", "meine", "mein", "meine"], ["meinen", "meine", "mein", "meine"], ["meinem", "meiner", "meinem", "meinen"], ["meines", "meiner", "meines", "meiner"]], decl: "mixte" },
  aucun: { label: "sans article", forms: [["", "", "", ""], ["", "", "", ""], ["", "", "", ""], ["", "", "", ""]], decl: "forte" },
};

// Adjective endings, same layout. Weak after der-words; mixed after ein-words
// (ein, kein, mein; their plural takes -en); strong with no article.
const ENDINGS = {
  faible: [["e", "e", "e", "en"], ["en", "e", "e", "en"], ["en", "en", "en", "en"], ["en", "en", "en", "en"]],
  mixte: [["er", "e", "es", "en"], ["en", "e", "es", "en"], ["en", "en", "en", "en"], ["en", "en", "en", "en"]],
  forte: [["er", "e", "es", "e"], ["en", "e", "es", "e"], ["em", "er", "em", "en"], ["en", "er", "en", "er"]],
};

// Nouns of the vault's Allemand notes (Ich habe einen Hund, Ich helfe dem Kind),
// with their case forms: genitive -es, dative plural -n.
const NOUNS = {
  m: { de: ["Hund", "Hund", "Hund", "Hundes"], fr: "chien", g: "m" },
  f: { de: ["Frau", "Frau", "Frau", "Frau"], fr: "femme", g: "f" },
  n: { de: ["Kind", "Kind", "Kind", "Kindes"], fr: "enfant", g: "m" },
  pl: { de: ["Kinder", "Kinder", "Kindern", "Kinder"], fr: "enfants", g: "pl" },
};

// One frame per case: the case is decided by the verb (sein, sehen, helfen)
// or by the genitive complement, as in the note's verb table.
const FRAMES = {
  nom: { de: (np, pl) => cap(np) + (pl ? " sind hier." : " ist hier."), why: "sujet (sein, « être », prend le nominatif)" },
  acc: { de: (np) => "Ich sehe " + np + ".", why: "complément d'objet direct de sehen (« voir »)" },
  dat: { de: (np) => "Ich helfe " + np + ".", why: "helfen (« aider ») veut le datif" },
  gen: { de: (np) => "Das ist das Buch " + np + ".", why: "complément du nom : « le livre de… »" },
};

/** « de » + noun phrase: du, des, d', and de (not « de des ») before an indefinite plural. */
function deFr(np) {
  if (np.startsWith("le ")) return "du " + np.slice(3);
  if (np.startsWith("les ")) return "des " + np.slice(4);
  if (np.startsWith("des ")) return "de " + np.slice(4);
  if (/^[aeiouéh]/.test(np)) return "d'" + np;
  return "de " + np;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** French noun phrase for the example's translation. */
function frNP(type, genre, adj) {
  const n = NOUNS[genre];
  const pl = genre === "pl";
  const fem = n.g === "f";
  const petit = adj ? (pl ? "petits " : fem ? "petite " : "petit ") : "";
  const word = petit + n.fr;
  const vowel = /^[aeiouéh]/.test(word);
  switch (type) {
    case "defini":
      return pl ? "les " + word : vowel ? "l'" + word : (fem ? "la " : "le ") + word;
    case "indefini":
      return (fem ? "une " : "un ") + word;
    case "kein":
      return (fem ? "aucune " : "aucun ") + (pl ? petit.replace(/s $/, " ") + "enfant" : word);
    case "mein":
      return pl ? "mes " + word : (fem && !vowel ? "ma " : "mon ") + word;
    default:
      return (pl ? "des " : fem ? "une " : "un ") + word;
  }
}

function frSentence(cas, np, type, pl) {
  const neg = type === "kein";
  switch (cas) {
    case "nom":
      return cap(np) + (neg ? " n'est ici." : pl ? " sont ici." : " est ici.");
    case "acc":
      return neg ? "Je ne vois " + np + "." : "Je vois " + np + ".";
    case "dat":
      return neg ? "Je n'aide " + np + "." : "J'aide " + np + ".";
    default:
      return "C'est le livre " + deFr(np) + ".";
  }
}

export function casAllemands(props) {
  let type = ARTICLES[props.article] ? props.article : "defini";
  let genre = GENRES.includes(props.genre) ? props.genre : "m";
  let cas = CASES.includes(props.cas) ? props.cas : "acc";
  let adj = /^(oui|true|1)$/i.test(String(props.adjectif || ""));
  // Without an article there is nothing to decline but the adjective.
  if (type === "aucun") adj = true;
  if (type === "indefini" && genre === "pl") genre = "m";

  const tableBox = el("div", { class: "w-scroll l-decl-wrap" });
  const example = el("div", { class: "l-example", "aria-live": "polite" });
  const adjBox = el("input", { type: "checkbox", checked: adj || null });
  adjBox.addEventListener("change", () => {
    adj = adjBox.checked;
    if (!adj && type === "aucun") {
      type = "defini";
      typePick.set(type);
    }
    draw();
  });

  const typePick = choice(
    Object.entries(ARTICLES).map(([k, a]) => [k, a.label]),
    type,
    (v) => {
      type = v;
      if (v === "aucun" && !adj) {
        adj = true;
        adjBox.checked = true;
      }
      if (v === "indefini" && genre === "pl") genre = "m";
      typePick.set(v);
      genrePick.set(genre);
      draw();
    },
    "Article",
  );
  const genrePick = choice(
    GENRES.map((g) => [g, GENRE_NAME[g] + " · " + NOUNS[g].de[0]]),
    genre,
    (v) => {
      genre = v;
      genrePick.set(v);
      draw();
    },
    "Genre",
  );
  const casPick = choice(
    CASES.map((c) => [c, CASE_NAME[c]]),
    cas,
    (v) => {
      cas = v;
      casPick.set(v);
      draw();
    },
    "Cas",
  );

  function form(t, c, g) {
    const art = ARTICLES[t].forms[CASES.indexOf(c)][GENRES.indexOf(g)];
    if (art === null) return null;
    if (!adj) return art;
    const end = ENDINGS[ARTICLES[t].decl][CASES.indexOf(c)][GENRES.indexOf(g)];
    return { art, adj: "klein", end };
  }

  function cellNode(f) {
    if (f === null) return el("span", { class: "w-hint" }, ["—"]);
    if (typeof f === "string") return f;
    return el("span", { class: "l-cell" }, [f.art ? el("span", { class: "l-art" }, [f.art]) : null, f.art ? " " : null, "klein", el("b", { class: "l-end" }, [f.end])]);
  }

  function draw() {
    fill(tableBox, 
      el("table", { class: "w-table l-decl" }, [
        el("thead", {}, [el("tr", {}, [el("th", {}, [""]), ...GENRES.map((g) => el("th", { class: g === genre ? "is-col" : "" }, [GENRE_NAME[g]]))])]),
        el(
          "tbody",
          {},
          CASES.map((c) =>
            el("tr", { class: c === cas ? "is-row" : "" }, [
              el("th", {}, [CASE_NAME[c]]),
              ...GENRES.map((g) =>
                el(
                  "td",
                  {
                    class: c === cas && g === genre ? "is-on" : "",
                    onclick: () => {
                      if (form(type, c, g) === null) return;
                      cas = c;
                      genre = g;
                      casPick.set(c);
                      genrePick.set(g);
                      draw();
                    },
                  },
                  [cellNode(form(type, c, g))],
                ),
              ),
            ]),
          ),
        ),
      ]),
    );

    const f = form(type, cas, genre);
    if (f === null) {
      fill(example, el("p", { class: "w-hint" }, ["ein n'a pas de pluriel : on dit Kinder sans article (« des enfants »)."]));
      return;
    }
    const noun = NOUNS[genre].de[CASES.indexOf(cas)];
    const np = typeof f === "string" ? f + " " + noun : (f.art ? f.art + " " : "") + "klein" + f.end + " " + noun;
    const pl = genre === "pl";
    const sentence = FRAMES[cas].de(np.trim(), pl);
    const fr = frSentence(cas, frNP(type, genre, adj), type, pl);
    const decl = ARTICLES[type].decl;
    fill(example, 
      el("p", { class: "l-de", lang: "de" }, [sentence]),
      el("p", { class: "w-hint" }, ["« " + fr + " » — " + FRAMES[cas].why]),
      adj
        ? el("p", { class: "w-hint" }, [
            "Adjectif : déclinaison " + decl + " (-" + f.end + "). " +
              (decl === "faible"
                ? "Après der/die/das, l'article montre déjà le cas : l'adjectif se contente de -e ou -en."
                : decl === "mixte"
                  ? "Après ein, kein, mein, l'article ne montre pas tout (ein = masculin ou neutre) : l'adjectif reprend la marque (-er, -es) là où l'article n'en a pas."
                  : "Sans article, c'est l'adjectif qui porte la marque du cas, celle qu'aurait eue der/die/das (-er, -em, -es…)."),
          ])
        : null,
      type === "aucun" && !pl
        ? el("p", { class: "w-hint" }, ["Au singulier, un nom comptable sans article est rare : la déclinaison forte sert surtout au pluriel et aux noms de matière (kalter Kaffee)."])
        : null,
      genre !== "f" && genre !== "pl" && cas === "gen" ? el("p", { class: "w-hint" }, ["Au génitif, le nom masculin ou neutre prend -es : des Hundes, des Kindes."]) : null,
      genre === "pl" && cas === "dat" ? el("p", { class: "w-hint" }, ["Au datif pluriel, le nom prend -n : den Kindern."]) : null,
    );
  }

  draw();
  return el("div", { class: "w-root l-cas" }, [
    typePick.node,
    genrePick.node,
    casPick.node,
    el("div", { class: "w-controls" }, [el("label", {}, [adjBox, " avec un adjectif (klein, « petit »)"])]),
    tableBox,
    example,
    el("p", { class: "w-note" }, [
      "Le masculin est le seul genre qui change entre nominatif et accusatif (der → den, ein → einen) ; féminin et pluriel ont la même forme aux deux cas. " +
        "Cliquer une case du tableau pour l'exemple correspondant.",
    ]),
  ]);
}
