// The data pack's other widgets: country fact sheet, true-or-false, ranking,
// franc-euro converter, compound interest against inflation, Lichess opening
// stats, Wikidata language sheet; and the inline prices' popover.
import { el, svg, fmt, fmtShort, esc, seriesVar, drawWidth, tooltip } from "../widget-kit.js";
import { lineChart, fmtValue, legend } from "./chart.js";
import { sourceLine } from "./owid.js";

// ----------------------------------------------------------- fiche-pays

export function fichePays(props) {
  const metrics = props.metrics || [];
  if (!metrics.length) throw new Error("pas de données");
  const cards = metrics.map((m) => {
    const first = m.points[0];
    const last = m.points.at(-1);
    const W = 160, H = 38;
    const xs = (yr) => 2 + ((yr - first[0]) / (last[0] - first[0] || 1)) * (W - 8);
    const vals = m.points.map((p) => p[1]);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const ys = (v) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 8);
    const d = m.points.map((p, i) => `${i ? "L" : "M"}${xs(p[0]).toFixed(1)},${ys(p[1]).toFixed(1)}`).join("");
    const spark = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: H, role: "img", "aria-label": `${m.label} de ${first[0]} à ${last[0]}`, preserveAspectRatio: "none" }, [
      svg("path", { d, fill: "none", stroke: seriesVar(0), "stroke-width": 1.6, "vector-effect": "non-scaling-stroke" }),
      svg("circle", { cx: xs(last[0]), cy: ys(last[1]), r: 2.5, fill: seriesVar(0) }),
    ]);
    const ratio = last[1] / first[1];
    const change =
      m.unit === "ans"
        ? `${last[1] - first[1] >= 0 ? "+" : ""}${fmtValue(last[1] - first[1])} ans depuis ${first[0]}`
        : `×${fmt(ratio, ratio < 10 ? 1 : 0)} depuis ${first[0]}`;
    return el("div", {}, [
      el("div", { class: "w-fiche-l" }, [m.label]),
      el("div", { class: "w-fiche-v" }, [fmtValue(last[1]), " ", el("small", {}, [m.unit])]),
      spark,
      el("div", { class: "w-fiche-d" }, [`${last[0]} · ${change}`]),
    ]);
  });
  return el("div", { class: "w-root" }, [
    el("p", { class: "w-chart-title" }, [`${props.country} en chiffres`]),
    el("div", { class: "w-fiche" }, cards),
    el("p", { class: "w-source" }, ["Source : ", el("a", { href: "https://ourworldindata.org/", rel: "noopener", target: "_blank" }, ["Our World in Data"]), `, d'après ${props.source?.citation || ""} · CC BY`]),
  ]);
}

// ----------------------------------------------------------- vrai-faux

export function vraiFaux(props, fig) {
  const out = el("div", { "aria-live": "polite" });
  const pick = (choice) => {
    buttons.forEach((b) => (b.disabled = true));
    const right = choice === props.answer;
    out.replaceChildren(
      el("p", { class: "w-verdict " + (right ? "w-ok" : "w-ko") }, [
        right ? "Bonne réponse : " : "Non : ",
        props.answer === "vrai" ? "c'est vrai." : "c'est faux.",
      ]),
      props.explanation && el("p", { class: "w-note" }, [props.explanation]),
    );
    if (props.chart) {
      const c = props.chart;
      const plot = el("div", { class: "w-plot-wrap" });
      out.append(el("p", { class: "w-chart-title" }, [c.title]), plot, sourceLine(c));
      lineChart(plot, c.series, { width: drawWidth(fig), height: 190, zero: c.zero !== false, unit: c.unit, label: c.title });
    }
  };
  const buttons = ["vrai", "faux"].map((v) => el("button", { type: "button", class: "w-btn", onclick: () => pick(v) }, [v === "vrai" ? "Vrai" : "Faux"]));
  return el("div", { class: "w-root" }, [
    el("p", { class: "w-hint" }, ["Vrai ou faux ?"]),
    el("p", { class: "w-claim" }, [`« ${props.claim} »`]),
    el("div", { class: "w-controls" }, buttons),
    out,
  ]);
}

