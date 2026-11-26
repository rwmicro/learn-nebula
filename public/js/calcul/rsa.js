// Widget "rsa": textbook RSA on small primes, every step shown. Choose p, q,
// e and a message m; the widget builds n and φ(n), finds d with the extended
// Euclid table, encrypts by square-and-multiply, decrypts, and lets Eve try
// to factor n by trial division to show where the security lives.
// Model: lib/calcul.ts (rsa, euclidSteps, squareMultiply).
import { el } from "../widget-kit.js";
import { num } from "../sci/common.js";
import { rsa as rsaModel } from "../../../lib/calcul.ts";

function field(label, value, onInput) {
  const i = el("input", { type: "number", class: "w-input ca-num", value: String(value), "aria-label": label, min: "0" });
  i.addEventListener("input", () => onInput(i.value));
  return { node: el("label", { class: "ca-field" }, [el("span", {}, [label]), i]), input: i };
}

function sqmTable(steps, base, exp, n) {
  return el("table", { class: "w-table ca-sqm" }, [
    el("tr", {}, [el("th", {}, ["bit de l'exposant"]), el("th", {}, ["au carré"]), el("th", {}, ["× " + base + " ?"]), el("th", {}, ["résultat mod " + n])]),
    ...steps.map((s) =>
      el("tr", {}, [
        el("td", {}, [String(s.bit)]),
        el("td", {}, [String(s.squared)]),
        el("td", {}, [s.bit ? "oui" : "non"]),
        el("td", { class: "is-val" }, [String(s.value)]),
      ]),
    ),
    el("caption", {}, [`${exp} s'écrit ${Number(exp).toString(2)} en binaire : ${steps.length} étapes au lieu de ${exp} multiplications.`]),
  ]);
}

export function rsa(props, fig, ctx) {
  const st = {
    p: Math.round(num(props.p, 61, 2, 9999)),
    q: Math.round(num(props.q, 53, 2, 9999)),
    e: Math.round(num(props.e, 17, 2, 99999999)),
    m: Math.round(num(props.m, 65, 0, 99999999)),
  };
  const fP = field("p (premier)", st.p, (v) => ((st.p = Math.round(num(v, 0))), draw()));
  const fQ = field("q (premier)", st.q, (v) => ((st.q = Math.round(num(v, 0))), draw()));
  const fE = field("e (public)", st.e, (v) => ((st.e = Math.round(num(v, 0))), draw()));
  const fM = field("message m", st.m, (v) => ((st.m = Math.round(num(v, 0))), draw()));
  const body = el("div", { class: "ca-steps" });
  let showSqm = false;
  let eve = false;

  function stepCard(n, title, children) {
    return el("div", { class: "ca-step" }, [el("div", { class: "ca-step-n" }, [String(n)]), el("div", {}, [el("div", { class: "ca-step-t" }, [title]), ...children])]);
  }

  function draw() {
    const r = rsaModel(st.p, st.q, st.e, st.m);
    const kids = [];
    if (!r.ok) {
      kids.push(el("div", { class: "ca-warn" }, r.errors.map((t) => el("p", {}, [t]))));
    }
    kids.push(stepCard(1, "Le module public", [el("p", {}, [`n = p × q = ${st.p} × ${st.q} = `, el("b", {}, [String(r.n)])])]));
    kids.push(stepCard(2, "La quantité secrète", [el("p", {}, [`φ(n) = (p − 1)(q − 1) = ${st.p - 1} × ${st.q - 1} = `, el("b", {}, [String(r.phi)])]), el("p", { class: "w-hint" }, ["Seul celui qui connaît p et q sait la calculer."])]));
    if (r.ok) {
      kids.push(
        stepCard(3, "La clé privée d, inverse de e modulo φ(n)", [
          el("table", { class: "w-table ca-euclid" }, [
            el("tr", {}, ["a", "b", "q", "reste", "u", "v"].map((h) => el("th", {}, [h]))),
            ...r.euclid.map((row) => el("tr", {}, [row.a, row.b, row.q, row.r, row.u, row.v].map((x) => el("td", {}, [String(x)])))),
          ]),
          el("p", {}, [`Euclide étendu : ${r.phi} × (${r.euclid[0].u}) + ${st.e} × (${r.euclid[0].v}) = 1, donc d ≡ ${r.euclid[0].v} ≡ `, el("b", {}, [String(r.d)]), ` (mod ${r.phi}). Vérification : ${st.e} × ${r.d} = ${st.e * r.d} = ${Math.floor((st.e * r.d) / r.phi)} × ${r.phi} + 1.`]),
        ]),
      );
      kids.push(
        stepCard(4, "Chiffrer avec la clé publique (n, e)", [
          el("p", {}, [`c = m^e mod n = ${st.m}^${st.e} mod ${r.n} = `, el("b", {}, [String(r.c)])]),
          el("button", { type: "button", class: "w-btn", onclick: () => ((showSqm = !showSqm), draw()) }, [showSqm ? "Masquer le calcul" : "Voir l'exponentiation rapide"]),
          showSqm ? sqmTable(r.encrypt, st.m, st.e, r.n) : null,
        ]),
      );
      kids.push(
        stepCard(5, "Déchiffrer avec la clé privée d", [
          el("p", {}, [`c^d mod n = ${r.c}^${r.d} mod ${r.n} = `, el("b", {}, [String(r.back)])]),
          el("p", { class: r.back === st.m ? "ca-ok" : "ca-ko" }, [r.back === st.m ? "On retrouve le message de départ." : "Le message n'est pas retrouvé."]),
        ]),
      );
      // Eve: trial division of n.
      let tries = 0;
      let found = 0;
      for (let d = 2; d * d <= r.n; d++) {
        tries++;
        if (r.n % d === 0) {
          found = d;
          break;
        }
      }
      kids.push(
        stepCard(6, "Ève essaie de factoriser n", [
          el("button", { type: "button", class: "w-btn", onclick: () => ((eve = !eve), draw()) }, [eve ? "Masquer" : "Lancer l'attaque"]),
          eve
            ? el("p", {}, [
                `Division par 2, 3, 4… : ${r.n} = ${found} × ${r.n / found} trouvé en ${tries} essais. Ève en déduit φ(n), puis d. `,
                "Avec un n de 2048 bits (617 chiffres), les meilleurs algorithmes connus demanderaient des milliards d'années de calcul : toute la sécurité repose là.",
              ])
            : null,
        ]),
      );
    }
    body.replaceChildren(...kids);
    ctx?.report({ n: r.n, phi: r.phi, d: r.d, c: r.c, e: st.e, valide: r.ok ? 1 : 0, retrouve: r.ok && r.back === st.m ? 1 : 0 });
  }

  draw();
  return el("div", { class: "w-root ca-root ca-rsa" }, [el("div", { class: "ca-fields" }, [fP.node, fQ.node, fE.node, fM.node]), body]);
}
