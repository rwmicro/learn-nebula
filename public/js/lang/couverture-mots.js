// couverture-mots: "if you knew the N most frequent words of this text".
// Frequencies are counted in the text itself — there is no external
// frequency list — so the widget shows how fast a few words cover a text,
// and the Zipf curve of that one text.
//
// Props (all optional):
//   texte: the text, on one line (texte1, texte2… are joined, for long texts)
//   langue: label shown above the text (default: indonésien, with the default text)
//   n: starting N
import { el, svg, fmt, drawWidth, logTicks } from "../widget-kit.js";
import { numbered, fill } from "./common.js";

// The three dialogues of Indonésien/02-Communication/Conversation.md, as written there.
const DEFAULT_TEXT = [
  "Hai! Salam kenal. Hai juga! Aku senang ketemu kamu. Namaku Martin. Siapa namamu? Aku Lita. Kamu dari mana?",
  "Aku orang Prancis. Kamu? Aku dari Bandung, tapi sekarang tinggal di Jakarta. Kamu tinggal di mana?",
  "Aku tinggal di Paris. Aku lagi belajar bahasa Indonesia. Wah, bahasa Indonesiamu bagus!",
  "Selamat siang, saya mau pesan kamar. Selamat siang. Untuk berapa malam? Dua malam. Baik. Mau kamar single atau double?",
  "Double, yang ada AC. Harganya lima ratus ribu rupiah per malam. Oke, saya ambil.",
  "Permisi, minta menunya. Silakan. Saya mau pesan nasi goreng dan es teh. Ada lagi? Tidak, itu saja. Baik, tunggu sebentar ya.",
  "Mas, minta bon. Totalnya tiga puluh lima ribu. Terima kasih. Sama-sama.",
].join(" ");

/** Words: runs of letters (any script), keeping inner apostrophes and hyphens (sama-sama). */
export function tokenize(text) {
  return (String(text).match(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu) || []).map((w) => w.toLocaleLowerCase());
}