// ----------------------------------------------------------- classer

export function classer(props) {
  const items = props.items || [];
  if (items.length < 2) throw new Error("pas assez d'éléments");
  const sign = props.order === "asc" ? 1 : -1;
  const answer = items.slice().sort((a, b) => sign * (a.value - b.value));
  // Start from an order that is not already the answer (deterministic).
  let order = items.slice().sort((a, b) => a.label.localeCompare(b.label, "fr"));
  if (order.every((it, i) => it === answer[i])) order.reverse();
  let checked = false;
  const list = el("ol", { class: "w-rank" });
  const result = el("p", { class: "w-result", "aria-live": "polite" });
  const fmtV = (v) => `${fmtValue(v)}${props.unit ? " " + props.unit : ""}`;
  const render = () => {
    list.replaceChildren(
      ...order.map((it, i) => {
        const ok = checked && answer[i] === it;
        return el("li", { class: checked ? (ok ? "is-right" : "is-wrong") : "" }, [
          el("span", { class: "w-rank-n" }, [String(i + 1)]),
          el("span", { class: "w-rank-label" }, [it.label]),
          checked && el("span", { class: "w-rank-val" }, [fmtV(it.value)]),
          !checked && el("button", { type: "button", "aria-label": `Monter ${it.label}`, disabled: i === 0, onclick: () => move(i, -1) }, ["↑"]),
          !checked && el("button", { type: "button", "aria-label": `Descendre ${it.label}`, disabled: i === order.length - 1, onclick: () => move(i, 1) }, ["↓"]),
        ]);
      }),
    );
  };
  const move = (i, d) => {
    const j = i + d;
    [order[i], order[j]] = [order[j], order[i]];
    render();
    list.querySelectorAll("li")[j]?.querySelector(`button:nth-of-type(${d < 0 ? 1 : 2})`)?.focus();
  };
  const check = el("button", { type: "button", class: "w-btn" }, ["Vérifier"]);
  check.addEventListener("click", () => {
    if (checked) {
      checked = false;
      check.textContent = "Vérifier";
      result.textContent = "";
      render();
      return;
    }
    checked = true;
    const good = order.filter((it, i) => answer[i] === it).length;
    result.textContent =
      good === order.length
        ? "Parfait, tout est dans l'ordre."
        : `${good} sur ${order.length} à la bonne place. Le bon ordre : ${answer.map((a) => a.label).join(", ")}.`;
    check.textContent = "Réessayer";
    render();
  });
  render();
  return el("div", { class: "w-root" }, [
    el("p", { class: "w-claim" }, [props.prompt + (props.year ? ` (${props.year})` : "")]),
    el("p", { class: "w-hint" }, [props.order === "asc" ? "Du plus petit au plus grand." : "Du plus grand au plus petit.", " Utilise les flèches pour déplacer."]),
    list,
    el("div", { class: "w-controls" }, [check]),
    result,
    props.source && sourceLine(props.source ? { source: props.source } : {}),
  ]);
}

// ----------------------------------------------------------- prix / IPC

const FRANCS_PER_EURO = 6.55957;
export function toEuros(ipc, amount, unit, year, to) {
  const euros = unit === "EUR" ? amount : (unit === "AF" ? amount / 100 : amount) / FRANCS_PER_EURO;
  return (euros * ipc[String(to)]) / ipc[String(year)];
}
export const fmtEuros = (v) => (v >= 100 ? fmt(Math.round(v)) : fmt(v, 2)) + " €";
const UNIT_LABEL = { AF: "anciens francs", NF: "nouveaux francs", EUR: "euros" };

