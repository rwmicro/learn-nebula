// Widget "tunnel-ssh": the three SSH forwards (-L, -R, -D) drawn on the same
// small network: who types the command, who opens the SSH session, where the
// forwarded port listens, and which hop runs in clear on the inside.
// Model: lib/cyber.ts (tunnelPlan).
import { el, svg, drawWidth } from "../widget-kit.js";
import { parseMode, tunnelPlan } from "../../../lib/cyber.ts";
import { segmented, uid } from "../sci/common.js";

const MODES = [
  ["L", "-L local"],
  ["R", "-R distant"],
  ["D", "-D SOCKS"],
];

const STEPS = {
  L: (o, p) => [
    `Sur ta machine, ${p.use} se connecte au port que SSH a ouvert chez toi.`,
    `SSH emporte les octets dans la session que tu as ouverte vers ${o.pivotName} (port 22).`,
    `${o.pivotName} ouvre lui-même la connexion vers ${o.target}, en clair, sur un réseau que tu ne vois pas.`,
  ],
  R: (o) => [
    `Le pare-feu bloque tout ce qui entre vers ${o.pivotName}, mais ${o.pivotName} peut sortir : c'est lui qui lance SSH vers toi.`,
    `SSH ouvre le port ${o.lport} sur ta machine, à l'autre bout de la session.`,
    `Ce que tu envoies à 127.0.0.1:${o.lport} redescend le tunnel et ${o.pivotName} le livre à ${o.target}. Le principe du reverse shell, appliqué à un port.`,
  ],
  D: (o, p) => [
    `SSH ouvre un proxy SOCKS sur ta machine (port ${o.lport}), sans destination fixe.`,
    `Chaque connexion annonce sa cible au proxy. ${p.use} y fait passer nmap (-sT : un proxy ne transporte pas de SYN bruts).`,
    `${o.pivotName} ouvre une connexion vers chaque cible demandée : un seul tunnel pour tout le sous-réseau.`,
  ],
};

