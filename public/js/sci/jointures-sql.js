// Widget "jointures-sql": two small tables, a join type, and the result.
// Rows of each source table light up when they appear in the result; the
// cells a join fills with NULL are shown as such. Model: lib/sci-algo.ts.
import { el } from "../widget-kit.js";
import { CLIENTS, COMMANDES, JOINTURES, jointure, parseJointure } from "../../../lib/sci-algo.ts";
import { segmented } from "./common.js";

const NOTES = {
  inner: "INNER JOIN ne garde que les couples de lignes dont les clés correspondent : un client sans commande et une commande sans client disparaissent.",
  left: "LEFT JOIN garde toutes les lignes de la table de gauche ; quand aucune commande ne correspond, les colonnes de droite valent NULL. C'est la requête pour trouver « les clients qui n'ont jamais commandé » (WHERE commandes.num IS NULL).",
  right: "RIGHT JOIN est le symétrique : toutes les commandes sont gardées, même celle dont le client n'existe pas. On l'écrit rarement, on préfère inverser les tables et écrire un LEFT JOIN.",
  full: "FULL OUTER JOIN garde tout des deux côtés, en complétant par NULL là où il manque une correspondance. MySQL ne le connaît pas ; on l'obtient par l'union d'un LEFT et d'un RIGHT JOIN.",
};

function tableau(t, surligne, titre) {
  return el("div", { class: "sql-src" }, [
    el("p", { class: "sci-cap" }, [titre]),
    el("table", { class: "w-table sql-t" }, [
      el("thead", {}, [el("tr", {}, t.colonnes.map((c) => el("th", { scope: "col" }, [c])))]),
      el(
        "tbody",
        {},
        t.lignes.map((l, i) => el("tr", { class: surligne.has(i) ? "is-in" : "is-out" }, t.colonnes.map((c) => el("td", {}, [String(l[c])])))),
      ),
    ]),
  ]);
}

export function jointuresSql(props, fig, ctx) {
  let type = parseJointure(props.type);
  const g = CLIENTS;
  const d = COMMANDES;
  const seg = segmented("Type de jointure", JOINTURES, type, (v) => {
    type = v;
    draw();
  });
  const body = el("div");

  function draw() {
    const r = jointure(g, d, "id", "client_id", type);
    const inG = new Set(r.lignes.map((x) => x[0]).filter((x) => x !== null));
    const inD = new Set(r.lignes.map((x) => x[1]).filter((x) => x !== null));
    const cols = [
      ...g.colonnes.map((c) => ["g", c]),
      ...d.colonnes.map((c) => ["d", c]),
    ];
    const sql = `SELECT *\nFROM clients\n${JOINTURES.find((j) => j[0] === type)[1]} commandes\n  ON clients.id = commandes.client_id;`;
    body.replaceChildren(
      el("pre", { class: "sql-code" }, [el("code", {}, [sql])]),
      el("div", { class: "sci-two" }, [tableau(g, inG, "clients"), tableau(d, inD, "commandes")]),
      el("p", { class: "sci-cap" }, [`Résultat : ${r.lignes.length} ligne${r.lignes.length > 1 ? "s" : ""}`]),
      el("div", { class: "sql-scroll" }, [
        el("table", { class: "w-table sql-t" }, [
          el("thead", {}, [el("tr", {}, cols.map(([s, c]) => el("th", { scope: "col" }, [(s === "g" ? "clients." : "commandes.") + c])))]),
          el(
            "tbody",
            {},
            r.lignes.map(([i, j]) =>
              el(
                "tr",
                {},
                cols.map(([s, c]) => {
                  const idx = s === "g" ? i : j;
                  const v = idx === null ? null : (s === "g" ? g : d).lignes[idx][c];
                  return el("td", { class: v === null ? "sql-null" : "" }, [v === null ? "NULL" : String(v)]);
                }),
              ),
            ),
          ),
        ]),
      ]),
      el("p", { class: "w-note" }, [NOTES[type]]),
    );
    ctx?.report({ lignes: r.lignes.length, type });
  }

  draw();
  return el("div", { class: "w-root sql-join" }, [el("div", { class: "w-controls" }, [seg.node]), body]);
}
