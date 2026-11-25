// Widget "echange": a protocol exchange drawn as a sequence diagram the reader
// steps through, one message at a time, with the reason each message leaves
// under the drawing. The note writes the exchange (lib/cyber.ts parseEchange):
//   acteurs: Client | Résolveur | Racine
//   m1: Client -> Résolveur : www.example.com ? | Why it leaves.
//   m2: Racine --> Résolveur : voir .com        (--> a reply, dashed)
//   m3: !Attaquant -> Cible : AUTHENTICATE      (! an attacker's message)
import { el, svg, drawWidth } from "../widget-kit.js";
import { parseEchange } from "../../../lib/cyber.ts";
import { uid } from "../sci/common.js";

export function echange(props, fig, ctx) {
  const { actors, messages } = parseEchange(props);
  if (actors.length < 2 || !messages.length) return null;
  const start =
    Math.max(1, Math.min(messages.length, Number(props.depart) || 1)) - 1;
  let cur = start;
  let seen = cur;
  const id = uid("cy-ex");

  const plot = el("div", { class: "cy-ex-plot" });
  const note = el("p", { class: "w-note cy-ex-note", "aria-live": "polite" });
  const count = el("span", { class: "cy-step" });
  const prev = el(
    "button",
    { type: "button", class: "w-btn", onclick: () => go(cur - 1) },
    ["← Précédent"],
  );
  const next = el(
    "button",
    { type: "button", class: "w-btn sci-cta", onclick: () => go(cur + 1) },
    ["Suivant →"],
  );
  const all = el(
    "button",
    { type: "button", class: "w-btn", onclick: () => go(messages.length - 1) },
    ["Tout afficher"],
  );

  function go(k) {
    cur = Math.max(0, Math.min(messages.length - 1, k));
    seen = Math.max(seen, cur);
    draw();
  }

  function draw() {
    const W = drawWidth(fig, 680, 300);
    const n = actors.length;
    const small = W < 460;
    const fs = small ? 11 : 12.5;
    const padX = Math.min(64, W / (n * 2));
    const gap = (W - 2 * padX) / (n - 1);
    const x = (i) => padX + i * gap;
    const top = 36;
    const row = small ? 34 : 38;
    const H = top + 20 + messages.length * row;
    const root = svg("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: "img",
      "aria-label": "Échange entre " + actors.join(", "),
    });
    const defs = svg("defs");
    for (const k of ["link", "ink-2", "danger"]) {
      defs.appendChild(
        svg(
          "marker",
          {
            id: `${id}-${k}`,
            viewBox: "0 0 10 10",
            refX: 9,
            refY: 5,
            markerWidth: 7,
            markerHeight: 7,
            orient: "auto-start-reverse",
          },
          [svg("path", { d: "M0,0L10,5L0,10z", fill: `var(--${k})` })],
        ),
      );
    }
    root.appendChild(defs);
    actors.forEach((a, i) => {
      const bw = Math.min(gap - 6, Math.max(54, a.length * fs * 0.58 + 16));
      root.appendChild(
        svg("line", { x1: x(i), y1: top, x2: x(i), y2: H, class: "cy-life" }),
      );
      root.appendChild(
        svg("rect", {
          x: x(i) - bw / 2,
          y: 4,
          width: bw,
          height: 28,
          rx: 6,
          class: "cy-actor",
        }),
      );
      root.appendChild(
        svg(
          "text",
          {
            x: x(i),
            y: 22.5,
            "text-anchor": "middle",
            class: "cy-actor-l",
            "font-size": fs,
          },
          [a],
        ),
      );
    });
    messages.forEach((m, k) => {
      if (k > cur) return;
      const y = top + 28 + k * row;
      const x1 = x(m.from);
      const x2 = x(m.to);
      const dir = x2 >= x1 ? 1 : -1;
      const now = k === cur;
      const tone = m.attack ? "danger" : now ? "link" : "ink-2";
      root.appendChild(
        svg("line", {
          x1: x1 + dir * 3,
          y1: y,
          x2: x2 - dir * 3,
          y2: y,
          class:
            "cy-msg" +
            (now ? " is-now" : "") +
            (m.attack ? " is-attack" : "") +
            (m.reply ? " is-reply" : ""),
          "marker-end": `url(#${id}-${tone})`,
        }),
      );
      const tw = m.label.length * fs * 0.55;
      const tx = Math.min(W - tw / 2 - 2, Math.max(tw / 2 + 2, (x1 + x2) / 2));
      root.appendChild(
        svg(
          "text",
          {
            x: tx,
            y: y - 6,
            "text-anchor": "middle",
            "font-size": fs - 0.5,
            class:
              "cy-msg-l" +
              (now ? " is-now" : "") +
              (m.attack ? " is-attack" : ""),
          },
          [m.label],
        ),
      );
      root.appendChild(
        svg("text", { x: 2, y: y + 4, class: "cy-msg-n" }, [String(k + 1)]),
      );
    });
    plot.replaceChildren(root);
    note.textContent = messages[cur].note || messages[cur].label;
    count.textContent = `${cur + 1} / ${messages.length}`;
    prev.disabled = cur === 0;
    next.disabled = cur === messages.length - 1;
    ctx?.report({
      etape: cur + 1,
      total: messages.length,
      fini: seen === messages.length - 1 ? 1 : 0,
    });
  }

  const root = el(
    "div",
    {
      class: "w-root cy-ex",
      tabindex: "0",
      "aria-label": "Échange pas à pas : flèches gauche et droite pour avancer",
    },
    [
      plot,
      note,
      el("div", { class: "w-controls cy-ex-nav" }, [prev, next, all, count]),
    ],
  );
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      go(cur + (e.key === "ArrowRight" ? 1 : -1));
    }
  });
  draw();
  if (typeof ResizeObserver === "function") {
    let w = 0;
    root.onMount = () =>
      new ResizeObserver(() => {
        const nw = drawWidth(fig, 680, 300);
        if (nw !== w) {
          w = nw;
          draw();
        }
      }).observe(fig);
  }
  return root;
}
