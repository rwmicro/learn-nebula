// Widget "nat": three machines share one public address. Each outbound
// connection writes a line in the PAT table; a reply comes back only if its
// line exists, which is why NAT stops unsolicited connections and why a
// service behind it needs a port forward. Model: lib/cyber.ts (NatTable).
import { el } from "../widget-kit.js";
import { NatTable } from "../../../lib/cyber.ts";

const SRC_PORTS = [51544, 49832, 60211, 53107, 57790, 50466, 62019, 48733];

export function nat(props, fig, ctx) {
  const lan = String(props.lan || "192.168.1.10, 192.168.1.11, 192.168.1.12")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const wan = String(props.wan || "203.0.113.5").trim();
  const server = String(props.serveur || "93.184.216.34:443").trim();
  const table = new NatTable(wan, 40001, 5);
  let n = 0;
  let replies = 0;
  let dropped = 0;

  const pkts = el("div", { class: "cy-nat-pkts" });
  const tbody = el("tbody");
  const note = el("p", { class: "w-note", "aria-live": "polite" });

  const cell = (k, v, chg) =>
    el("tr", {}, [
      el("td", {}, [k]),
      el("td", {}, [chg ? el("mark", { class: "cy-chg" }, [v]) : v]),
    ]);
  const pkt = (title, s, d, cs, cd) =>
    el("div", { class: "cy-pkt" }, [
      el("h4", {}, [title]),
      el("table", {}, [cell("Source", s, cs), cell("Destination", d, cd)]),
    ]);

  function rows(mark, cls) {
    if (!table.rows.length) {
      tbody.replaceChildren(
        el("tr", { class: "cy-nat-empty" }, [
          el("td", { colspan: "5" }, [
            "Table vide : personne n'est encore sorti.",
          ]),
        ]),
      );
      return;
    }
    tbody.replaceChildren(
      ...table.rows.map((r) =>
        el("tr", { class: r === mark ? cls : "" }, [
          el("td", {}, [r.ip]),
          el("td", {}, [String(r.port)]),
          el("td", {}, [String(r.pub)]),
          el("td", {}, [r.dst]),
          el("td", {}, [
            el(
              "button",
              { type: "button", class: "w-btn", onclick: () => reply(r) },
              ["Réponse"],
            ),
          ]),
        ]),
      ),
    );
  }
  function report() {
    ctx?.report({
      lignes: table.rows.length,
      reponses: replies,
      jetes: dropped,
    });
  }
  function out(ip) {
    const r = table.out(ip, SRC_PORTS[n++ % SRC_PORTS.length], server);
    pkts.replaceChildren(
      pkt("Avant le routeur (réseau local)", `${ip}:${r.port}`, server),
      pkt("Après le routeur (Internet)", `${wan}:${r.pub}`, server, true),
    );
    rows(r, "is-new");
    note.replaceChildren(
      "Le routeur remplace la source privée par ",
      el("b", {}, ["son adresse publique"]),
      ` et un port libre (${r.pub}), puis note la correspondance. Le serveur ne voit jamais l'adresse privée.`,
    );
    report();
  }
  function reply(r) {
    replies++;
    pkts.replaceChildren(
      pkt("Arrive d'Internet", server, `${wan}:${r.pub}`),
      pkt(
        "Remis sur le réseau local",
        server,
        `${r.ip}:${r.port}`,
        false,
        true,
      ),
    );
    rows(r, "is-used");
    note.replaceChildren(
      `Le port de destination ${r.pub} retrouve sa ligne : le routeur réécrit la destination vers `,
      el("b", {}, [`${r.ip}:${r.port}`]),
      ".",
    );
    report();
  }
  function inbound() {
    dropped++;
    pkts.replaceChildren(
      pkt("Arrive d'Internet", "198.51.100.9:33891", `${wan}:22`),
      el("div", { class: "cy-pkt" }, [
        el("h4", {}, ["Remis sur le réseau local"]),
        el("span", { class: "cy-verdict is-ko" }, ["Jeté"]),
        el("p", { class: "w-hint" }, ["Aucune ligne pour le port 22."]),
      ]),
    );
    rows(null, "");
    note.replaceChildren(
      "Personne à l'intérieur n'a ouvert cette connexion : ",
      el("b", {}, ["aucune ligne ne correspond"]),
      ". Héberger un service demande une redirection de port (NAT statique). C'est aussi pourquoi un reverse shell part de la victime vers l'attaquant, et pas l'inverse.",
    );
    report();
  }

  const hosts = lan.map((ip) =>
    el("div", { class: "cy-host" }, [
      el("span", {}, [ip]),
      el("button", { type: "button", class: "w-btn", onclick: () => out(ip) }, [
        "Sortir",
      ]),
    ]),
  );
  out(lan[0]);
  if (lan[1]) out(lan[1]);
  return el("div", { class: "w-root cy-nat" }, [
    el("div", { class: "cy-nat-net" }, [
      el("div", { class: "cy-nat-side" }, [
        el("h4", {}, ["Réseau local"]),
        ...hosts,
      ]),
      el("div", { class: "cy-router" }, [
        el("b", {}, ["Routeur"]),
        `public ${wan}`,
      ]),
      el("div", { class: "cy-nat-side" }, [
        el("h4", {}, ["Internet"]),
        el("div", { class: "cy-host" }, [
          el("span", {}, [server]),
          el("span", { class: "w-hint" }, ["serveur"]),
        ]),
        el("div", { class: "cy-host" }, [
          el("span", {}, ["198.51.100.9"]),
          el("button", { type: "button", class: "w-btn", onclick: inbound }, [
            "Entrer",
          ]),
        ]),
      ]),
    ]),
    pkts,
    el("div", { class: "cy-scroll" }, [
      el("table", { class: "cy-nat-table" }, [
        el("thead", {}, [
          el(
            "tr",
            {},
            [
              "Adresse privée",
              "Port privé",
              "Port public",
              "Destination",
              "",
            ].map((h) => el("th", {}, [h])),
          ),
        ]),
        tbody,
      ]),
    ]),
    note,
  ]);
}
