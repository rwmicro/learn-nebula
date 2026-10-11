// trois-arabes: one sentence in literary Arabic, Lebanese and Darija side by
// side — Arabic script, transliteration, French — with the points where the
// three differ marked.
//
// Props (all optional; without phraseN the built-in set below is used):
//   phrase1: fr | littéraire (arabe) | translit | libanais (arabe) | translit | darija (arabe) | translit
//   audio1:  clip littéraire | clip libanais | clip darija   (vault-relative paths, "-" for none)
//   note1:   what to notice in this sentence
// In the Arabic and transliteration fields, *stars* mark the differing part.
import { el } from "../widget-kit.js";
import { choice, marked, numbered, pronButton, vaultUrl, fill } from "./common.js";

const LIT = "Social Sciences/Languages - Dialects/Arabe/Littéraire/Arabe-Standard/02-Communication/audio/";
const LIB = "Social Sciences/Languages - Dialects/Arabe/Libanais/02-Communication/audio/";
const LIB_G = "Social Sciences/Languages - Dialects/Arabe/Libanais/03-Grammaire/audio/";

// Littéraire and libanais: Arabe/Littéraire/…/Phrases-Essentielles.md and
// Arabe/Libanais/02-Communication/Phrases-Essentielles.md, 03-Grammaire/Negation.md,
// each with its clip. Darija: the vault's Darija folder has no vocabulary yet,
// so these are common Moroccan forms, without audio.
const DEFAULT = [
  {
    fr: "Je ne comprends pas",
    v: [
      ["*لا* أَفْهَم", "*lā* afham", LIT + "ar_male_a2a4d3955bad.mp3"],
      ["*ما* فهمت", "*mā* fhimt", LIB + "ar-lb_male_4f463a9c3927.mp3"],
      ["*ما* فهمت*ش*", "*ma* fhemt*sh*", ""],
    ],
    note: "La négation : lā devant le verbe en littéraire, mā en libanais, ma…sh qui encadre le verbe en darija. Les deux dialectes disent ici « je n'ai pas compris », au passé.",
  },
  {
    fr: "Je ne sais pas",
    v: [
      ["*لا* أَعْرِف", "*lā* aʿrif", ""],
      ["*ما* بعرف", "*mā* ba3rif", LIB_G + "ar-lb_male_28a4f45e56d2.mp3"],
      ["*ما* عرفت*ش*", "*ma* 3reft*sh*", ""],
    ],
    note: "Même racine ʿ-r-f dans les trois. Le libanais ajoute b- au présent (ba3rif), la darija met le verbe au passé et l'encadre de ma…sh.",
  },
  {
    fr: "Je veux manger",
    v: [
      ["*أُريدُ أَنْ* آكُلَ", "*urīdu an* ākula", ""],
      ["*بدي* آكل", "*biddi* ākul", LIB + "ar-lb_male_259b85a9f73b.mp3"],
      ["*بغيت* ناكل", "*bghit* nakul", ""],
    ],
    note: "« Vouloir » ne se dit pas avec le même mot : urīdu (verbe), biddi (bidd- + pronom : biddi, biddak…), bghit. Le littéraire relie les deux verbes par an, les dialectes les juxtaposent.",
  },
  {
    fr: "Maintenant",
    v: [
      ["*الآن*", "*al-āna*", ""],
      ["*هلق*", "*halla2*", LIB + "ar-lb_male_8dbe6274343c.mp3"],
      ["*دابا*", "*daba*", ""],
    ],
    note: "Trois mots différents : c'est dans les adverbes de temps et de lieu que les dialectes s'éloignent le plus du littéraire.",
  },
  {
    fr: "Où ?",
    v: [
      ["*أَيْنَ*؟", "*ayna*", LIT + "ar_male_7b028f2c6c4a.mp3"],
      ["*وين*؟", "*wēn*", ""],
      ["*فين*؟", "*fīn*", ""],
    ],
    note: "wēn et fīn gardent la finale de ayna ; seule l'attaque change.",
  },
  {
    fr: "Combien ça coûte ?",
    v: [
      ["*بِكَمْ* هَذا؟", "*bi-kam* hādhā", LIT + "ar_male_7f1f18898b97.mp3"],
      ["*قديش*؟", "*addēsh*", LIB + "ar-lb_male_d9c536d91420.mp3"],
      ["*بشحال* هادا؟", "*bsh7al* hada", ""],
    ],
    note: "Le libanais prononce le ق comme un coup de glotte (addēsh, écrit 2 ou rien) ; le dh (ذ) de hādhā devient d en darija.",
  },
  {
    fr: "Pas de problème",
    v: [
      ["*لا* مُشْكِلَة", "*lā* mushkila", ""],
      ["*ما في* مشكل", "*mā fī* mushkil", LIB + "ar-lb_male_aa97a0b28c6d.mp3"],
      ["*ما كاين* مشكل", "*ma kayn* mushkil", ""],
    ],
    note: "« Il y a » : fī en libanais, kayn en darija, et la même négation mā / ma devant. Le mot problème est presque le même partout.",
  },
  {
    fr: "Comment vas-tu ? (à un homme)",
    v: [
      ["*كَيْفَ* حالُك؟", "*kayfa* ḥāluk", LIT + "ar_male_c322b5d8eaed.mp3"],
      ["*كيف*ك؟", "*kīf*ak", LIB + "ar-lb_male_a80e37781f54.mp3"],
      ["*كي* داير؟", "*ki* dayr", ""],
    ],
    note: "Même mot interrogatif (kayfa → kīf → ki). Le libanais lui colle le pronom (kīf-ak, « comment-toi »), la darija emploie le participe dayr (« faisant »).",
  },
];

