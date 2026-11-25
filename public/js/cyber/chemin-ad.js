// Widget "chemin-ad": a small domain seen the way BloodHound sees it. The
// shortest path from the compromised account to the goal is drawn in red,
// with the abuse behind each hop; unticking a relation (the defender's fix)
// makes the path fall back to the next one, or vanish. Model: lib/cyber.ts.
//   depart: j.martin
//   arrivee: corp.local
//   noeuds: Helpdesk=G, WS042=C          (optional; guessed otherwise)
//   e1: j.martin -MemberOf-> Helpdesk | What the hop gives the attacker.
import { el, svg, drawWidth } from "../widget-kit.js";
import { adLayout, adPath, parseAd } from "../../../lib/cyber.ts";
import { uid } from "../sci/common.js";

const GLYPH = { U: "U", G: "G", C: "PC", D: "DOM" };
const KIND = { U: "utilisateur", G: "groupe", C: "machine", D: "domaine" };

export function cheminAd(props, fig, ctx) {
  const { edges, kinds, start, goal } = parseAd(props);
  if (!edges.length) return null;
  const off = new Set();
  const pos = adLayout(edges, start, goal);
  const cols = new Set(Object.values(pos).map((p) => p[0])).size - 1 || 1;
  const id = uid("cy-ad");
  const plot = el("div", { class: "cy-scroll" });
  const verdict = el("p", { class: "w-note", "aria-live": "polite" });
  const steps = el("ol", { class: "cy-steps" });
  const list = el("ul", { class: "cy-ad-edges" });

  function draw() {
    const path = adPath(edges, start, goal, off) || [];
    const on = new Set(path);
    const W = Math.max(560, drawWidth(plot.isConnected ? plot : fig, 700, 300));
    const H = 360;
    const R = 20;
    const P = (n) => [46 + pos[n][0] * (W - 92), 30 + pos[n][1] * (H - 70)];
    const root = svg("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: "img",
      "aria-label": `Graphe Active Directory, de ${start} à ${goal}`,
    });
    root.appendChild(
      svg("defs", {}, [
        svg(
          "marker",
          {
            id: id + "-a",
            viewBox: "0 0 10 10",
            refX: 9,
            refY: 5,
            markerWidth: 6,
            markerHeight: 6,
            orient: "auto",
          },
          [svg("path", { d: "M0,0L10,5L0,10z", fill: "var(--rule-strong)" })],
        ),
        svg(
          "marker",
          {
            id: id + "-r",
            viewBox: "0 0 10 10",
            refX: 9,
            refY: 5,
            markerWidth: 6,
            markerHeight: 6,
            orient: "auto",
          },
          [svg("path", { d: "M0,0L10,5L0,10z", fill: "var(--danger)" })],
        ),
      ]),
    );
    edges.forEach((e, i) => {
      if (off.has(i)) return;
      const [x1, y1] = P(e.from);
      const [x2, y2] = P(e.to);
      const hot = on.has(i);
      // An edge that skips a column would run through the nodes between:
      // bow it, alternately above and below, and label it at its apex.
      const span = Math.abs(pos[e.to][0] - pos[e.from][0]) * cols;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const bend =
        span > 1.5
          ? (i % 2 ? 1 : -1) * Math.min(140, Math.max(110, len * 0.3))
          : 0;
      const cx = (x1 + x2) / 2 + (-(y2 - y1) / len) * bend;
      const cyy = (y1 + y2) / 2 + ((x2 - x1) / len) * bend;
      const unit = (ax, ay, bx, by) => {
        const l = Math.hypot(bx - ax, by - ay) || 1;
        return [(bx - ax) / l, (by - ay) / l];
      };
      const [sx, sy] = unit(x1, y1, cx, cyy);
      const [tx, ty] = unit(cx, cyy, x2, y2);
      const a = [x1 + sx * R, y1 + sy * R];
      const b = [x2 - tx * (R + 3), y2 - ty * (R + 3)];
      root.appendChild(
        svg("path", {
          d: `M${a[0]},${a[1]} Q${cx},${cyy} ${b[0]},${b[1]}`,
          fill: "none",
          class: "cy-ad-e" + (hot ? " is-path" : ""),
          "marker-end": `url(#${id}-${hot ? "r" : "a"})`,
        }),
      );
      root.appendChild(
        svg(
          "text",
          {
            x: (x1 + 2 * cx + x2) / 4,
            y: (y1 + 2 * cyy + y2) / 4 - 5,
            "text-anchor": "middle",
            class: "cy-ad-el" + (hot ? " is-path" : ""),
          },
          [e.type],
        ),
      );
    });
    for (const n of Object.keys(pos)) {
      const [x, y] = P(n);
      const k = kinds[n] || "U";
      if (n === start)
        root.appendChild(
          svg("circle", { cx: x, cy: y, r: R + 5, class: "cy-ad-owned" }),
        );
      root.appendChild(
        svg("circle", { cx: x, cy: y, r: R, class: "cy-ad-n is-" + k }, [
          svg("title", {}, [`${n} (${KIND[k]})`]),
        ]),
      );
      root.appendChild(
        svg(
          "text",
          { x, y: y + 5, "text-anchor": "middle", class: "cy-ad-g" },
          [GLYPH[k]],
        ),
      );
      root.appendChild(
        svg(
          "text",
          { x, y: y + R + 15, "text-anchor": "middle", class: "cy-ad-nl" },
          [n],
        ),
      );
      if (n === start)
        root.appendChild(
          svg(
            "text",
            { x, y: y + R + 28, "text-anchor": "middle", class: "cy-ad-tag" },
            ["compromis"],
          ),
        );
    }
    plot.replaceChildren(root);
    const v = (cls, t) => el("span", { class: "cy-verdict " + cls }, [t]);
    verdict.replaceChildren(
      ...(path.length
        ? [v("is-flaw", `${path.length} sauts`), ` de ${start} à ${goal}.`]
        : [
            v("is-ok", "Plus de chemin"),
            ` ${start} n'atteint plus ${goal} avec ces relations.`,
          ]),
    );
    steps.replaceChildren(
      ...path.map((i) =>
        el("li", {}, [
          el("b", {}, [`${edges[i].from} → ${edges[i].to} : `]),
          edges[i].note || edges[i].type,
        ]),
      ),
    );
    list.replaceChildren(
      ...edges.map((e, i) => {
        const box = el("input", { type: "checkbox", checked: !off.has(i) });
        box.addEventListener("change", () => {
          if (box.checked) off.delete(i);
          else off.add(i);
          draw();
        });
        return el("li", {}, [
          el(
            "label",
            {
              class:
                (on.has(i) ? "is-path " : "") + (off.has(i) ? "is-off" : ""),
            },
            [box, ` ${e.from} `, el("code", {}, [e.type]), ` ${e.to}`],
          ),
        ]);
      }),
    );
    ctx?.report({
      sauts: path.length,
      chemin: path.length ? 1 : 0,
      coupees: off.size,
    });
  }

  draw();
  const root = el("div", { class: "w-root cy-ad" }, [
    plot,
    verdict,
    steps,
    el("p", { class: "w-hint" }, [
      "Relations du domaine (décochez pour corriger) :",
    ]),
    list,
  ]);
  if (typeof ResizeObserver === "function") {
    let w = 0;
    root.onMount = () =>
      new ResizeObserver(() => {
        const nw = drawWidth(plot, 700, 300);
        if (nw !== w) {
          w = nw;
          draw();
        }
      }).observe(plot);
  }
  return root;
}
