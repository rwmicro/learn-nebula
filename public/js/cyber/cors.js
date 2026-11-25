// Widget "cors": the page that calls on one side, what api.exemple.fr answers
// on the other; the widget writes the headers exchanged (preflight included)
// and says what the browser lets the script read. The configuration that
// opens a hole (the Origin echoed back, with cookies) is named as such.
// Model: lib/cyber.ts (corsCheck).
import { el } from "../widget-kit.js";
import { corsCheck } from "../../../lib/cyber.ts";

const SITE = "https://app.exemple.fr";
const ORIGINS = [
  [SITE, SITE + " (le site)"],
  ["https://evil.example", "https://evil.example"],
  [
    "https://app.exemple.fr.evil.example",
    "https://app.exemple.fr.evil.example",
  ],
  ["null", "null (iframe sandbox)"],
];
const ACAO = [
  ["none", "(absent)"],
  ["star", "*"],
  ["list", "liste : app.exemple.fr"],
  ["reflect", "recopie l'Origin reçu"],
  ["null", "null"],
];

function select(label, options, value, onChange) {
  const s = el(
    "select",
    { class: "w-input", "aria-label": label },
    options.map(([v, t]) =>
      el("option", { value: v, selected: v === value }, [t]),
    ),
  );
  s.addEventListener("change", onChange);
  return s;
}

