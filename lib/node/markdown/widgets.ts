// Widgets (```widget``` blocks), iso figures, data fallbacks, prix spans.

import { visit, SKIP } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import type { Root, Element, ElementContent } from "hast";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXTRA_WIDGETS } from "../../widgets-extra";
import { enrichWidget } from "../widget-data";
import { parsePrix, toEuros, formatEuros, IPC_LAST } from "../../prix";
import { hastText } from "./hast";

/** Widgets the site knows how to mount; anything else stays a code block. */
const WIDGETS = new Set([
  "ieee754",
  "complement2",
  "cache-locality",
  "subnet",
  "hash-avalanche",
  "encodage",
  "boutisme",
  "regex",
  "seuil",
  "complexite",
  "table-verite",
  "cadre-pile",
  "pipeline",
  "intervalle",
  "echiquier",
  "trapeze-vocalique",
  "punnett",
  "matrice-2d",
  "logistique",
  "theorie-jeux",
  "harmonie-vocalique",
  "ton",
  "racine-arabe",
  "abugida",
  "ordre-des-mots",
  "depistage",
  "pharmacocinetique",
  "cadrage",
  "tcl",
]);

/** Text shown before hydration and to readers without JavaScript. */
const WIDGET_FALLBACK: Record<string, string> = {
  ieee754: "Décomposition IEEE 754 d'un nombre flottant (nécessite JavaScript).",
  complement2: "Représentation en complément à deux (nécessite JavaScript).",
  "cache-locality":
    "Parcours d'un tableau et défauts de cache (nécessite JavaScript).",
  subnet: "Découpage d'une adresse IPv4 en réseau et hôte (nécessite JavaScript).",
  "hash-avalanche":
    "Effet d'avalanche d'une fonction de hachage (nécessite JavaScript).",
  encodage:
    "Un même texte dans ses différents encodages (nécessite JavaScript).",
  boutisme: "Disposition d'une valeur en mémoire (nécessite JavaScript).",
  regex: "Test d'une expression régulière (nécessite JavaScript).",
  seuil:
    "Seuil de décision, précision et rappel d'un classifieur (nécessite JavaScript).",
  complexite:
    "Croissance comparée des classes de complexité (nécessite JavaScript).",
  "table-verite": "Table de vérité d'une expression booléenne (nécessite JavaScript).",
  "cadre-pile": "Cadre de pile au fil d'un appel de fonction (nécessite JavaScript).",
  pipeline: "Pipeline d'instructions et aléas de données (nécessite JavaScript).",
  intervalle:
    "Comparaison audible entre gamme juste et tempérament égal (nécessite JavaScript).",
  echiquier: "Position d'échecs déroulée coup par coup (nécessite JavaScript).",
  "trapeze-vocalique":
    "Trapèze vocalique et traits articulatoires (nécessite JavaScript).",
  punnett: "Échiquier de Punnett d'un croisement (nécessite JavaScript).",
  "matrice-2d":
    "Une matrice 2×2 comme transformation du plan (nécessite JavaScript).",
  logistique: "Suite logistique et diagramme de bifurcation (nécessite JavaScript).",
  "theorie-jeux": "Matrice de gains et équilibres de Nash (nécessite JavaScript).",
  "harmonie-vocalique":
    "Harmonie vocalique turque appliquée aux suffixes (nécessite JavaScript).",
  ton: "Contours de hauteur et sandhi tonal (nécessite JavaScript).",
  "racine-arabe":
    "Famille de mots dérivés d'une racine trilitère (nécessite JavaScript).",
  abugida:
    "Composition d'une syllabe devanagari, consonne et signe vocalique (nécessite JavaScript).",
  "ordre-des-mots":
    "Ordre des constituants selon la langue (nécessite JavaScript).",
  depistage:
    "Valeur prédictive d'un test selon la prévalence (nécessite JavaScript).",
  pharmacocinetique:
    "Concentration plasmatique au fil des prises (nécessite JavaScript).",
  cadrage: "Mise en évidence de l'effet de cadrage (nécessite JavaScript).",
  tcl: "Théorème central limite, distribution des moyennes (nécessite JavaScript).",
};

/** Parses the `key: value` body of a widget block into a flat record. */
function widgetProps(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const m = /^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/**
 * ```widget:<name> blocks become a mount point that public/js/widgets.js
 * hydrates. The source stays ordinary fenced markdown so the vault keeps
 * working on its own: Obsidian shows a readable code block, and a reader
 * without JavaScript gets the fallback line rather than a hole in the page.
 *
 * Same shape as rehypeManim — recognise the language class, replace the <pre>.
 * An unknown widget name is left alone on purpose, so a typo shows up as a
 * visible code block instead of silently rendering nothing.
 */
export function rehypeWidgets(dir: string) {
  return async (tree: Root) => {
    const jobs: Promise<void>[] = [];
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index == null) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const classes =
        (code.properties?.className as string[] | undefined) ?? [];
      const cls = classes.find(
        (c) => typeof c === "string" && c.startsWith("language-widget:"),
      );
      if (!cls) return;
      const name = cls.slice("language-widget:".length);
      const extra = EXTRA_WIDGETS[name];
      if (!WIDGETS.has(name) && !extra) return;

      const props = widgetProps(hastText(code));
      const figure: Element = {
        type: "element",
        tagName: "figure",
        properties: {
          className: ["widget"],
          "data-widget": name,
          // Which pack bundle the loader fetches; absent for the original
          // library. Read by public/js/widgets-loader.js so that the note
          // bundle every page downloads needn't carry the widget registry.
          // `echiquier` is drawn by the data pack (the board of /echecs/),
          // except its star hunt (`etoiles:`), which keeps the old library.
          "data-pack": extra?.pack ?? (name === "echiquier" && !props.etoiles ? "data" : undefined),
          "data-props": JSON.stringify(props),
          "data-pagefind-ignore": true,
        },
        children: [
          {
            type: "element",
            tagName: "p",
            properties: { className: ["widget-fallback"] },
            children: [
              {
                type: "text",
                value: WIDGET_FALLBACK[name] ?? extra?.fallback ?? "Widget.",
              },
            ],
          },
        ],
      };
      parent.children[index] = figure;
      // Data widgets (lib/node/widget-data.ts) get their numbers now, at build:
      // OWID / Wikidata from the on-disk cache or the network, the Insee and
      // Lichess snapshots from lib/data/. The no-JS fallback becomes a table
      // of the same numbers when there is one.
      // Two language widgets read the vault too: minimal pairs resolve their
      // note-relative clips, the language tree lists the language folders.
      if (extra) {
        jobs.push(
          enrichWidget(name, props, { dir }).then((d) => {
            if (!d) return;
            figure.properties["data-props"] = JSON.stringify(d.props);
            if (d.error) {
              figure.children = [
                {
                  type: "element",
                  tagName: "p",
                  properties: { className: ["widget-fallback"] },
                  children: [{ type: "text", value: d.error }],
                },
              ];
              figure.properties["data-error"] = "";
            } else if (d.table) {
              figure.children.push(fallbackTable(d.table));
            }
          }),
        );
      }
    });
    await Promise.all(jobs);
  };
}