export function convertisseur(props) {
  const { ipc, first, last } = props;
  const amount = el("input", { type: "number", class: "w-input", value: props.amount, min: 0, step: "any", id: "conv-montant", "aria-label": "Montant" });
  const unit = el("select", { class: "w-input", "aria-label": "Monnaie" }, Object.entries(UNIT_LABEL).map(([k, v]) => el("option", { value: k, selected: k === props.unit }, [v])));
  const year = el("input", { type: "number", class: "w-input", value: props.year, min: first, max: last, "aria-label": "Année" });
  const out = el("div", { class: "w-conv-out", "aria-live": "polite" });
  const update = () => {
    const a = Number(amount.value), u = unit.value, y = Math.round(Number(year.value));
    let msg = "";
    if (!(y >= first && y <= last)) msg = `Choisis une année entre ${first} et ${last}.`;
    else if (u === "AF" && y >= 1960) msg = "Les anciens francs ont été remplacés le 1er janvier 1960 : choisis les nouveaux francs.";
    else if (u === "NF" && y > 2001) msg = "Le franc a disparu en 2002 : choisis l'euro.";
    else if (u === "EUR" && y < 1999) msg = "L'euro existe depuis 1999 : choisis le franc.";
    if (msg || !Number.isFinite(a)) return out.replaceChildren(el("p", { class: "w-hint" }, [msg || "Indique un montant."]));
    const v = toEuros(ipc, a, u, y, last);
    out.replaceChildren(
      el("div", { class: "w-conv-big" }, ["≈ ", fmtEuros(v)]),
      el("p", { class: "w-hint" }, [
        `en euros de ${last}, à pouvoir d'achat égal. Les prix ont été multipliés par ${fmt(ipc[last] / ipc[y], 1)} entre ${y} et ${last}`,
        u === "AF" ? " ; on divise aussi par 100 (nouveau franc, 1960) puis par 6,55957 (euro)." : u === "NF" ? " ; on divise aussi par 6,55957 (euro)." : ".",
      ]),
    );
  };
  [amount, unit, year].forEach((n) => n.addEventListener("input", update));
  update();
  return el("div", { class: "w-root" }, [
    el("div", { class: "w-controls" }, [el("label", {}, ["Montant ", amount]), el("label", {}, ["en ", unit]), el("label", {}, ["en ", year])]),
    out,
    el("p", { class: "w-source" }, [`Indices des prix à la consommation de l'Insee (${props.source}). Le convertisseur officiel de l'Insee donne des résultats très proches.`]),
  ]);
}

const SERIES_NAMES = ["Placé", "Placé, en euros constants", "Sous le matelas, en euros constants"];