export function tunnelSsh(props, fig, ctx) {
  let mode = parseMode(props.mode);
  const o = {
    kali: String(props.toi || "10.10.14.5").trim(),
    pivotName: String(props["pivot-nom"] || "web01").trim(),
    pivot: String(props.pivot || "10.10.10.20").trim(),
    pivotIn: String(props["pivot-interne"] || "172.16.0.20").trim(),
    target: String(props.destination || "172.16.0.50:3306").trim(),
    targetName: String(props["destination-nom"] || "db01").trim(),
    lport:
      Number(props.port) ||
      Number(String(props.destination || "").split(":")[1]) ||
      3306,
  };
  const id = uid("cy-tu");
  const seen = new Set([mode]);
  const cmd = el("code", { class: "cy-cmd" });
  const plot = el("div", { class: "cy-tu-plot" });
  const steps = el("ol", { class: "cy-steps" });
  const seg = segmented("Type de tunnel", MODES, mode, (v) => {
    mode = v;
    seen.add(v);
    draw();
  });

  function draw() {
    const p = tunnelPlan(mode, o);
    cmd.textContent = `${p.runOn === "kali" ? "toi" : o.pivotName}$ ${p.command}`;
    const W = drawWidth(fig, 680, 300);
    const vert = W < 540;
    const nodes = [
      ["Toi", o.kali],
      [o.pivotName + " (pivot)", `${o.pivot} · ${o.pivotIn}`],
      [
        mode === "D" ? "Réseau interne" : o.targetName,
        mode === "D" ? o.target.replace(/\.\d+(:\d+)?$/, ".0/24") : o.target,
      ],
    ];
    const bw = vert ? Math.min(W - 40, 280) : (W - 100) / 3;
    const bh = 54;
    const gapV = 104;
    const pos = nodes.map((_, i) =>
      vert ? [(W - bw) / 2, 18 + i * gapV] : [10 + i * (bw + 40), 30],
    );
    const H = vert ? 18 + 2 * gapV + bh + 8 : 30 + bh + 48;
    const root = svg("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      role: "img",
      "aria-label": `Tunnel SSH ${mode} : ${p.command}`,
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
            markerWidth: 7,
            markerHeight: 7,
            orient: "auto-start-reverse",
          },
          [svg("path", { d: "M0,0L10,5L0,10z", fill: "var(--link)" })],
        ),
        svg(
          "marker",
          {
            id: id + "-b",
            viewBox: "0 0 10 10",
            refX: 9,
            refY: 5,
            markerWidth: 7,
            markerHeight: 7,
            orient: "auto-start-reverse",
          },
          [svg("path", { d: "M0,0L10,5L0,10z", fill: "var(--ink-2)" })],
        ),
      ]),
    );
    const sshLabel = `SSH ouverte par ${p.sshFrom === 0 ? "toi" : o.pivotName}`;
    if (vert) {
      const x = W / 2;
      const y1 = pos[0][1] + bh;
      const y2 = pos[1][1];
      root.appendChild(
        svg("rect", {
          x: x - 14,
          y: y1,
          width: 28,
          height: y2 - y1,
          rx: 8,
          class: "cy-tube",
        }),
      );
      const [a, b] = p.sshFrom === 0 ? [y1 + 6, y2 - 6] : [y2 - 6, y1 + 6];
      root.appendChild(
        svg("line", {
          x1: x,
          y1: a,
          x2: x,
          y2: b,
          class: "cy-ssh",
          "marker-end": `url(#${id}-a)`,
        }),
      );
      root.appendChild(
        svg("text", { x: x + 22, y: (y1 + y2) / 2 + 4, class: "cy-ssh-l" }, [
          sshLabel,
        ]),
      );
      if (mode === "R") {
        root.appendChild(
          svg("line", {
            x1: x - 70,
            y1: y2 - 10,
            x2: x - 20,
            y2: y2 - 10,
            class: "cy-fw-line",
          }),
        );
        root.appendChild(
          svg(
            "text",
            { x: x - 74, y: y2 - 6, "text-anchor": "end", class: "cy-fw-l" },
            ["entrant bloqué"],
          ),
        );
      }
      const y3 = pos[1][1] + bh;
      const y4 = pos[2][1];
      root.appendChild(
        svg("line", {
          x1: x,
          y1: y3 + 4,
          x2: x,
          y2: y4 - 4,
          class: "cy-clear",
          "marker-end": `url(#${id}-b)`,
        }),
      );
      root.appendChild(
        svg("text", { x: x + 10, y: (y3 + y4) / 2 + 4, class: "cy-clear-l" }, [
          "en clair, réseau interne",
        ]),
      );
    } else {
      const y = pos[0][1] + bh / 2;
      const x1 = pos[0][0] + bw;
      const x2 = pos[1][0];
      root.appendChild(
        svg("rect", {
          x: x1,
          y: y - 12,
          width: x2 - x1,
          height: 24,
          rx: 8,
          class: "cy-tube",
        }),
      );
      const [a, b] = p.sshFrom === 0 ? [x1 + 4, x2 - 4] : [x2 - 4, x1 + 4];
      root.appendChild(
        svg("line", {
          x1: a,
          y1: y,
          x2: b,
          y2: y,
          class: "cy-ssh",
          "marker-end": `url(#${id}-a)`,
        }),
      );
      root.appendChild(
        svg(
          "text",
          {
            x: (x1 + x2) / 2,
            y: pos[0][1] + bh + 22,
            "text-anchor": "middle",
            class: "cy-ssh-l",
          },
          [sshLabel],
        ),
      );
      if (mode === "R") {
        root.appendChild(
          svg("line", {
            x1: x2 - 7,
            y1: y - 22,
            x2: x2 - 7,
            y2: y + 22,
            class: "cy-fw-line",
          }),
        );
        root.appendChild(
          svg(
            "text",
            { x: x2 - 7, y: y - 26, "text-anchor": "middle", class: "cy-fw-l" },
            ["entrant bloqué"],
          ),
        );
      }
      const x3 = pos[1][0] + bw;
      const x4 = pos[2][0];
      root.appendChild(
        svg("line", {
          x1: x3 + 3,
          y1: y,
          x2: x4 - 3,
          y2: y,
          class: "cy-clear",
          "marker-end": `url(#${id}-b)`,
        }),
      );
      root.appendChild(
        svg(
          "text",
          {
            x: (x3 + x4) / 2,
            y: pos[0][1] + bh + 22,
            "text-anchor": "middle",
            class: "cy-clear-l",
          },
          ["en clair"],
        ),
      );
    }
    nodes.forEach(([name, addr], i) => {
      const [x, y] = pos[i];
      root.appendChild(
        svg("rect", { x, y, width: bw, height: bh, rx: 8, class: "cy-node" }),
      );
      root.appendChild(
        svg(
          "text",
          {
            x: x + bw / 2,
            y: y + 22,
            "text-anchor": "middle",
            class: "cy-node-l",
          },
          [name],
        ),
      );
      root.appendChild(
        svg(
          "text",
          {
            x: x + bw / 2,
            y: y + 40,
            "text-anchor": "middle",
            class: "cy-node-a",
          },
          [addr],
        ),
      );
    });
    const badge = mode === "D" ? `SOCKS :${o.lport}` : `écoute :${o.lport}`;
    const lw = badge.length * 7 + 14;
    root.appendChild(
      svg("rect", {
        x: pos[0][0] + 6,
        y: pos[0][1] - 12,
        width: lw,
        height: 20,
        rx: 10,
        class: "cy-listen",
      }),
    );
    root.appendChild(
      svg(
        "text",
        {
          x: pos[0][0] + 6 + lw / 2,
          y: pos[0][1] + 2,
          "text-anchor": "middle",
          class: "cy-listen-l",
        },
        [badge],
      ),
    );
    plot.replaceChildren(root);
    steps.replaceChildren(...STEPS[mode](o, p).map((t) => el("li", {}, [t])));
    ctx?.report({ mode, vus: seen.size });
  }

  draw();
  const root = el("div", { class: "w-root cy-tu" }, [
    el("div", { class: "w-controls" }, [seg.node]),
    cmd,
    plot,
    steps,
  ]);
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
