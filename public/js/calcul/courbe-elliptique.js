// Widget "courbe-elliptique": the group law of an elliptic curve, twice.
// Over the reals (mode: reels) it is geometry: the line through P and Q cuts
// the curve a third time, and the mirror image of that point is P + Q. Over a
// finite field F_p (mode: fini) the same formulas give a cloud of points; the
// multiples P, 2P, 3P… hop around it with no visible pattern, which is why
// finding k from kP (the elliptic discrete logarithm) is hard.
// Model: lib/calcul.ts (curvePoints, ecAdd, multiples, pointOrder, realAdd).
import { el, svg, drawWidth } from "../widget-kit.js";
import { num, slider, segmented, table } from "../sci/common.js";
import { curveOk, curvePoints, ecAdd, isPrime, multiples, pointOrder, realAdd, realY } from "../../../lib/calcul.ts";

const f2 = (v) => (Math.abs(v) < 1e-9 ? "0" : v.toFixed(2).replace(".", ",").replace("-", "−"));

export function courbeElliptique(props, fig, ctx) {
  let mode = props.mode === "reels" ? "reels" : "fini";
  // finite field
  let p = Math.round(num(props.p, 17, 5, 97));
  if (!isPrime(p)) p = 17;
  let a = Math.round(num(props.a, mode === "reels" ? -1 : 2, -10, 10));
  let b = Math.round(num(props.b, mode === "reels" ? 1 : 2, -10, 10));
  let k = Math.round(num(props.k, 1, 1, 200));
  let P = null;
  let Q = null;
  // reals
  let ra = num(props.a, -1, -3, 3);
  let rb = num(props.b, 1, -2, 3);
  let xP = -1;
  let xQ = 0.3;
  let sP = 1;
  let sQ = 1;

  const modeSeg = segmented("Corps", [["reels", "Nombres réels"], ["fini", "Corps fini F_p"]], mode, (v) => ((mode = v), build()));
  const host = el("div", {});

  function build() {
    host.replaceChildren(mode === "reels" ? buildReels() : buildFini());
  }

  // ----------------------------------------------------------------- reels
  function buildReels() {
    const sa = slider({ label: "a", min: -3, max: 3, step: 0.5, value: ra, format: f2, onInput: (v) => ((ra = v), drawR()) });
    const sb = slider({ label: "b", min: -2, max: 3, step: 0.5, value: rb, format: f2, onInput: (v) => ((rb = v), drawR()) });
    const sxp = slider({ label: "x de P", min: -2, max: 2.5, step: 0.05, value: xP, format: f2, onInput: (v) => ((xP = v), drawR()) });
    const sxq = slider({ label: "x de Q", min: -2, max: 2.5, step: 0.05, value: xQ, format: f2, onInput: (v) => ((xQ = v), drawR()) });
    const flipP = el("button", { type: "button", class: "w-btn", onclick: () => ((sP = -sP), drawR()) }, ["P en haut / en bas"]);
    const flipQ = el("button", { type: "button", class: "w-btn", onclick: () => ((sQ = -sQ), drawR()) }, ["Q en haut / en bas"]);
    const same = el("button", { type: "button", class: "w-btn", onclick: () => ((xQ = xP), (sQ = sP), sxq.set(xQ), drawR()) }, ["Q = P (doubler)"]);
    const plot = el("div", { class: "w-plot-wrap" });
    const out = el("div", { class: "w-out" });
    const msg = el("p", { class: "w-note" });

    function drawR() {
      const W = drawWidth(fig, 560, 300);
      const H = Math.round(W * 0.72);
      const xr = [-2.5, 3];
      const yr = [-4, 4];
      const X = (x) => ((x - xr[0]) / (xr[1] - xr[0])) * W;
      const Y = (y) => H - ((y - yr[0]) / (yr[1] - yr[0])) * H;
      const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "courbe elliptique sur les réels" });
      s.appendChild(svg("line", { x1: 0, y1: Y(0), x2: W, y2: Y(0), class: "ca-axis" }));
      s.appendChild(svg("line", { x1: X(0), y1: 0, x2: X(0), y2: H, class: "ca-axis" }));
      // curve, both branches, sampled finely
      for (const sign of [1, -1]) {
        let d = "";
        let pen = false;
        for (let i = 0; i <= 900; i++) {
          const x = xr[0] + ((xr[1] - xr[0]) * i) / 900;
          const yv = realY(x, ra, rb);
          if (yv == null) {
            pen = false;
            continue;
          }
          d += (pen ? "L" : "M") + X(x).toFixed(1) + "," + Y(sign * yv).toFixed(1);
          pen = true;
        }
        s.appendChild(svg("path", { d, class: "ca-curve" }));
      }
      const yp = realY(xP, ra, rb);
      const yq = realY(xQ, ra, rb);
      if (yp == null || yq == null) {
        msg.textContent = "La courbe n'existe pas à cet x : déplacez P ou Q vers la droite.";
        plot.replaceChildren(s);
        out.replaceChildren();
        ctx?.report({ mode: "reels" });
        return;
      }
      const Pp = { x: xP, y: sP * yp };
      const Qp = { x: xQ, y: sQ * yq };
      const r = realAdd(Pp, Qp, ra);
      if (!r) {
        s.appendChild(svg("line", { x1: X(xP), y1: 0, x2: X(xP), y2: H, class: "ca-line" }));
        msg.textContent = "Q est le symétrique de P : la droite est verticale et ne recoupe la courbe qu'« à l'infini ». P + Q = O, le point à l'infini, qui joue le rôle du zéro.";
      } else {
        const x0 = xr[0];
        const x1 = xr[1];
        const yAt = (x) => Pp.y + r.slope * (x - Pp.x);
        s.appendChild(svg("line", { x1: X(x0), y1: Y(yAt(x0)), x2: X(x1), y2: Y(yAt(x1)), class: "ca-line" }));
        s.appendChild(svg("line", { x1: X(r.third.x), y1: Y(r.third.y), x2: X(r.R.x), y2: Y(r.R.y), class: "ca-mirror" }));
        s.appendChild(svg("circle", { cx: X(r.third.x), cy: Y(r.third.y), r: 5, class: "ca-pt-third" }));
        s.appendChild(svg("circle", { cx: X(r.R.x), cy: Y(r.R.y), r: 7, class: "ca-pt-r" }));
        s.appendChild(svg("text", { x: X(r.R.x) + 9, y: Y(r.R.y) + 4, class: "ca-lbl" }, ["P + Q"]));
        msg.textContent = Math.abs(xP - xQ) < 1e-9
          ? "P = Q : la sécante devient la tangente en P. Elle recoupe la courbe en un point, dont le symétrique est 2P."
          : "La droite (PQ) recoupe la courbe en un troisième point (creux) ; son symétrique par rapport à l'axe horizontal est P + Q.";
      }
      s.appendChild(svg("circle", { cx: X(Pp.x), cy: Y(Pp.y), r: 6, class: "ca-pt-p" }));
      s.appendChild(svg("text", { x: X(Pp.x) - 16, y: Y(Pp.y) - 8, class: "ca-lbl" }, ["P"]));
      s.appendChild(svg("circle", { cx: X(Qp.x), cy: Y(Qp.y), r: 6, class: "ca-pt-q" }));
      s.appendChild(svg("text", { x: X(Qp.x) + 8, y: Y(Qp.y) - 8, class: "ca-lbl" }, ["Q"]));
      plot.replaceChildren(s);
      out.replaceChildren(
        table([
          ["Courbe", `y² = x³ ${ra < 0 ? "−" : "+"} ${f2(Math.abs(ra))}x ${rb < 0 ? "−" : "+"} ${f2(Math.abs(rb))}`],
          ["P", `(${f2(Pp.x)} ; ${f2(Pp.y)})`],
          ["Q", `(${f2(Qp.x)} ; ${f2(Qp.y)})`],
          ["P + Q", r ? `(${f2(r.R.x)} ; ${f2(r.R.y)}), pente λ = ${f2(r.slope)}` : "O (point à l'infini)"],
        ]),
      );
      ctx?.report({ mode: "reels", double: Math.abs(xP - xQ) < 1e-9 && sP === sQ ? 1 : 0, infini: r ? 0 : 1 });
    }
    drawR();
    return el("div", {}, [
      el("div", { class: "sci-sliders" }, [sa.node, sb.node, sxp.node, sxq.node]),
      el("div", { class: "w-controls" }, [flipP, flipQ, same]),
      plot,
      msg,
      out,
    ]);
  }

  // ------------------------------------------------------------------ fini
  function buildFini() {
    const pSel = el("select", { class: "w-input", "aria-label": "nombre premier p" },
      [5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97].map((v) => el("option", { value: String(v), selected: v === p }, [String(v)])));
    pSel.addEventListener("change", () => ((p = Number(pSel.value)), (P = Q = null), drawF()));
    const sa = slider({ label: "a", min: -10, max: 10, step: 1, value: a, onInput: (v) => ((a = v), (P = Q = null), drawF()) });
    const sb = slider({ label: "b", min: -10, max: 10, step: 1, value: b, onInput: (v) => ((b = v), (P = Q = null), drawF()) });
    const sk = slider({ label: "k (pour kP)", min: 1, max: 60, step: 1, value: k, onInput: (v) => ((k = v), drawF()) });
    const clear = el("button", { type: "button", class: "w-btn", onclick: () => ((P = Q = null), drawF()) }, ["Effacer P et Q"]);
    const plot = el("div", { class: "w-plot-wrap ca-ff" });
    const out = el("div", { class: "w-out" });
    const msg = el("p", { class: "w-note" });

    function drawF() {
      const A = ((a % p) + p) % p;
      const B = ((b % p) + p) % p;
      const pts = curvePoints(A, B, p);
      if (!P && pts.length) P = pts[Math.min(pts.length - 1, 1)];
      const W = Math.min(drawWidth(fig, 460, 280), 460);
      const pad = 22;
      const cell = (W - pad - 6) / p;
      const X = (x) => pad + (x + 0.5) * cell;
      const Y = (y) => W - pad - (y + 0.5) * cell;
      const s = svg("svg", { viewBox: `0 0 ${W} ${W}`, width: W, height: W, role: "img", "aria-label": `points de la courbe sur F_${p}` });
      s.appendChild(svg("rect", { x: pad, y: 6, width: W - pad - 6, height: W - pad - 6, class: "ca-ff-bg" }));
      for (const t of [0, Math.floor(p / 2), p - 1]) {
        s.appendChild(svg("text", { x: X(t), y: W - 6, "text-anchor": "middle", class: "ca-tick" }, [String(t)]));
        s.appendChild(svg("text", { x: pad - 4, y: Y(t) + 3, "text-anchor": "end", class: "ca-tick" }, [String(t)]));
      }
      // Line through P and Q, wrapped mod p: the lattice points it hits.
      let sum = null;
      if (P && Q) {
        const r = ecAdd(P, Q, A, p);
        sum = r.R;
        if (r.slope != null) {
          const c0 = (((P.y - r.slope * P.x) % p) + p) % p;
          for (let x = 0; x < p; x++) {
            const y = (r.slope * x + c0) % p;
            s.appendChild(svg("circle", { cx: X(x), cy: Y(y), r: Math.max(1.5, cell * 0.12), class: "ca-ff-line" }));
          }
        }
        msg.textContent = sum
          ? `${r.kind} : pente λ = ${r.slope} (calculée modulo ${p}). La « droite » se replie sur la grille ; elle passe par un troisième point dont le symétrique (y → ${p} − y) est P + Q.`
          : `${r.kind}.`;
      } else msg.textContent = "Touchez un point pour choisir Q (P est en bleu, Q sera en orange). Le curseur k trace P, 2P, 3P… : des sauts sans motif apparent.";
      // multiples path
      const mult = P ? multiples(P, k, A, p) : [];
      let d = "";
      mult.forEach((M, i) => {
        if (!M) return;
        d += (d && mult[i - 1] ? "L" : "M") + X(M.x).toFixed(1) + "," + Y(M.y).toFixed(1);
      });
      if (k > 1) s.appendChild(svg("path", { d, class: "ca-ff-path" }));
      for (const pt of pts) {
        const isP = P && pt.x === P.x && pt.y === P.y;
        const isQ = Q && pt.x === Q.x && pt.y === Q.y;
        const isR = sum && pt.x === sum.x && pt.y === sum.y;
        const kP = mult[k - 1];
        const isK = k > 1 && kP && pt.x === kP.x && pt.y === kP.y;
        const c = svg("circle", { cx: X(pt.x), cy: Y(pt.y), r: Math.max(3, cell * 0.32), class: "ca-ff-pt" + (isP ? " is-p" : "") + (isQ ? " is-q" : "") + (isR ? " is-r" : "") + (isK ? " is-k" : ""), tabindex: "0" });
        c.addEventListener("click", () => {
          Q = pt;
          drawF();
        });
        c.appendChild(svg("title", {}, [`(${pt.x}, ${pt.y})`]));
        s.appendChild(c);
      }
      plot.replaceChildren(s);
      const ord = P ? pointOrder(P, A, p) : 0;
      const kP = mult[k - 1];
      out.replaceChildren(
        table([
          ["Courbe", `y² = x³ + ${A}x + ${B} sur F_${p}${curveOk(A, B, p) ? "" : " (singulière : 4a³ + 27b² ≡ 0, pas une courbe elliptique)"}`],
          ["Nombre de points", `${pts.length + 1} (${pts.length} points + O). Théorème de Hasse : entre ${Math.ceil(p + 1 - 2 * Math.sqrt(p))} et ${Math.floor(p + 1 + 2 * Math.sqrt(p))}`],
          ["P", P ? `(${P.x}, ${P.y}), d'ordre ${ord} : ${ord}P = O` : "—"],
          ["Q", Q ? `(${Q.x}, ${Q.y})` : "touchez un point"],
          ["P + Q", P && Q ? (sum ? `(${sum.x}, ${sum.y})` : "O") : "—"],
          [`${k}P`, P ? (kP ? `(${kP.x}, ${kP.y})` : "O") : "—"],
        ]),
      );
      ctx?.report({ mode: "fini", p, a: A, b: B, points: pts.length + 1, ordre: ord, k, x: kP ? kP.x : -1, y: kP ? kP.y : -1, somme: P && Q ? 1 : 0 });
    }
    drawF();
    return el("div", {}, [
      el("div", { class: "w-controls" }, [el("label", { class: "ca-inline" }, ["p = ", pSel]), clear]),
      el("div", { class: "sci-sliders" }, [sa.node, sb.node, sk.node]),
      el("div", { class: "ca-two" }, [plot, el("div", { class: "ca-side" }, [msg])]),
      out,
    ]);
  }

  build();
  return el("div", { class: "w-root ca-root ca-ec" }, [el("div", { class: "w-controls" }, [modeSeg.node]), host]);
}
