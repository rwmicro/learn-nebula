// Widget "xss-dom": a fake search box whose text is shown as textContent
// would show it, next to the DOM innerHTML WOULD build from it.
//
// Safety: the reader's string is never assigned to innerHTML, outerHTML,
// insertAdjacentHTML or document.write on this page. It is parsed by
// DOMParser, whose document is inert (no browsing context: scripts do not run,
// images do not load, event handlers never fire), copied into plain objects,
// and everything shown is built with createElement + textContent.
import { el } from "../widget-kit.js";
import {
  analyser,
  attributDangereux,
  compterElements,
} from "../../../lib/sci-xss.ts";

const PRESETS = [
  ["Texte", "chaussures de randonnée"],
  ["Gras", "<b>gras</b>"],
  ["Image piégée", "<img src=x onerror=alert(1)>"],
  ["Lien javascript:", '<a href="javascript:alert(1)">lien</a>'],
  ["Script", "<script>alert(1)</script>"],
  ["SVG", "<svg onload=alert(1)>"],
];

/** Inert parse into plain objects (see the header). */
function parse(src) {
  const doc = new DOMParser().parseFromString(
    "<!doctype html><body>" + src,
    "text/html",
  );
  const conv = (n) => {
    if (n.nodeType === 3) return { type: "texte", texte: n.nodeValue };
    if (n.nodeType === 8) return { type: "commentaire", texte: n.nodeValue };
    if (n.nodeType !== 1) return null;
    // <template> keeps its children in .content
    const kids =
      n.localName === "template" ? n.content.childNodes : n.childNodes;
    return {
      type: "element",
      tag: n.localName,
      attrs: [...n.attributes].map((a) => [a.name, a.value]),
      enfants: [...kids].map(conv).filter(Boolean),
    };
  };
  return [...doc.body.childNodes].map(conv).filter(Boolean);
}

/** The tree drawn as indented markup, dangerous parts marked. */
function arbre(noeuds) {
  const lines = [];
  const walk = (n, depth) => {
    const pad = "  ".repeat(depth);
    if (n.type === "texte") {
      if (n.texte.trim())
        lines.push(
          el("div", { class: "sci-tree-l" }, [
            pad,
            el("span", { class: "sci-tree-text" }, ["« " + n.texte + " »"]),
            el("span", { class: "sci-tree-k" }, ["  texte"]),
          ]),
        );
      return;
    }
    if (n.type === "commentaire") {
      lines.push(
        el("div", { class: "sci-tree-l" }, [
          pad,
          el("span", { class: "sci-tree-k" }, ["<!-- " + n.texte + " -->"]),
        ]),
      );
      return;
    }
    const tagBad = ["script", "iframe", "frame", "object", "embed"].includes(
      n.tag,
    );
    const open = [
      pad,
      el("span", { class: "sci-tree-tag" + (tagBad ? " is-bad" : "") }, [
        "<" + n.tag,
      ]),
    ];
    for (const [name, value] of n.attrs) {
      const bad = attributDangereux(name, value);
      open.push(
        " ",
        el("span", { class: "sci-tree-attr" + (bad ? " is-bad" : "") }, [
          name + '="' + value + '"',
        ]),
      );
    }
    open.push(
      el("span", { class: "sci-tree-tag" + (tagBad ? " is-bad" : "") }, [">"]),
    );
    lines.push(el("div", { class: "sci-tree-l" }, open));
    n.enfants.forEach((c) => walk(c, depth + 1));
    const voids = [
      "img",
      "br",
      "hr",
      "input",
      "meta",
      "link",
      "source",
      "area",
      "base",
      "col",
      "embed",
      "track",
      "wbr",
    ];
    if (!voids.includes(n.tag))
      lines.push(
        el("div", { class: "sci-tree-l" }, [
          pad,
          el("span", { class: "sci-tree-tag" + (tagBad ? " is-bad" : "") }, [
            "</" + n.tag + ">",
          ]),
        ]),
      );
  };
  noeuds.forEach((n) => walk(n, 0));
  return lines;
}

