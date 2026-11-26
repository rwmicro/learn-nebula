// Widget "pare-feu": a packet walks down an iptables chain, rule by rule; the
// first rule that matches decides, the default policy takes the rest. Each
// rule says why it let the packet pass by, and can be switched off to show
// that order matters. Model: lib/cyber.ts (parseRule, evaluate).
//   politique: DROP
//   r1: -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
//   paquet: tcp 10.8.0.6 22 NEW
//   x1: SSH depuis Internet = tcp 185.220.101.4 22 NEW
import { el, reducedMotion } from "../widget-kit.js";
import {
  evaluate,
  ipToInt,
  numbered,
  parsePacket,
  parseRule,
} from "../../../lib/cyber.ts";

const DEFAULT_RULES = [
  "-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
  "-A INPUT -i lo -j ACCEPT",
  "-A INPUT -p tcp --dport 22 -s 10.8.0.0/24 -j ACCEPT",
  "-A INPUT -p tcp --dport 22 -j DROP",
  "-A INPUT -p tcp -m multiport --dports 80,443 -j ACCEPT",
];

export function pareFeu(props, fig, ctx) {
  const rules = (
    numbered(props, "r").length ? numbered(props, "r") : DEFAULT_RULES
  )
    .map(parseRule)
    .filter(Boolean);
  const policy = String(props.politique || "DROP").toUpperCase();
  const chain = String(props.chaine || "INPUT").toUpperCase();
  const examples = numbered(props, "x")
    .map((l) => l.split("="))
    .filter((p) => p.length === 2)
    .map(([label, pk]) => [label.trim(), parsePacket(pk)]);
  if (!examples.length)
    examples.push(
      ["SSH depuis le VPN", parsePacket("tcp 10.8.0.6 22 NEW")],
      ["SSH depuis Internet", parsePacket("tcp 185.220.101.4 22 NEW")],
      ["HTTPS", parsePacket("tcp 185.220.101.4 443 NEW")],
      ["Réponse DNS", parsePacket("udp 1.1.1.1 41022 ESTABLISHED")],
    );
  const off = new Set();
  let timer = 0;
  const p0 = parsePacket(props.paquet || "tcp 10.8.0.6 22 NEW");

  const src = el("input", {
    class: "w-input w-mono",
    value: p0.src,
    "aria-label": "Adresse source",
    spellcheck: "false",
  });
  const proto = el(
    "select",
    { class: "w-input", "aria-label": "Protocole" },
    ["tcp", "udp", "icmp"].map((p) =>
      el("option", { value: p, selected: p === p0.proto }, [p]),
    ),
  );
  const port = el("input", {
    class: "w-input w-mono",
    value: String(p0.port),
    inputmode: "numeric",
    "aria-label": "Port de destination",
  });
  const state = el(
    "select",
    { class: "w-input", "aria-label": "État de la connexion" },
    [
      el("option", { value: "NEW", selected: p0.state === "NEW" }, [
        "NEW : nouvelle connexion",
      ]),
      el(
        "option",
        { value: "ESTABLISHED", selected: p0.state === "ESTABLISHED" },
        ["ESTABLISHED : une réponse"],
      ),
    ],
  );
  const verdict = el("span", {
    class: "cy-verdict-slot",
    "aria-live": "polite",
  });
  const list = el("ol", { class: "cy-rules" });
  const pol = el("div", { class: "cy-policy" }, [
    `-P ${chain} ${policy}  (politique par défaut)`,
  ]);

  const field = (label, input) =>
    el("label", { class: "cy-field" }, [el("span", {}, [label]), input]);

  function packet() {
    return {
      src: src.value.trim(),
      proto: proto.value,
      port: parseInt(port.value, 10) || 0,
      state: state.value,
    };
  }

  function paint(v, upto) {
    list.replaceChildren(
      ...rules.map((r, i) => {
        const c = v.checks[i];
        let cls = "cy-rule";
        let why = "";
        if (off.has(i)) cls += " is-off";
        if (upto !== undefined) {
          if (i < upto && c) {
            cls += " is-skip";
            why = "✕ " + c.why;
          } else if (i === upto) {
            cls += " is-checking";
            why = "…";
          }
        } else if (i === v.hit) {
          cls += " is-hit" + (r.target === "ACCEPT" ? "" : " is-drop");
          why = `✓ ${c.why} → ${r.target}`;
        } else if (c && (v.hit < 0 || i < v.hit)) {
          cls += " is-skip";
          why = "✕ " + c.why;
        }
        const box = el("input", {
          type: "checkbox",
          checked: !off.has(i),
          "aria-label": "Règle " + (i + 1) + " active",
        });
        box.addEventListener("change", () => {
          if (box.checked) off.delete(i);
          else off.add(i);
          send(true);
        });
        return el("li", { class: cls }, [
          el("span", { class: "cy-rule-n" }, [String(i + 1)]),
          box,
          el("code", {}, [r.text]),
          el("span", { class: "cy-rule-why" }, [why]),
        ]);
      }),
    );
    pol.classList.toggle("is-hit", upto === undefined && v.hit < 0);
  }

  function send(instant) {
    clearTimeout(timer);
    const p = packet();
    if (ipToInt(p.src) === null) {
      verdict.replaceChildren(
        el("span", { class: "cy-verdict is-ko" }, [
          "Adresse source invalide : quatre nombres de 0 à 255, comme 10.8.0.6",
        ]),
      );
      return;
    }
    const v = evaluate(rules, p, policy, off);
    const finish = () => {
      paint(v);
      const ok = v.target === "ACCEPT";
      verdict.replaceChildren(
        el("span", { class: "cy-verdict " + (ok ? "is-ok" : "is-ko") }, [
          ok ? "Accepté" : v.target === "REJECT" ? "Rejeté" : "Jeté",
        ]),
        el("span", { class: "w-hint" }, [
          v.hit < 0
            ? " aucune règle ne correspond : politique par défaut"
            : ` par la règle ${v.hit + 1}`,
        ]),
      );
      ctx?.report({
        accepte: ok ? 1 : 0,
        regle: v.hit + 1,
        desactivees: off.size,
      });
    };
    if (instant || reducedMotion()) return finish();
    verdict.replaceChildren();
    const last = v.hit < 0 ? rules.length - 1 : v.hit;
    let i = 0;
    const tick = () => {
      paint(v, i);
      if (i < last) {
        i++;
        timer = window.setTimeout(tick, 320);
      } else timer = window.setTimeout(finish, 320);
    };
    tick();
  }

  const exBtns = examples.map(([label, pk]) =>
    el(
      "button",
      {
        type: "button",
        class: "w-btn",
        onclick: () => {
          src.value = pk.src;
          proto.value = pk.proto;
          port.value = String(pk.port);
          state.value = pk.state;
          send(false);
        },
      },
      [label],
    ),
  );

  send(true);
  return el("div", { class: "w-root cy-fw" }, [
    el("div", { class: "w-controls" }, [
      el("span", { class: "w-hint" }, ["Essayer :"]),
      ...exBtns,
    ]),
    el("div", { class: "cy-fields" }, [
      field("Source", src),
      field("Protocole", proto),
      field("Port de destination", port),
      field("État", state),
    ]),
    el("div", { class: "w-controls" }, [
      el(
        "button",
        { type: "button", class: "w-btn sci-cta", onclick: () => send(false) },
        ["Envoyer le paquet"],
      ),
      verdict,
    ]),
    list,
    pol,
    el("p", { class: "w-note" }, [
      "Décochez une règle pour voir le paquet tomber sur la suivante : dans une chaîne, c'est l'ordre qui décide.",
    ]),
  ]);
}