/**
 * ```iso:<name>``` → an isometric figure (figures/<name>/, built into
 * public/figures/ by scripts/build-figures.mjs before `next build`).
 *
 * The plate (card, SVG, legend, caption) is inlined here, so the drawing is in
 * the page from the first paint and reads without JavaScript; the note bundle
 * (public/js/iso-figures.js) then imports /figures/<name>.js to make it move.
 * The kit's stylesheet is linked once, just before the first figure of the
 * note. A name with no built plate keeps a one-line fallback, like a widget.
 */
const ISO_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isoPlates = new Map<string, string | null>();
function isoPlate(name: string): string | null {
  if (!isoPlates.has(name)) {
    let html: string | null = null;
    try {
      html = readFileSync(join(process.cwd(), "public", "figures", `${name}.html`), "utf8");
    } catch {
      html = null;
    }
    isoPlates.set(name, html);
  }
  return isoPlates.get(name) ?? null;
}

export function rehypeIsoFigures() {
  return (tree: Root) => {
    let linked = false;
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || !parent || index == null) return;
      const code = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "code",
      );
      if (!code) return;
      const classes = (code.properties?.className as string[] | undefined) ?? [];
      const cls = classes.find((c) => typeof c === "string" && c.startsWith("language-iso:"));
      if (!cls) return;
      const name = cls.slice("language-iso:".length);
      const plate = ISO_NAME.test(name) ? isoPlate(name) : null;
      const children: ElementContent[] = [];
      if (plate && !linked) {
        children.push({
          type: "element",
          tagName: "link",
          properties: { rel: ["stylesheet"], href: "/figures/iso.css" },
          children: [],
        });
        linked = true;
      }
      if (plate) {
        children.push(...(fromHtml(plate, { fragment: true }).children as ElementContent[]));
      } else {
        children.push({
          type: "element",
          tagName: "p",
          properties: { className: ["widget-fallback"] },
          children: [{ type: "text", value: "Figure interactive indisponible." }],
        });
      }
      parent.children[index] = {
        type: "element",
        tagName: "div",
        properties: {
          className: ["iso", "iso-mount"],
          "data-iso": plate ? name : undefined,
          // The light plate ships; iso-figures.js follows the site's theme.
          "data-theme": "light",
          "data-pagefind-ignore": true,
        },
        children,
      };
      return SKIP;
    });
  };
}

/** A plain <table> of a data widget's numbers, for readers without JS. */
function fallbackTable(rows: string[][]): Element {
  const cell = (tag: "th" | "td", v: string): Element => ({
    type: "element",
    tagName: tag,
    properties: {},
    children: [{ type: "text", value: v }],
  });
  return {
    type: "element",
    tagName: "table",
    properties: { className: ["widget-fallback-table"] },
    children: [
      {
        type: "element",
        tagName: "thead",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "tr",
            properties: {},
            children: rows[0].map((v) => cell("th", v)),
          },
        ],
      },
      {
        type: "element",
        tagName: "tbody",
        properties: {},
        children: rows.slice(1).map((r) => ({
          type: "element",
          tagName: "tr",
          properties: {},
          children: r.map((v, i) => cell(i ? "td" : "th", v)),
        })),
      },
    ],
  };
}

/**
 * Inline `prix: 300 francs 1950` code spans (lib/prix.ts) become the amount as
 * written, underlined, with its worth in today's euros worked out here at
 * build. public/js/widgets-data.js turns it into a button with a popover; the
 * title attribute carries the answer for readers without JavaScript.
 */
export function rehypePrix() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "code" || !parent || index == null) return;
      if ((parent as Element).tagName === "pre") return;
      const p = parsePrix(hastText(node));
      if (!p) return;
      const eur = toEuros(p.amount, p.unit, p.year);
      parent.children[index] = {
        type: "element",
        tagName: "span",
        properties: {
          className: ["prix"],
          "data-eur": formatEuros(eur),
          "data-year": String(p.year),
          "data-unit": p.unit,
          "data-to": String(IPC_LAST),
          title: `≈ ${formatEuros(eur)} de ${IPC_LAST} (pouvoir d'achat, Insee)`,
        },
        children: [{ type: "text", value: p.label }],
      };
    });
  };
}