export function interets(props, fig) {
  const { ipc, last } = props;
  const avgFrom = last - 30;
  const avgInfl = (Math.pow(ipc[last] / ipc[avgFrom], 1 / 30) - 1) * 100;
  const capital = el("input", { type: "number", class: "w-input", value: props.capital, min: 1, "aria-label": "Capital de départ en euros" });
  const rate = el("input", { type: "range", class: "w-range", min: 0, max: 10, step: 0.1, value: props.rate, "aria-label": "Taux d'intérêt annuel" });
  const infl = el("input", { type: "range", class: "w-range", min: 0, max: 10, step: 0.1, value: avgInfl.toFixed(1), "aria-label": "Inflation annuelle" });
  const years = el("input", { type: "range", class: "w-range", min: 5, max: 60, step: 1, value: props.years, "aria-label": "Durée en années" });
  const rl = el("b"), il = el("b"), yl = el("b");
  const plot = el("div", { class: "w-plot-wrap" });
  const out = el("table", { class: "w-table" });
  const draw = () => {
    const c = Number(capital.value) || 0, r = Number(rate.value) / 100, i = Number(infl.value) / 100, n = Number(years.value);
    rl.textContent = fmt(Number(rate.value), 1) + " %";
    il.textContent = fmt(Number(infl.value), 1) + " %";
    yl.textContent = n + " ans";
    const placed = [], real = [], cash = [];
    for (let t = 0; t <= n; t++) {
      placed.push([t, c * (1 + r) ** t]);
      real.push([t, (c * (1 + r) ** t) / (1 + i) ** t]);
      cash.push([t, c / (1 + i) ** t]);
    }
    lineChart(
      plot,
      [
        { name: SERIES_NAMES[0], points: placed },
        { name: SERIES_NAMES[1], points: real },
        { name: SERIES_NAMES[2], points: cash },
      ],
      { width: drawWidth(fig), height: 230, unit: "€ (année 0)", label: "Capital placé et sous le matelas" },
    );
    const realRate = ((1 + r) / (1 + i) - 1) * 100;
    out.replaceChildren(
      ...[
        [`Placé à ${fmt(r * 100, 1)} % pendant ${n} ans`, fmtEuros(placed.at(-1)[1])],
        ["Ce que ça vaut en pouvoir d'achat d'aujourd'hui", fmtEuros(real.at(-1)[1])],
        ["Les mêmes euros sous le matelas", fmtEuros(cash.at(-1)[1])],
        ["Taux réel (taux moins inflation, en composé)", `${fmt(realRate, 2)} % par an`],
      ].map(([a, b]) => el("tr", {}, [el("th", {}, [a]), el("td", {}, [b])])),
    );
  };
  [capital, rate, infl, years].forEach((n) => n.addEventListener("input", draw));
  const root = el("div", { class: "w-root" }, [
    el("div", { class: "w-controls" }, [el("label", {}, ["Capital ", capital, " €"])]),
    el("div", { class: "w-controls" }, [el("label", {}, ["Taux ", rate, " ", rl]), el("label", {}, ["Inflation ", infl, " ", il]), el("label", {}, ["Durée ", years, " ", yl])]),
    legend(SERIES_NAMES.map((name) => ({ name }))),
    plot,
    out,
    el("p", { class: "w-note" }, [
      `L'inflation de départ est la moyenne française de ${avgFrom} à ${last} (${fmt(avgInfl, 1)} % par an, indices Insee). À 2 % d'inflation, un billet perd environ la moitié de son pouvoir d'achat en 35 ans ; un placement ne fait gagner que ce qui dépasse l'inflation.`,
    ]),
  ]);
  root.onMount = draw;
  return root;
}

