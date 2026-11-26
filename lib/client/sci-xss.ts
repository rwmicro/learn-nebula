// Analysis behind the "xss-dom" widget (public/js/sci/xss-dom.js). The widget
// parses the reader's text with DOMParser — an inert document: no script
// runs, no image loads — copies the result into the plain tree below, and
// never puts it in the page. This module only reads that tree and says which
// parts would run code if the same string went through element.innerHTML.

export type Noeud =
  | {
      type: "element";
      tag: string;
      attrs: [string, string][];
      enfants: Noeud[];
    }
  | { type: "texte"; texte: string }
  | { type: "commentaire"; texte: string };

export type Danger = "gestionnaire" | "script" | "url-js" | "cadre";

export interface Constat {
  danger: Danger;
  /** Where: "img", "a[href]", "img[onerror]"… */
  ou: string;
  detail: string;
  /** Would this run on its own once inserted with innerHTML? */
  executeSeul: boolean;
}

/** Attributes whose value is a URL the browser may navigate to or load. */
const ATTR_URL = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "data",
  "poster",
]);
const TAGS_CADRE = new Set(["iframe", "frame", "object", "embed"]);

/**
 * True for javascript:, vbscript: and data:text/html URLs, the way a browser
 * reads them: ASCII whitespace and control characters inside the scheme are
 * ignored and the scheme is case-insensitive ("JaVa\tScRipt:" counts).
 */
export function urlDangereuse(v: string): boolean {
  let s = "";
  for (const ch of v) if (ch.charCodeAt(0) > 0x20) s += ch.toLowerCase();
  return (
    s.startsWith("javascript:") ||
    s.startsWith("vbscript:") ||
    s.startsWith("data:text/html")
  );
}

export function attributDangereux(nom: string, valeur: string): Danger | null {
  const n = nom.toLowerCase();
  if (/^on[a-z]+$/.test(n)) return "gestionnaire";
  if (ATTR_URL.has(n) && urlDangereuse(valeur)) return "url-js";
  if (n === "srcdoc") return "cadre";
  return null;
}

/** Events that fire without the reader doing anything once the element is in
 *  the page (an image that fails to load, an SVG that loads, autofocus…). */
const AUTO = new Set([
  "onerror",
  "onload",
  "onanimationstart",
  "ontransitionend",
  "onbegin",
  "ontoggle",
]);

export function analyser(noeuds: Noeud[]): Constat[] {
  const out: Constat[] = [];
  const visit = (n: Noeud) => {
    if (n.type !== "element") return;
    const tag = n.tag.toLowerCase();
    if (tag === "script") {
      out.push({
        danger: "script",
        ou: "script",
        detail:
          "Un <script> inséré par innerHTML ne s'exécute pas (le standard HTML l'interdit), mais le même texte passé à document.write ou à une bibliothèque qui recrée les scripts, si.",
        executeSeul: false,
      });
    }
    if (TAGS_CADRE.has(tag)) {
      out.push({
        danger: "cadre",
        ou: tag,
        detail:
          "Un cadre ou un objet embarqué peut charger une page ou un document arbitraire.",
        executeSeul: false,
      });
    }
    for (const [nom, valeur] of n.attrs) {
      const d = attributDangereux(nom, valeur);
      if (!d) continue;
      const lower = nom.toLowerCase();
      if (d === "gestionnaire") {
        const auto =
          AUTO.has(lower) ||
          (lower === "onfocus" &&
            n.attrs.some(([a]) => a.toLowerCase() === "autofocus"));
        out.push({
          danger: d,
          ou: `${tag}[${lower}]`,
          detail: auto
            ? `Le gestionnaire ${lower} se déclenche tout seul : le code « ${valeur} » s'exécuterait dès l'insertion.`
            : `Le gestionnaire ${lower} exécuterait « ${valeur} » au premier geste du lecteur (clic, survol…).`,
          executeSeul: auto,
        });
      } else if (d === "url-js") {
        out.push({
          danger: d,
          ou: `${tag}[${lower}]`,
          detail: `L'URL « ${valeur} » exécute du code au lieu d'ouvrir une page${tag === "a" ? ", dès qu'on clique sur le lien" : ""}.`,
          executeSeul: false,
        });
      } else {
        out.push({
          danger: d,
          ou: `${tag}[${lower}]`,
          detail:
            "srcdoc fournit une page HTML entière au cadre, scripts compris.",
          executeSeul: true,
        });
      }
    }
    n.enfants.forEach(visit);
  };
  noeuds.forEach(visit);
  return out;
}

/** Number of element nodes, to tell plain text from markup. */
export function compterElements(noeuds: Noeud[]): number {
  let c = 0;
  const visit = (n: Noeud) => {
    if (n.type !== "element") return;
    c++;
    n.enfants.forEach(visit);
  };
  noeuds.forEach(visit);
  return c;
}