/** [{ word, count, rank }] by decreasing count; ties keep the order of first appearance. */
export function rankWords(tokens) {
  const m = new Map();
  tokens.forEach((t, i) => {
    const e = m.get(t);
    if (e) e.count++;
    else m.set(t, { word: t, count: 1, first: i });
  });
  return [...m.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((e, i) => ({ ...e, rank: i + 1 }));
}

export function couvertureMots(props, fig) {
  const parts = numbered(props, "texte").map((x) => x.v);
  const own = String(props.texte || "").trim() || parts.join(" ").trim();
  const text = own || DEFAULT_TEXT;
  const label = props.langue || (own ? "" : "indonésien — les trois dialogues de la fiche Conversation");
  const tokens = tokenize(text);
  const ranked = rankWords(tokens);
  const rankOf = new Map(ranked.map((r) => [r.word, r.rank]));
  const V = ranked.length;
  if (!V) return el("div", { class: "w-root" }, [el("p", { class: "w-warn" }, ["Texte vide : rien à compter."])]);

  const minN = Math.min(10, V);
  let N = Math.max(minN, Math.min(V, Number(props.n) || Math.min(V, 20)));
  const range = el("input", { type: "range", class: "w-range", min: String(minN), max: String(V), step: "1", value: String(N), "aria-label": "Nombre de mots connus" });
  const nOut = el("output", { class: "l-n" });
  const cover = el("p", { class: "l-cover" });
  const plot = el("div", { class: "w-plot-wrap l-zipf" });
  const textBox = el("p", { class: "l-text" });
  const readoutBox = el("div", { class: "w-out" });

  // The text with each word wrapped once; redraws only toggle classes.
  const spans = [];
  const re = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
  let last = 0;
  for (const m of String(text).matchAll(re)) {
    if (m.index > last) textBox.appendChild(document.createTextNode(text.slice(last, m.index)));
    const s = el("span", { class: "l-tok", title: "" }, [m[0]]);
    s.dataset.rank = String(rankOf.get(m[0].toLocaleLowerCase()));
    spans.push(s);
    textBox.appendChild(s);
    last = m.index + m[0].length;
  }
  if (last < text.length) textBox.appendChild(document.createTextNode(text.slice(last)));
  spans.forEach((s) => {
    const r = ranked[Number(s.dataset.rank) - 1];
    s.title = "rang " + r.rank + " · " + r.count + " occurrence" + (r.count > 1 ? "s" : "");
  });

  function zipf() {
    const W = drawWidth(fig, 560, 300);
    const H = 190;
    const P = { l: 40, r: 10, t: 22, b: 32 };
    const maxC = ranked[0].count;
    const lx = (r) => P.l + (Math.log10(r) / Math.log10(Math.max(V, 2))) * (W - P.l - P.r);
    const ly = (c) => H - P.b - (Math.log10(c) / Math.log10(Math.max(maxC, 2))) * (H - P.t - P.b);
    const kids = [];
    for (const t of logTicks(1, Math.max(V, 2))) {
      kids.push(svg("line", { class: "w-gridline", x1: lx(t), x2: lx(t), y1: P.t, y2: H - P.b }));
      kids.push(svg("text", { x: lx(t), y: H - P.b + 14, "text-anchor": "middle" }, [String(t)]));
    }
    for (const t of logTicks(1, Math.max(maxC, 2))) {
      kids.push(svg("line", { class: "w-gridline", x1: P.l, x2: W - P.r, y1: ly(t), y2: ly(t) }));
      kids.push(svg("text", { x: P.l - 6, y: ly(t) + 4, "text-anchor": "end" }, [String(t)]));
    }
    kids.push(svg("line", { class: "w-baseline", x1: P.l, x2: W - P.r, y1: H - P.b, y2: H - P.b }));
    kids.push(svg("text", { x: W - P.r, y: H - 2, "text-anchor": "end" }, ["rang (échelle log)"]));
    kids.push(svg("text", { x: 4, y: 11, "text-anchor": "start" }, ["occurrences (échelle log)"]));
    // Jitter nothing: equal counts share a height, which is the point of the curve's steps.
    for (const r of ranked) {
      kids.push(
        svg("circle", {
          cx: lx(r.rank),
          cy: ly(r.count),
          r: 3,
          fill: r.rank <= N ? "var(--link)" : "var(--rule-strong)",
        }),
      );
    }
    kids.push(svg("line", { x1: lx(N), x2: lx(N), y1: P.t, y2: H - P.b, stroke: "var(--garden)", "stroke-dasharray": "3 3" }));
    fill(plot, 
      svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "w-axis", role: "img", "aria-label": "Fréquence des mots selon leur rang, échelles logarithmiques" }, kids),
    );
  }

  function draw() {
    const known = ranked.slice(0, N);
    const covered = known.reduce((a, r) => a + r.count, 0);
    const pct = (100 * covered) / tokens.length;
    nOut.textContent = String(N);
    fill(cover, 
      "Avec les ",
      el("b", {}, [String(N)]),
      " mots les plus fréquents du texte, on reconnaît ",
      el("b", {}, [fmt(pct, 0) + " %"]),
      " des mots du texte (" + covered + " sur " + tokens.length + ").",
    );
    for (const s of spans) s.classList.toggle("is-unknown", Number(s.dataset.rank) > N);
    fill(readoutBox, 
      el("table", { class: "w-table" }, [
        el("tr", {}, [el("th", {}, ["Mots différents"]), el("td", {}, [String(V)])]),
        el("tr", {}, [el("th", {}, ["Occurrences"]), el("td", {}, [String(tokens.length)])]),
        el("tr", {}, [el("th", {}, ["Les 10 plus fréquents"]), el("td", {}, [ranked.slice(0, 10).map((r) => r.word + " (" + r.count + ")").join(", ")])]),
        el("tr", {}, [el("th", {}, ["Vus une seule fois"]), el("td", {}, [String(ranked.filter((r) => r.count === 1).length) + " mots"])]),
      ]),
    );
    zipf();
  }

  range.addEventListener("input", () => {
    N = Number(range.value);
    draw();
  });

  draw();
  return el("div", { class: "w-root l-couv" }, [
    label ? el("p", { class: "w-hint" }, ["Texte : " + label]) : null,
    el("div", { class: "w-controls" }, [el("label", {}, ["Mots connus : ", range, " ", nOut])]),
    cover,
    textBox,
    plot,
    readoutBox,
    el("p", { class: "w-note" }, [
      "Les fréquences sont comptées dans ce texte même, pas dans une liste de fréquences de la langue : le classement dit quels mots ce texte répète. " +
        "À égalité, le mot apparu le premier passe devant. Sur un texte court, la courbe en échelles log-log descend déjà presque en ligne droite : c'est la loi de Zipf, que les grands corpus rendent plus nette.",
    ]),
  ]);
}
