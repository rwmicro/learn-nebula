// Widget "puissances-mod": the powers of g modulo n walked around a clock.
// g, g², g³… land on the clock's marks until they come back to 1; the loop's
// length is the order of g. When the loop visits every invertible mark, g is
// a generator, and going back from a mark to its exponent is the discrete
// logarithm: easy to read here, hopeless when the clock has 2^256 marks.
// Model: lib/calcul.ts (powers, order, phi, discreteLog).
import { el, svg, drawWidth } from "../widget-kit.js";
import { num, slider, table } from "../sci/common.js";
import { discreteLog, gcd, order, phi, powers } from "../../../lib/calcul.ts";

export function puissancesMod(props, fig, ctx) {
  let n = Math.round(num(props.n, 11, 3, 41));
  let g = Math.round(num(props.g, 2, 2, n - 1));
  let y = Math.round(num(props.cherche, 0, 0, n - 1));
  let shown = Infinity; // how many steps are drawn (pas à pas)

  const sN = slider({ label: "Modulo n", min: 3, max: 41, step: 1, value: n, onInput: (v) => {
    n = v;
    if (g >= n) (g = n - 1), sG.set(g);
    sG.input.max = String(n - 1);
    if (y >= n) y = 0;
    yIn.max = String(n - 1);
    shown = Infinity;
    draw();
  } });
  const sG = slider({ label: "Base g", min: 2, max: n - 1, step: 1, value: g, onInput: (v) => ((g = v), (shown = Infinity), draw()) });
  const yIn = el("input", { type: "number", class: "w-input ca-num", min: "0", max: String(n - 1), value: y ? String(y) : "", placeholder: "y", "aria-label": "valeur cherchée" });
  yIn.addEventListener("input", () => ((y = Math.round(num(yIn.value, 0, 0, n - 1))), draw()));
  const stepBtn = el("button", { type: "button", class: "w-btn", onclick: () => {
    const len = powers(g, n).length;
    shown = shown >= len ? 1 : shown + 1;
    draw();
  } }, ["Pas à pas"]);
  const allBtn = el("button", { type: "button", class: "w-btn", onclick: () => ((shown = Infinity), draw()) }, ["Tout montrer"]);
  const plot = el("div", { class: "w-plot-wrap ca-clock" });
  const seq = el("div", { class: "ca-seq" });
  const out = el("div", { class: "w-out" });
  const dlog = el("p", { class: "ca-dlog" });

  function draw() {
    const pw = powers(g, n);
    const ord = order(g, n);
    const f = phi(n);
    const gen = ord > 0 && ord === f;
    const k = Math.min(shown, pw.length);
    const S = Math.min(340, drawWidth(fig, 340, 260));
    const c = S / 2;
    const R = S * 0.39;
    const pos = (v) => {
      const a = -Math.PI / 2 + (2 * Math.PI * v) / n;
      return [c + R * Math.cos(a), c + R * Math.sin(a)];
    };
    const s = svg("svg", { viewBox: `0 0 ${S} ${S}`, width: S, height: S, role: "img", "aria-label": `puissances de ${g} modulo ${n}` });
    s.appendChild(svg("circle", { cx: c, cy: c, r: R, class: "ca-ring" }));
    const visited = new Set(pw.slice(0, k));
    // Path g^0 = 1 → g → g² …
    let prev = 1;
    for (let i = 0; i < k; i++) {
      const [x1, y1] = pos(prev);
      const [x2, y2] = pos(pw[i]);
      const mx = (x1 + x2) / 2 + (c - (x1 + x2) / 2) * 0.25;
      const my = (y1 + y2) / 2 + (c - (y1 + y2) / 2) * 0.25;
      s.appendChild(svg("path", { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`, class: "ca-hop" + (i === k - 1 ? " is-last" : "") }));
      prev = pw[i];
    }
    for (let v = 0; v < n; v++) {
      const [x, yy] = pos(v);
      const inv = gcd(v, n) === 1;
      const cls = "ca-mark" + (visited.has(v) ? " is-on" : "") + (!inv ? " is-off" : "") + (y && v === y ? " is-target" : "") + (v === 1 ? " is-one" : "");
      s.appendChild(svg("circle", { cx: x, cy: yy, r: n > 29 ? 7 : 9.5, class: cls }));
      s.appendChild(svg("text", { x, y: yy + 3.5, "text-anchor": "middle", class: "ca-mark-t" + (visited.has(v) ? " is-on" : "") }, [String(v)]));
    }
    plot.replaceChildren(s);

    seq.replaceChildren(
      el("div", { class: "ca-seq-row" }, [
        el("span", { class: "ca-seq-h" }, ["k"]),
        ...pw.map((_, i) => el("span", { class: i < k ? "" : "is-dim" }, [String(i + 1)])),
      ]),
      el("div", { class: "ca-seq-row" }, [
        el("span", { class: "ca-seq-h" }, [`${g}^k mod ${n}`]),
        ...pw.map((v, i) => el("span", { class: (i < k ? "is-val" : "is-dim") + (y && v === y ? " is-target" : "") }, [String(v)])),
      ]),
    );

    out.replaceChildren(
      table([
        ["Ordre de " + g, ord ? `${ord} (la boucle revient à 1 après ${ord} pas)` : `${g} n'est pas inversible modulo ${n} : pgcd = ${gcd(g, n)}`],
        ["φ(" + n + ")", `${f} nombres inversibles entre 1 et ${n - 1}`],
        ["Générateur ?", gen ? `oui : ${g} atteint les ${f} inversibles` : ord ? `non : ${ord} sur ${f} seulement (l'ordre divise toujours φ(n))` : "non"],
      ]),
    );

    let lg = -1;
    if (y) {
      lg = discreteLog(g, y, n);
      dlog.textContent = lg > 0
        ? `Logarithme discret : ${g}^${lg} ≡ ${y} (mod ${n}), trouvé en essayant ${lg} exposant${lg > 1 ? "s" : ""}. Avec un modulo de 2048 bits, il faudrait de l'ordre de 2^2048 essais à l'aveugle.`
        : `${y} n'est jamais atteint par les puissances de ${g} modulo ${n} : pas de logarithme.`;
    } else dlog.textContent = "Entrez une valeur y pour chercher k tel que g^k ≡ y : c'est le problème du logarithme discret.";

    ctx?.report({ n, g, ordre: ord, phi: f, generateur: gen ? 1 : 0, log: lg, cherche: y });
  }

  draw();
  return el("div", { class: "w-root ca-root ca-pm" }, [
    el("div", { class: "sci-sliders" }, [sN.node, sG.node]),
    el("div", { class: "w-controls" }, [stepBtn, allBtn, el("label", { class: "ca-inline" }, ["Chercher k tel que g^k ≡ ", yIn])]),
    el("div", { class: "ca-two" }, [plot, el("div", { class: "ca-side" }, [seq, dlog])]),
    out,
  ]);
}
