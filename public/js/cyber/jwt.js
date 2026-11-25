// Widget "jwt": a real token, HMAC-SHA256 signed in the page (Web Crypto).
// The reader edits the payload, switches to alg "none", re-signs with a
// guessed secret, or runs a tiny "hashcat" over a wordlist; a server holding
// the note's secret says what it accepts. Model: lib/cyber.ts.
import { el } from "../widget-kit.js";
import { signJwt, verifyJwt, hs256 } from "../../../lib/cyber.ts";

const WORDS = [
  "123456",
  "password",
  "qwerty",
  "secret",
  "jwt-secret",
  "azerty",
  "soleil",
  "changeme",
  "admin",
  "azerty123",
  "motdepasse",
];

export function jwt(props, fig, ctx) {
  if (!(window.crypto && crypto.subtle)) return null;
  const serverSecret = String(props.secret || "azerty123");
  let payload0;
  try {
    payload0 = JSON.parse(props.payload || "{}");
  } catch {
    payload0 = {};
  }
  if (!Object.keys(payload0).length)
    payload0 = { sub: "j.martin", role: "user", exp: 1764028800 };
  const words = props.liste
    ? String(props.liste)
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean)
    : WORDS;
  if (!words.includes(serverSecret) && !props.liste) words.push(serverSecret);
  let origSig = "";
  let lastToken = "";

  const tokenBox = el("div", { class: "cy-jwt-token", "aria-live": "polite" });
  const ta = el("textarea", {
    class: "cy-jwt-ta",
    spellcheck: "false",
    "aria-label": "Charge utile du jeton (JSON)",
  });
  ta.value = JSON.stringify(payload0, null, 2);
  const alg = el("select", { class: "w-input", "aria-label": "Algorithme" }, [
    el("option", { value: "HS256" }, ["HS256"]),
    el("option", { value: "none" }, ["none"]),
  ]);
  const secret = el("input", {
    class: "w-input w-mono",
    placeholder: "vide : signature d'origine",
    "aria-label": "Re-signer avec ce secret",
    spellcheck: "false",
  });
  const none = el("input", {
    type: "checkbox",
    checked: /^(oui|1|true)$/i.test(props["none-accepte"] || ""),
  });
  const log = el("p", { class: "cy-jwt-log", "aria-live": "polite" });
  const note = el("p", { class: "w-note", "aria-live": "polite" });

  async function draw() {
    let payload;
    try {
      payload = JSON.parse(ta.value);
    } catch {
      note.replaceChildren(
        el("span", { class: "cy-verdict is-ko" }, ["JSON invalide"]),
        " Vérifiez les guillemets et les virgules.",
      );
      return;
    }
    const header = { alg: alg.value, typ: "JWT" };
    let token = await signJwt(
      header,
      payload,
      alg.value === "none" ? null : secret.value || "",
    );
    if (alg.value !== "none" && !secret.value)
      token = token.replace(/[^.]*$/, origSig);
    lastToken = token;
    const [h, p, s] = token.split(".");
    tokenBox.replaceChildren(
      el("span", { class: "cy-jwt-h" }, [h]),
      ".",
      el("span", { class: "cy-jwt-p" }, [p]),
      ".",
      el("span", { class: "cy-jwt-s" }, [s]),
    );
    const r = await verifyJwt(token, serverSecret, none.checked);
    const admin = r.ok && r.payload.role === "admin";
    const v = (cls, t) => el("span", { class: "cy-verdict " + cls }, [t]);
    if (!r.ok) note.replaceChildren(v("is-ko", "Refusé"), ` ${r.why}.`);
    else if (admin)
      note.replaceChildren(
        v("is-flaw", "Accès admin"),
        r.via === "none"
          ? " Le serveur lit l'algorithme dans le jeton et saute la vérification. Parade : imposer l'algorithme côté serveur."
          : " Signature valide : vous connaissez le secret. Parade : un secret aléatoire de 256 bits, ou une signature asymétrique (RS256, EdDSA).",
      );
    else
      note.replaceChildren(
        v("is-ok", "Accepté"),
        ` rôle ${String(r.payload.role ?? "?")}.`,
      );
    ctx?.report({
      admin: admin ? 1 : 0,
      accepte: r.ok ? 1 : 0,
      none: alg.value === "none" ? 1 : 0,
    });
  }

  async function crack() {
    const parts = lastToken.split(".");
    if (!parts[2]) {
      log.textContent = "Il faut un jeton signé : repassez en HS256.";
      return;
    }
    const data = parts[0] + "." + parts[1];
    for (const w of words) {
      log.textContent = `hashcat -m 16500 jeton.txt rockyou.txt → « ${w} »…`;
      await new Promise((res) => setTimeout(res, 140));
      if ((await hs256(w, data)) === parts[2]) {
        log.replaceChildren(
          "Trouvé : ",
          el("b", {}, [w]),
          " (en vrai, moins d'une seconde sur un GPU). Mettez-le dans « Re-signer », puis passez role à admin.",
        );
        return;
      }
    }
    log.textContent =
      "Pas dans la liste : ce jeton n'a pas été signé avec un mot faible.";
  }

  for (const n of [ta, alg, secret, none]) n.addEventListener("input", draw);
  alg.addEventListener("change", draw);
  none.addEventListener("change", draw);
  const reset = () => {
    ta.value = JSON.stringify(payload0, null, 2);
    alg.value = "HS256";
    secret.value = "";
    log.textContent = "";
    draw();
  };

  signJwt({ alg: "HS256", typ: "JWT" }, payload0, serverSecret).then((t) => {
    origSig = t.split(".")[2];
    draw();
  });

  return el("div", { class: "w-root cy-jwt" }, [
    tokenBox,
    el("div", { class: "cy-jwt-cols" }, [
      el("label", { class: "cy-field" }, [
        el("span", {}, ["Charge utile (modifiable)"]),
        ta,
      ]),
      el("div", { class: "cy-jwt-side" }, [
        el("label", { class: "cy-field" }, [
          el("span", {}, ["Algorithme"]),
          alg,
        ]),
        el("label", { class: "cy-field" }, [
          el("span", {}, ["Re-signer avec le secret"]),
          secret,
        ]),
        el("label", { class: "sci-check" }, [
          none,
          " Le serveur accepte alg: none",
        ]),
      ]),
    ]),
    el("div", { class: "w-controls" }, [
      el("button", { type: "button", class: "w-btn sci-cta", onclick: crack }, [
        "Chercher le secret (hashcat)",
      ]),
      el("button", { type: "button", class: "w-btn", onclick: reset }, [
        "Jeton d'origine",
      ]),
    ]),
    log,
    note,
  ]);
}