export function cors(props, fig, ctx) {
  const pick = (v, list, def) => (list.some(([k]) => k === v) ? v : def);
  const onChange = () => draw();
  const o = select(
    "Origine de la page",
    ORIGINS,
    pick(props.origine, ORIGINS, SITE),
    onChange,
  );
  const method = select(
    "Méthode",
    ["GET", "POST", "PUT", "DELETE"].map((m) => [m, m]),
    pick(
      String(props.methode || "").toUpperCase(),
      [["GET"], ["POST"], ["PUT"], ["DELETE"]],
      "GET",
    ),
    onChange,
  );
  const body = select(
    "Corps",
    [
      ["none", "aucun ou formulaire"],
      ["json", "application/json"],
    ],
    props.corps === "json" ? "json" : "none",
    onChange,
  );
  const cred = select(
    "Cookies",
    [
      ["0", "non"],
      ["1", "credentials: include"],
    ],
    /^(non|0|false)$/i.test(props.credentials || "oui") ? "0" : "1",
    onChange,
  );
  const acao = select(
    "Access-Control-Allow-Origin",
    ACAO,
    pick(props["allow-origin"], ACAO, "list"),
    onChange,
  );
  const acac = select(
    "Access-Control-Allow-Credentials",
    [
      ["0", "(absent)"],
      ["1", "true"],
    ],
    /^(non|0|false|absent)$/i.test(props["allow-credentials"] || "true")
      ? "0"
      : "1",
    onChange,
  );
  const acam = select(
    "Access-Control-Allow-Methods",
    [
      ["GET, POST", "GET, POST"],
      ["GET, POST, PUT, DELETE", "GET, POST, PUT, DELETE"],
    ],
    /put|delete/i.test(props["allow-methods"] || "")
      ? "GET, POST, PUT, DELETE"
      : "GET, POST",
    onChange,
  );
  const flow = el("div", { class: "cy-cors-flow" });
  const note = el("p", { class: "w-note", "aria-live": "polite" });
  const row = (label, input) =>
    el("label", { class: "cy-cors-row" }, [el("span", {}, [label]), input]);

  function msg(kind, who, lines) {
    return el("div", { class: "cy-cors-msg is-" + kind }, [
      el("div", { class: "cy-cors-who" }, [who]),
      el(
        "pre",
        {},
        lines.map((l) =>
          typeof l === "string"
            ? l + "\n"
            : el("span", { class: l[1] }, [l[0] + "\n"]),
        ),
      ),
    ]);
  }

  function draw() {
    const req = {
      origin: o.value,
      method: method.value,
      json: body.value === "json",
      credentials: cred.value === "1",
    };
    const srv = {
      allowOrigin: acao.value,
      list: [SITE],
      allowCredentials: acac.value === "1",
      allowMethods: acam.value.split(", "),
    };
    const r = corsCheck(req, srv);
    const hdrs = (withMethods) => {
      const originOk =
        r.acao === req.origin || (r.acao === "*" && !req.credentials);
      const out = [
        r.acao === null
          ? ["Access-Control-Allow-Origin: (absent)", "is-bad"]
          : [
              `Access-Control-Allow-Origin: ${r.acao}`,
              originOk ? "is-good" : "is-bad",
            ],
      ];
      if (srv.allowCredentials)
        out.push(["Access-Control-Allow-Credentials: true", "is-good"]);
      else if (req.credentials)
        out.push(["Access-Control-Allow-Credentials: (absent)", "is-bad"]);
      if (withMethods)
        out.push([
          `Access-Control-Allow-Methods: ${srv.allowMethods.join(", ")}`,
          srv.allowMethods.includes(req.method) ||
          ["GET", "POST"].includes(req.method)
            ? "is-good"
            : "is-bad",
        ]);
      return out;
    };
    const parts = [];
    let k = 1;
    if (r.preflight) {
      parts.push(
        msg(
          "req",
          `${k++} · Navigateur → serveur : demande de permission (preflight)`,
          [
            "OPTIONS /api/profil HTTP/1.1",
            `Origin: ${req.origin}`,
            `Access-Control-Request-Method: ${req.method}`,
            ...(req.json
              ? ["Access-Control-Request-Headers: content-type"]
              : []),
          ],
        ),
      );
      parts.push(
        msg(r.preflightOk ? "res" : "miss", `${k++} · Serveur → navigateur`, [
          "HTTP/1.1 204 No Content",
          ...hdrs(true),
        ]),
      );
      if (!r.preflightOk)
        parts.push(
          msg("miss", `${k++} · La vraie requête`, [
            `${req.method} jamais envoyée : le preflight a échoué.`,
          ]),
        );
    }
    if (r.sent) {
      parts.push(
        msg(
          "req",
          `${k++} · Navigateur → serveur${r.preflight ? "" : " : requête simple, sans preflight"}`,
          [
            `${req.method} /api/profil HTTP/1.1`,
            "Host: api.exemple.fr",
            `Origin: ${req.origin}`,
            ...(req.json ? ["Content-Type: application/json"] : []),
            ...(req.credentials ? ["Cookie: session=7f3a…"] : []),
          ],
        ),
      );
      parts.push(
        msg(r.readable ? "res" : "miss", `${k++} · Serveur → navigateur`, [
          "HTTP/1.1 200 OK",
          ...hdrs(false),
          "",
          '{"email": "victime@exemple.fr", "iban": "FR76 …"}',
        ]),
      );
    }
    flow.replaceChildren(...parts);

    const v = (cls, t) => el("span", { class: "cy-verdict " + cls }, [t]);
    if (r.flaw)
      note.replaceChildren(
        v("is-flaw", "Faille"),
        ` ${req.origin} lit le profil de la victime, cookies compris. `,
        srv.allowOrigin === "reflect"
          ? "Recopier l'Origin reçu revient à n'avoir aucune liste."
          : srv.allowOrigin === "null"
            ? "Autoriser null ouvre la porte à n'importe quelle iframe sandbox."
            : "",
      );
    else if (r.readable)
      note.replaceChildren(
        v("is-ok", "Lisible"),
        ` Le JavaScript de ${req.origin} reçoit la réponse.`,
      );
    else
      note.replaceChildren(
        v("is-ko", "Bloqué"),
        ` ${r.reasons.join(" ; ")}.`,
        r.sent
          ? el("b", {}, [
              " Mais la requête est partie et le serveur l'a traitée : ",
            ])
          : "",
        r.sent
          ? "seule la lecture est bloquée, d'où le jeton CSRF pour les actions."
          : "",
      );
    ctx?.report({
      lisible: r.readable ? 1 : 0,
      faille: r.flaw ? 1 : 0,
      preflight: r.preflight ? 1 : 0,
      envoyee: r.sent ? 1 : 0,
    });
  }

  draw();
  return el("div", { class: "w-root cy-cors" }, [
    el("div", { class: "cy-cors-cols" }, [
      el("div", { class: "cy-box" }, [
        el("h4", {}, ["La page qui appelle"]),
        row("Origine", o),
        row("Méthode", method),
        row("Corps", body),
        row("Cookies", cred),
      ]),
      el("div", { class: "cy-box" }, [
        el("h4", {}, ["api.exemple.fr répond"]),
        row("Allow-Origin", acao),
        row("Allow-Credentials", acac),
        row("Allow-Methods", acam),
      ]),
    ]),
    flow,
    note,
  ]);
}