const NAMES = ["Arabe littéraire", "Libanais", "Darija"];

function parse(props) {
  const audios = Object.fromEntries(numbered(props, "audio").map((a) => [a.n, a.v.split("|").map((s) => s.trim())]));
  const notes = Object.fromEntries(numbered(props, "note").map((a) => [a.n, a.v]));
  const list = numbered(props, "phrase")
    .map(({ n, v }) => {
      const f = v.split("|").map((s) => s.trim());
      if (f.length < 7) return null;
      const au = audios[n] || [];
      return {
        fr: f[0],
        v: [0, 1, 2].map((i) => [f[1 + 2 * i], f[2 + 2 * i], vaultUrl(au[i])]),
        note: notes[n] || "",
      };
    })
    .filter(Boolean);
  if (list.length) return list;
  return DEFAULT.map((p) => ({ ...p, v: p.v.map(([a, t, au]) => [a, t, vaultUrl(au)]) }));
}

export function troisArabes(props) {
  const list = parse(props);
  let i = 0;
  const cols = el("div", { class: "l-three" });
  const note = el("p", { class: "w-note" });
  const title = el("p", { class: "l-fr" });

  const pick = choice(
    list.map((p, k) => [String(k), p.fr]),
    "0",
    (v) => {
      i = Number(v);
      pick.set(v);
      draw();
    },
    "Phrase",
  );

  function draw() {
    const p = list[i];
    fill(title, "« " + p.fr + " »");
    fill(cols, 
      ...p.v.map(([ar, tr, au], k) =>
        el("div", { class: "l-variety l-var-" + k }, [
          el("p", { class: "l-var-name" }, [NAMES[k]]),
          ar ? marked(ar, { class: "l-ar", dir: "rtl", lang: "ar" }) : el("span", { class: "w-hint" }, ["—"]),
          el("p", { class: "l-tr" }, [tr ? marked(tr) : "—", " ", pronButton(au, ar.replace(/\*/g, ""))]),
        ]),
      ),
    );
    fill(note, p.note || "");
    note.hidden = !p.note;
  }

  draw();
  return el("div", { class: "w-root l-trois" }, [
    pick.node,
    title,
    cols,
    note,
    el("p", { class: "w-hint l-legend" }, [
      el("mark", { class: "l-diff" }, ["surligné"]),
      " : là où les trois diffèrent. Translittérations des notes (2 = coup de glotte, 3 = ʿayn, 7 = ḥ). " +
        "La darija n'a pas encore de fiche de vocabulaire dans le jardin : ses formes, courantes, sont données sans enregistrement.",
    ]),
  ]);
}
