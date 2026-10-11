// `widget:owid` — an Our World in Data chart in a note, drawn by the site.
// Types (prop `type`): courbe (default), devine (draw the rest of the curve,
// then compare), pyramide (age structure through the years), recit (the chart
// pinned while the note's steps scroll past it). Data comes in data-props,
// prepared at build by lib/widget-data.ts.
import { el, svg, fmt, esc, seriesVar, drawWidth, download, tooltip, reducedMotion } from "../widget-kit.js";
import { lineChart, tableRows, fmtValue, nearest, legend } from "./chart.js";

/** Graphe / Tableau / Sources tabs around a drawing function. */
function tabbed(props, drawChart, extraTools) {
  const chartPane = el("div", { class: "w-plot-wrap" });
  const tablePane = el("div", { class: "w-scroll", hidden: true });
  const srcPane = el("div", { hidden: true });
  const tabs = [
    ["Graphe", chartPane],
    ["Tableau", tablePane],
    ["Sources", srcPane],
  ];
  const bar = el("div", { class: "w-tabs", role: "tablist" });
  const buttons = tabs.map(([label, pane], i) =>
    el(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": i === 0 ? "true" : "false",
        onclick: () => {
          buttons.forEach((b, k) => b.setAttribute("aria-selected", k === i ? "true" : "false"));
          tabs.forEach(([, p], k) => (p.hidden = k !== i));
          if (i === 0) drawChart();
        },
      },
      [label],
    ),
  );
  buttons.forEach((b) => bar.appendChild(b));
  if (extraTools) {
    bar.appendChild(el("span", { class: "w-tab-spacer" }));
    bar.appendChild(extraTools);
  }
  return { bar, chartPane, tablePane, srcPane };
}

function sourceBlock(props, onCsv, onSvg) {
  const s = props.source || {};
  return [
    el("p", { class: "w-note" }, [
      "Données : ",
      s.citation || "Our World in Data",
      ", via ",
      el("a", { href: s.url || "https://ourworldindata.org/", rel: "noopener", target: "_blank" }, ["Our World in Data"]),
      ". Licence " + (s.licence || "CC BY 4.0") + ". Chiffres lus au moment de la construction du site.",
    ]),
    el("div", { class: "w-controls" }, [
      onCsv && el("button", { type: "button", class: "w-btn", onclick: onCsv }, ["Télécharger le CSV"]),
      onSvg && el("button", { type: "button", class: "w-btn", onclick: onSvg }, ["Télécharger l'image (SVG)"]),
    ]),
  ];
}

function sourceLine(props) {
  const s = props.source || {};
  return el("p", { class: "w-source" }, [
    "Source : ",
    el("a", { href: s.url || "https://ourworldindata.org/", rel: "noopener", target: "_blank" }, ["Our World in Data"]),
    s.citation ? `, d'après ${s.citation}` : "",
    " · " + (s.licence || "CC BY 4.0"),
  ]);
}

function header(props) {
  return [
    props.title && el("p", { class: "w-chart-title" }, [props.title]),
    (props.subtitle || props.unit) && el("p", { class: "w-chart-sub" }, [props.subtitle || props.unit]),
  ];
}

function csvOf(series, unit) {
  const head = ["annee", ...series.map((s) => `"${s.name.replace(/"/g, '""')}${unit ? ` (${unit})` : ""}"`)];
  return [head.join(","), ...tableRows(series).map((r) => r.map((v) => (v == null ? "" : v)).join(","))].join("\n");
}

function serializeSvg(node) {
  // Resolve var(--token) colours so the file stands alone outside the site.
  const clone = node.cloneNode(true);
  const cs = getComputedStyle(document.documentElement);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelectorAll("*").forEach((n) => {
    for (const k of ["fill", "stroke"]) {
      const v = n.style.getPropertyValue(k);
      const m = /^var\((--[\w-]+)\)$/.exec(v);
      if (m) n.style.setProperty(k, cs.getPropertyValue(m[1]).trim());
    }
    if (n.tagName === "text") {
      n.setAttribute("font-family", "sans-serif");
      n.setAttribute("fill", cs.getPropertyValue("--muted").trim());
    }
  });
  return new XMLSerializer().serializeToString(clone);
}