export function xssDom(props) {
  const input = el("input", {
    type: "search",
    class: "w-input sci-xss-in",
    value: props.texte || "<img src=x onerror=alert(1)>",
    "aria-label": "texte recherché",
    autocomplete: "off",
    spellcheck: "false",
  });
  const safe = el("div", { class: "sci-xss-safe" });
  const tree = el("div", { class: "sci-xss-tree w-mono" });
  const report = el("div", { class: "sci-xss-report" });

  function draw() {
    const src = input.value;
    // Safe pane: exactly what textContent does.
    safe.replaceChildren(
      el("span", { class: "w-hint" }, ["Résultats pour : "]),
      el("strong", {}, []),
    );
    safe.lastChild.textContent = src;

    const noeuds = parse(src);
    const lines = arbre(noeuds);
    tree.replaceChildren(
      ...(lines.length ? lines : [el("div", { class: "w-hint" }, ["(rien)"])]),
    );
    const f = analyser(noeuds);
    const nEl = compterElements(noeuds);
    report.replaceChildren(
      f.length
        ? el("p", { class: "w-verdict w-ko" }, [
            f.some((x) => x.executeSeul)
              ? "Faille : du code s'exécuterait dès l'affichage."
              : "Faille : du code pourrait s'exécuter.",
          ])
        : el("p", { class: "w-verdict w-ok" }, [
            nEl
              ? "Pas de code exécutable ici, mais la page est quand même modifiable par l'utilisateur."
              : "Texte simple : innerHTML et textContent donnent le même résultat.",
          ]),
      f.length
        ? el(
            "ul",
            { class: "sci-xss-list" },
            f.map((x) =>
              el("li", {}, [el("code", {}, [x.ou]), " — " + x.detail]),
            ),
          )
        : null,
    );
  }
  input.addEventListener("input", draw);

  const presets = PRESETS.map(([label, value]) =>
    el(
      "button",
      {
        type: "button",
        class: "w-btn",
        onclick: () => {
          input.value = value;
          draw();
        },
      },
      [label],
    ),
  );

  draw();
  return el("div", { class: "w-root sci-xss" }, [
    el("label", { class: "sci-xss-search" }, [
      el("span", { class: "w-hint" }, ["Recherche"]),
      input,
    ]),
    el("div", { class: "w-controls" }, [
      el("span", { class: "w-hint" }, ["Essaie :"]),
      ...presets,
    ]),
    el("div", { class: "sci-xss-panes" }, [
      el("section", {}, [
        el("h4", { class: "sci-sub" }, ["résultat.textContent = saisie"]),
        safe,
        el("p", { class: "w-hint" }, [
          "Le texte est affiché tel quel : les chevrons restent des caractères.",
        ]),
      ]),
      el("section", {}, [
        el("h4", { class: "sci-sub" }, [
          "résultat.innerHTML = saisie construirait :",
        ]),
        tree,
        el("p", { class: "w-hint" }, [
          "Vue inerte : ce DOM n'est jamais inséré dans la page. En rouge, ce qui exécuterait du code.",
        ]),
      ]),
    ]),
    report,
    el("p", { class: "w-note" }, [
      "innerHTML demande au navigateur d'interpréter la chaîne comme du HTML : si elle vient de l'utilisateur (ici le champ de recherche, ailleurs l'URL ou un commentaire), il peut y glisser des balises et des attributs. Un <script> inséré ainsi ne s'exécute pas, mais un gestionnaire d'événement comme onerror ou onload, si, et sans aucun clic dans le cas d'une image cassée. C'est une XSS basée sur le DOM : la faille est entièrement dans le JavaScript de la page. Le remède : textContent (ou createElement) dès qu'on affiche du texte ; si l'on doit vraiment insérer du HTML venu d'ailleurs, le passer par un assainisseur (DOMPurify, ou setHTML() de l'API Sanitizer là où elle existe) ; et en défense en profondeur, une CSP sans 'unsafe-inline' bloque les gestionnaires inline, et Trusted Types (require-trusted-types-for 'script') fait refuser au navigateur toute chaîne brute passée à innerHTML.",
    ]),
  ]);
}