/** Inline `prix:` spans: a button with a small popover. */
export function wirePrix() {
  let open = null;
  const close = () => {
    if (!open) return;
    open.pop.remove();
    open.btn.setAttribute("aria-expanded", "false");
    open = null;
  };
  for (const span of document.querySelectorAll("span.prix[data-eur]")) {
    const btn = el("button", { type: "button", class: "prix", "aria-expanded": "false", title: span.title }, [span.textContent]);
    const unitWord = { AF: "anciens francs", NF: "francs", EUR: "euros" }[span.dataset.unit] || "";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const was = open && open.btn === btn;
      close();
      if (was) return;
      const pop = el("div", { class: "prix-pop", role: "dialog", "aria-label": "Valeur en euros d'aujourd'hui" }, [
        `${btn.textContent} (${unitWord} de ${span.dataset.year})`,
        el("strong", {}, ["≈ " + span.dataset.eur]),
        `en euros de ${span.dataset.to}, à pouvoir d'achat égal (indices des prix de l'Insee).`,
      ]);
      document.body.appendChild(pop);
      const r = btn.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8));
      pop.style.left = left + "px";
      pop.style.top = window.scrollY + r.bottom + 6 + "px";
      btn.setAttribute("aria-expanded", "true");
      open = { btn, pop };
    });
    span.replaceWith(btn);
  }
  document.addEventListener("click", (e) => {
    if (open && !open.pop.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
}

// ----------------------------------------------------------- ouverture

const FR_PIECES = { N: "C", B: "F", R: "T", Q: "D", K: "R" };
/** SAN in French notation (Cf3, Fb5, Dxd5, O-O stays O-O). */
export const sanFr = (s) => s.replace(/[NBRQK]/g, (c) => FR_PIECES[c]);

export function ouverture(props) {
  const bands = props.bands || [];
  const rows = bands.map((b) => {
    const [w, d, l] = props.stats[b] || [0, 0, 0];
    const n = w + d + l;
    const pct = (v) => (n ? (v / n) * 100 : 0);
    return el("div", { class: "w-bar-row" }, [
      el("span", {}, [b === "<1400" ? "moins de 1400" : b === "2200+" ? "2200 et plus" : b.replace("-", " à ")]),
      el("div", { class: "w-wdb", role: "img", "aria-label": `Blancs ${fmt(pct(w))} %, nulles ${fmt(pct(d))} %, Noirs ${fmt(pct(l))} %` }, [
        el("span", { class: "w-white", style: `width:${pct(w)}%` }),
        el("span", { class: "w-draw", style: `width:${pct(d)}%` }),
        el("span", { class: "w-black", style: `width:${pct(l)}%` }),
      ]),
      el("span", { class: "w-dim" }, [`${fmt(pct(w))} / ${fmt(pct(d))} / ${fmt(pct(l))} % · ${fmt(n)}`]),
    ]);
  });
  const total = (props.next || []).reduce((a, m) => a + m[1], 0);
  const plies = props.san ? props.san.split(" ") : [];
  const line = plies.map((m, i) => (i % 2 ? sanFr(m) : `${i / 2 + 1}.${sanFr(m)}`)).join(" ");
  return el("div", { class: "w-root" }, [
    el("p", { class: "w-chart-title" }, [props.title || (line ? `Après ${line}` : "Position de départ")]),
    el("p", { class: "w-chart-sub" }, ["Résultats sur Lichess selon la moyenne Elo des deux joueurs : Blancs / nulle / Noirs, et nombre de parties"]),
    el("div", { class: "w-ouv-rows" }, rows),
    total > 0 &&
      el("div", {}, [
        el("p", { class: "w-hint" }, ["Coups les plus joués ensuite :"]),
        el(
          "div",
          { class: "w-moves" },
          props.next.map(([m, c]) => el("span", {}, [el("b", {}, [sanFr(m)]), ` ${fmt((c / total) * 100)} %`])),
        ),
      ]),
    el("p", { class: "w-source" }, [
      "Source : ",
      el("a", { href: "https://database.lichess.org/", rel: "noopener", target: "_blank" }, ["base ouverte de Lichess"]),
      ` (CC0), ${props.source?.citation?.replace(/^Lichess open database \(CC0\), /, "") || ""}.`,
    ]),
  ]);
}

// ----------------------------------------------------------- fiche-langue

export function ficheLangue(props) {
  const kinds = { total: "Locuteurs", L1: "Langue maternelle", L2: "Langue seconde" };
  const order = { total: 0, L1: 1, L2: 2 };
  const rows = [
    props.iso && ["Code ISO 639-3", props.iso],
    ...[...(props.speakers || [])]
      .sort((a, b) => order[a.kind] - order[b.kind])
      .map((s) => [kinds[s.kind], `${fmtShort(s.count)}${s.year ? ` (${s.year})` : ""}`]),
    props.scripts?.length && ["Écriture", props.scripts.join(", ")],
    props.family?.length && ["Famille", props.family.join(" › ")],
  ].filter(Boolean);
  return el("div", { class: "w-root" }, [
    el("p", { class: "w-chart-title" }, [props.title ? props.title[0].toUpperCase() + props.title.slice(1) : ""]),
    el("table", { class: "w-table" }, rows.map(([a, b]) => el("tr", {}, [el("th", {}, [a]), el("td", {}, [b])]))),
    el("p", { class: "w-source" }, [
      "Source : ",
      el("a", { href: `https://www.wikidata.org/wiki/${props.qid}`, rel: "noopener", target: "_blank" }, ["Wikidata"]),
      " (CC0), lu à la construction du site. Les nombres de locuteurs varient beaucoup selon les sources et les années.",
    ]),
  ]);
}

export { esc, tooltip };