function fileName(props) {
  return (props.title || "graphique").toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

// ------------------------------------------------------------- courbe

function courbe(props, fig) {
  const series = props.series || [];
  if (!series.length) throw new Error("pas de série");
  let log = !!props.log;
  const logBtn = el("button", {
    type: "button",
    class: "w-btn" + (log ? " is-active" : ""),
    "aria-pressed": String(log),
    title: "Échelle logarithmique : chaque graduation multiplie par 10",
    onclick: () => {
      log = !log;
      logBtn.classList.toggle("is-active", log);
      logBtn.setAttribute("aria-pressed", String(log));
      draw();
    },
  }, ["Échelle log"]);
  const canLog = series.every((s) => s.points.every((p) => p[1] > 0));
  const t = tabbed(props, () => draw(), canLog ? logBtn : null);
  let chart;
  const draw = () => {
    chart = lineChart(t.chartPane, series, {
      width: drawWidth(fig),
      log,
      zero: props.zero !== false,
      unit: props.unit,
      label: props.title,
    });
  };
  const rows = tableRows(series);
  t.tablePane.appendChild(
    el("table", { class: "w-table w-num" }, [
      el("thead", {}, [el("tr", {}, [el("th", {}, ["Année"]), ...series.map((s) => el("th", {}, [s.name]))])]),
      el(
        "tbody",
        {},
        rows
          .slice()
          .reverse()
          .map((r) => el("tr", {}, [el("th", {}, [String(r[0])]), ...r.slice(1).map((v) => el("td", {}, [v == null ? "–" : fmtValue(v)]))])),
      ),
    ]),
  );
  t.srcPane.append(
    ...sourceBlock(
      props,
      () => download(fileName(props) + ".csv", csvOf(series, props.unit), "text/csv"),
      () => {
        draw();
        download(fileName(props) + ".svg", serializeSvg(chart.svg), "image/svg+xml");
      },
    ),
  );
  const root = el("div", { class: "w-root" }, [...header(props), t.bar, legend(series), t.chartPane, t.tablePane, t.srcPane, sourceLine(props)]);
  root.onMount = draw;
  redrawOnResize(root, fig, draw);
  return root;
}

/** Redraws when the column width changes (rotation, side panel). */
function redrawOnResize(root, fig, draw) {
  let w = 0;
  const ro = new ResizeObserver(() => {
    const now = fig.clientWidth;
    if (Math.abs(now - w) > 24) {
      w = now;
      draw();
    }
  });
  const prev = root.onMount;
  root.onMount = () => {
    prev && prev();
    w = fig.clientWidth;
    ro.observe(fig);
  };
}

// ------------------------------------------------------------- devine

function devine(props, fig) {
  const series = props.series || [];
  if (!series.length) throw new Error("pas de série");
  const main = series[0];
  const reveal = props.reveal;
  const start = nearest(main.points.filter((p) => p[0] <= reveal), reveal);
  const lastYear = main.points.at(-1)[0];
  const plot = el("div", { class: "w-plot-wrap" });
  const btn = el("button", { type: "button", class: "w-btn", disabled: true }, ["Voir la vraie courbe"]);
  const reset = el("button", { type: "button", class: "w-btn" }, ["Recommencer"]);
  const result = el("p", { class: "w-result", "aria-live": "polite" });
  let guess = new Map();
  let done = false;
  let chart;

  function draw() {
    chart = lineChart(plot, series, {
      width: drawWidth(fig),
      zero: props.zero !== false,
      unit: props.unit,
      label: props.title,
      hideAfter: done ? null : reveal,
      hover: done,
    });
    const { x, y, m, H, svg: root } = chart;
    if (!done) {
      root.insertBefore(
        svg("rect", { class: "w-guess-zone", x: x(reveal), y: m.t, width: x(lastYear) - x(reveal), height: H - m.t - m.b }),
        root.children[1],
      );
      const hint = svg("text", { class: "w-label", x: (x(reveal) + x(lastYear)) / 2, y: (m.t + H - m.b) / 2, "text-anchor": "middle" });
      hint.textContent = guess.size ? "" : "dessine la suite ici";
      root.appendChild(hint);
    }
    const g = svg("path", { fill: "none", stroke: "var(--ink)", "stroke-width": 2, "stroke-dasharray": "5 4" });
    root.appendChild(g);
    const paint = () => {
      const pts = [[start[0], start[1]], ...[...guess].sort((a, b) => a[0] - b[0])];
      g.setAttribute("d", pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(""));
    };
    paint();
    if (done) {
      const lab = svg("text", { class: "w-label", x: x(lastYear) - 4, y: y(guess.get(lastYear) ?? start[1]) - 8, "text-anchor": "end" });
      lab.textContent = "toi";
      root.appendChild(lab);
      return;
    }
    // Drawing: a pointer drag sets the value of every year it passes over,
    // filling the years skipped between two pointer events.
    const hit = svg("rect", { x: x(reveal), y: 0, width: x(lastYear) - x(reveal) + 8, height: H, fill: "transparent", style: "cursor:crosshair;touch-action:none" });
    root.appendChild(hit);
    let down = false;
    let prev = null;
    const put = (ev) => {
      const r = root.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * chart.W;
      const py = ((ev.clientY - r.top) / r.height) * chart.H;
      const yr = Math.max(reveal + 1, Math.min(lastYear, Math.round(chart.x0 + ((px - m.l) / (chart.W - m.l - m.r)) * (chart.x1 - chart.x0))));
      const v = invertY(chart, py);
      const from = prev ?? [reveal, guess.get(reveal) ?? start[1]];
      const a = Math.min(from[0], yr), b = Math.max(from[0], yr);
      for (let k = a; k <= b; k++) {
        if (k <= reveal) continue;
        const f = b === a ? 1 : (k - from[0]) / (yr - from[0]);
        guess.set(k, from[1] + (v - from[1]) * (yr === from[0] ? 1 : f));
      }
      prev = [yr, v];
      paint();
      root.querySelectorAll("text.w-label").forEach((t) => (t.textContent = ""));
      btn.disabled = guess.size < (lastYear - reveal) * 0.6;
    };
    hit.addEventListener("pointerdown", (ev) => {
      down = true;
      prev = null;
      hit.setPointerCapture(ev.pointerId);
      put(ev);
    });
    hit.addEventListener("pointermove", (ev) => down && put(ev));
    hit.addEventListener("pointerup", () => (down = false));
    hit.addEventListener("pointercancel", () => (down = false));
  }

  btn.addEventListener("click", () => {
    done = true;
    btn.disabled = true;
    draw();
    const real = main.points.filter((p) => p[0] > reveal);
    let err = 0, n = 0;
    for (const p of real) {
      const g = guess.get(p[0]);
      if (g != null) {
        err += Math.abs(g - p[1]);
        n++;
      }
    }
    const mean = n ? err / n : 0;
    const last = real.at(-1);
    const g = guess.get(last[0]);
    const unit = props.unit ? ` ${props.unit}` : "";
    result.replaceChildren(
      "Écart moyen : ",
      el("b", {}, [fmtValue(mean) + unit]),
      `. Pour ${last[0]}, tu avais mis ${g == null ? "–" : fmtValue(g)}${unit} ; la réalité est ${fmtValue(last[1])}${unit}.`,
    );
    if (!reducedMotion()) {
      const path = chart.svg.querySelector("path[stroke]");
      if (path && path.getTotalLength) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        path.getBoundingClientRect();
        path.style.transition = "stroke-dashoffset 0.9s ease-out";
        path.style.strokeDashoffset = "0";
      }
    }
  });
  reset.addEventListener("click", () => {
    guess = new Map();
    done = false;
    btn.disabled = true;
    result.textContent = "";
    draw();
  });

  const root = el("div", { class: "w-root" }, [
    ...header(props),
    el("p", { class: "w-hint" }, [`La courbe s'arrête en ${start[0]}. Dessine la suite jusqu'en ${lastYear} au doigt ou à la souris, puis compare.`]),
    plot,
    el("div", { class: "w-controls" }, [btn, reset]),
    result,
    sourceLine(props),
  ]);
  root.onMount = draw;
  return root;
}

function invertY(chart, py) {
  // Linear search on the chart's y() (works for linear and log scales).
  let lo = -1e12, hi = 1e12;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (chart.y(mid) > py) lo = mid;
    else hi = mid;
  }
  return Math.max(0, (lo + hi) / 2);
}

// ------------------------------------------------------------- pyramide

function pyramide(props, fig) {
  const years = Object.keys(props.years || {}).map(Number).sort((a, b) => a - b);
  if (!years.length) throw new Error("pas d'années");
  const ages = props.ages;
  const ref = props.compare && props.years[props.compare] ? props.compare : years[0];
  const max = Math.max(...years.flatMap((y) => props.years[y]));
  let year = years.at(-1);
  const plot = el("div", { class: "w-plot-wrap" });
  const slider = el("input", { type: "range", class: "w-range", min: years[0], max: years.at(-1), step: 1, value: year, "aria-label": "Année" });
  const yl = el("b", { class: "w-pyr-year" }, [String(year)]);
  const play = el("button", { type: "button", class: "w-btn" }, ["Lecture"]);
  let timer = null;
  let tip;

  function draw() {
    plot.replaceChildren();
    tip = tooltip(plot);
    const W = drawWidth(fig);
    const rowH = W < 480 ? 12 : 14;
    const m = { t: 4, r: 12, b: 22, l: 52 };
    const H = m.t + ages.length * rowH + m.b;
    const x = (v) => m.l + (v / max) * (W - m.l - m.r);
    const yRow = (i) => m.t + (ages.length - 1 - i) * rowH;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${props.country} : population par âge en ${year}` });
    const ax = svg("g", { class: "w-axis" });
    const ticks = niceStepTicks(max);
    for (const t of ticks) {
      ax.appendChild(svg("line", { class: "w-gridline", x1: x(t), x2: x(t), y1: m.t, y2: H - m.b }));
      const tx = svg("text", { x: x(t), y: H - 6, "text-anchor": "middle" });
      tx.textContent = fmtValueK(t);
      ax.appendChild(tx);
    }
    ages.forEach((a, i) => {
      if (i % 2 && i !== ages.length - 1) return;
      const tx = svg("text", { x: m.l - 6, y: yRow(i) + rowH / 2 + 4, "text-anchor": "end" });
      tx.textContent = a.endsWith("+") ? a : `${a.split("–")[0]} ans`;
      ax.appendChild(tx);
    });
    root.appendChild(ax);
    const vals = props.years[year];
    vals.forEach((v, i) => {
      root.appendChild(svg("rect", { x: x(0), y: yRow(i) + 1, width: Math.max(0, x(v) - x(0)), height: rowH - 2, fill: seriesVar(0), rx: 1 }));
    });
    // Reference year as a stepped outline.
    let d = "";
    props.years[ref].forEach((v, i) => {
      d += `${i ? "L" : "M"}${x(v).toFixed(1)},${(yRow(i) + rowH).toFixed(1)}L${x(v).toFixed(1)},${yRow(i).toFixed(1)}`;
    });
    root.appendChild(svg("path", { d, fill: "none", stroke: "var(--ink-soft)", "stroke-width": 1.4, "stroke-dasharray": "3 3" }));
    const hit = svg("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: ages.length * rowH, fill: "transparent" });
    hit.addEventListener("pointermove", (ev) => {
      const r = root.getBoundingClientRect();
      const py = ((ev.clientY - r.top) / r.height) * H;
      const i = ages.length - 1 - Math.floor((py - m.t) / rowH);
      if (i < 0 || i >= ages.length) return tip.hide();
      const a = ages[i];
      const lo = parseInt(a, 10);
      const born = a.endsWith("+") ? `avant ${year - lo}` : `vers ${year - lo - 4}–${year - lo}`;
      tip.show(
        `<b>${esc(a.endsWith("+") ? `${lo} ans et plus` : `${a} ans`)}</b> en ${year}<div>${fmt(vals[i])} personnes</div><div class="w-dim">nées ${born}</div><div class="w-dim">en ${ref} : ${fmt(props.years[ref][i])}</div>`,
        ev.clientX,
        ev.clientY,
      );
    });
    hit.addEventListener("pointerleave", () => tip.hide());
    root.appendChild(hit);
    plot.appendChild(root);
  }
  const set = (y) => {
    year = y;
    slider.value = y;
    yl.textContent = y;
    draw();
  };
  slider.addEventListener("input", () => set(Number(slider.value)));
  play.addEventListener("click", () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      play.textContent = "Lecture";
      return;
    }
    if (year >= years.at(-1)) set(years[0]);
    play.textContent = "Pause";
    timer = setInterval(() => {
      const i = years.indexOf(year);
      if (i < 0 || i >= years.length - 1) {
        clearInterval(timer);
        timer = null;
        play.textContent = "Lecture";
        return;
      }
      set(years[i + 1]);
    }, reducedMotion() ? 400 : 140);
  });
  const root = el("div", { class: "w-root" }, [
    ...header(props),
    el("div", { class: "w-controls" }, [play, slider, yl]),
    plot,
    el("p", { class: "w-note" }, [
      `Barres : ${props.country} l'année choisie. Contour pointillé : ${ref}. Une tranche d'âge creuse ou pleine remonte la pyramide d'un cran tous les cinq ans : c'est la même génération qui vieillit.`,
    ]),
    sourceLine(props),
  ]);
  root.onMount = draw;
  return root;
}

function niceStepTicks(max) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  const out = [];
  for (let t = 0; t <= max; t += step) out.push(t);
  return out;
}
const fmtValueK = (v) => (v >= 1e6 ? fmt(v / 1e6, v % 1e6 ? 1 : 0) + " M" : v >= 1e3 ? fmt(v / 1e3, 0) + " k" : fmt(v));

// ------------------------------------------------------------- recit

function recit(props, fig) {
  const series = props.series || [];
  const steps = props.steps || [];
  if (!series.length || !steps.length) throw new Error("récit vide");
  const chartBox = el("div", { class: "w-recit-chart" });
  const plot = el("div", { class: "w-plot-wrap" });
  chartBox.append(...header(props), legend(series), plot, sourceLine(props));
  let current = 0;
  const all = series.flatMap((s) => s.points.map((p) => p[0]));
  const full = [Math.min(...all), Math.max(...all)];
  const draw = () => {
    const s = steps[current];
    const dom = s && s.from && s.to && s.to > s.from ? [s.from, s.to] : full;
    lineChart(plot, series, {
      width: drawWidth(chartBox),
      zero: props.zero !== false,
      unit: props.unit,
      xDomain: dom,
      highlight: s && s.focus ? s.focus : null,
      label: props.title,
    });
  };
  const items = steps.map((s, i) =>
    el("div", { class: "w-recit-step" + (i === 0 ? " is-current" : ""), "data-i": i }, [
      el("b", {}, [s.from === s.to || !s.to ? String(s.from) : `${s.from} – ${s.to}`, s.focus ? ` · ${s.focus}` : ""]),
      s.text,
    ]),
  );
  const list = el("div", { class: "w-recit-steps" }, items);
  const root = el("div", { class: "w-root w-recit" }, [chartBox, list]);
  root.onMount = () => {
    draw();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number(e.target.getAttribute("data-i"));
          if (i === current) continue;
          current = i;
          items.forEach((n, k) => n.classList.toggle("is-current", k === i));
          draw();
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.forEach((n) => io.observe(n));
  };
  return root;
}

export function owid(props, fig) {
  if (props.type === "devine") return devine(props, fig);
  if (props.type === "pyramide") return pyramide(props, fig);
  if (props.type === "recit") return recit(props, fig);
  return courbe(props, fig);
}

export { courbe as owidCourbe, sourceLine, header };
