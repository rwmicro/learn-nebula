// Headings: explicit ids, hand-typed numbers dropped, the outline (section
// numbers, the dropcap paragraph, the fleuron).

import { visit } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import { FLEURON } from "../../deco-art";
import type { Root, Element, ElementContent, RootContent } from "hast";


/** Pull explicit `{#id}` ids out of heading text (Hugo/goldmark syntax). */
export function rehypeHeadingIds() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const last = node.children[node.children.length - 1];
      if (last && last.type === "text") {
        const m = last.value.match(/\s*\{#([^}]+)\}\s*$/);
        if (m) {
          node.properties = node.properties ?? {};
          node.properties.id = m[1];
          last.value = last.value.slice(0, m.index).trimEnd();
        }
      }
    });
  };
}

/** A hand-written heading number: "1.", "2)", "1.1", "1.2.3 ", "IV." —
 *  followed by a space and the title itself. */
const HAND_NUMBER = /^\s*(?:\d+(?:\.\d+)+\.?|\d+[.)]|[IVXLC]+[.)])\s+(?=\S)/;

/** Drops the numbers rehypeOutline flagged (`data-hand-number`) from the
 *  heading's first text, once its id is set. */
export function rehypeDropHandNumbers() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (!/^h[2-4]$/.test(node.tagName) || node.properties.dataHandNumber == null) return;
      delete node.properties.dataHandNumber;
      let done = false;
      const strip = (n: ElementContent) => {
        if (done) return;
        if (n.type === "text") {
          if (!n.value.trim()) return;
          n.value = n.value.replace(HAND_NUMBER, "");
          done = true;
        } else if (n.type === "element") n.children.forEach(strip);
      };
      node.children.forEach(strip);
    });
  };
}

function slugText(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  );
}

function textOf(node: ElementContent | RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(textOf).join("");
  return "";
}

/**
 * The note's outline, made legible:
 * - a note whose sections are `###` (no `##` anywhere) gets them one level up,
 *   so its sections read as sections (and the phone's section pill, which
 *   follows h2, finds them);
 * - a paragraph that is only bold text and opens a list ("**Évolution**" then
 *   bullets) is a lead-in, not body text: `.lead-in`, styled as a label, and
 *   never the paragraph that gets the dropcap; under a section it gets an id
 *   (`s-évolution` → `s-evolution`), so the left rail can list it;
 * - two sections or more are numbered i., ii.… in the
 *   margin (`.sec-n`, a CSS counter), in place of any hand-written "1.".
 */
export function rehypeOutline() {
  return (tree: Root) => {
    let h2 = false;
    let h3 = false;
    visit(tree, "element", (node: Element) => {
      if (node.tagName === "h2") h2 = true;
      else if (node.tagName === "h3") h3 = true;
    });
    if (!h2 && h3) {
      visit(tree, "element", (node: Element) => {
        const m = /^h([3-6])$/.exec(node.tagName);
        if (m) node.tagName = `h${Number(m[1]) - 1}`;
      });
    }

    const kids = tree.children;
    const next = (i: number) => {
      for (let j = i + 1; j < kids.length; j++) {
        const k = kids[j];
        if (k.type === "element") return k;
        if (k.type === "text" && k.value.trim()) return null;
      }
      return null;
    };
    const sections: Element[] = [];
    const leadIds = new Set<string>();
    kids.forEach((node, i) => {
      if (node.type !== "element") return;
      if (node.tagName === "h2") sections.push(node);
      if (node.tagName !== "p") return;
      const els = node.children.filter((c) => c.type === "element");
      const loose = node.children.some((c) => c.type === "text" && c.value.trim());
      const after = next(i);
      if (
        els.length === 1 &&
        (els[0] as Element).tagName === "strong" &&
        !loose &&
        after &&
        (after.tagName === "ul" || after.tagName === "ol")
      ) {
        const cls = node.properties.className;
        node.properties.className = [...(Array.isArray(cls) ? cls : []), "lead-in"];
        // Inside a section, an anchor: the left rail lists it under its
        // section (buildToc, lib/node/html.ts).
        if (sections.length && node.properties.id == null) {
          const base = `s-${slugText(textOf(node))}`;
          let id = base;
          for (let n = 2; leadIds.has(id); n++) id = `${base}-${n}`;
          leadIds.add(id);
          node.properties.id = id;
        }
      }
    });
    // The dropcap goes to the paragraph the note opens on: past headings and
    // pictures, but not past a list, a lead-in or a callout — a note that
    // opens on bullets has no opening paragraph, and a letter dropped into
    // its third block read as a glitch.
    for (const node of kids) {
      if (node.type !== "element") continue;
      if (/^h[1-6]$|^hr$|^figure$/.test(node.tagName)) continue;
      if (node.tagName === "p") {
        const text = textOf(node).trim();
        if (!text) continue;
        const cls = node.properties.className;
        if (!(Array.isArray(cls) && cls.includes("lead-in"))) {
          node.properties.className = [...(Array.isArray(cls) ? cls : []), "dropcap"];
        }
      }
      break;
    }
    // Numbered by hand ("1. Intro", "1.1 Détail") or not, every note reads
    // the same: the margin's i., ii.… (audit UI 2026-11-10 — a note with its
    // own "1." beside one with "i." in the margin read as two systems). The
    // author's numbers are only flagged here and dropped by
    // rehypeDropHandNumbers, after rehypeSlug, so the ids (and every link to
    // "#1-intro") stay what they were.
    if (sections.length >= 2) {
      const byHand = sections.some((h) => HAND_NUMBER.test(textOf(h)));
      for (const h of sections) {
        const cls = h.properties.className;
        h.properties.className = [...(Array.isArray(cls) ? cls : []), "sec-n"];
      }
      if (byHand) {
        visit(tree, "element", (node: Element) => {
          if (/^h[2-4]$/.test(node.tagName) && HAND_NUMBER.test(textOf(node))) node.properties.dataHandNumber = "";
        });
      }
    }
    // A small fleuron (lib/deco-art.ts) between two sections: before each
    // section heading that follows some text, never above the first one.
    for (const h of sections.slice(1)) {
      const i = kids.indexOf(h);
      let j = i - 1;
      while (j >= 0 && kids[j].type === "text" && !(kids[j] as { value: string }).value.trim()) j--;
      const prev = kids[j];
      if (!prev || prev.type !== "element" || /^h[1-6]$|^hr$/.test(prev.tagName)) continue;
      kids.splice(i, 0, {
        type: "element",
        tagName: "div",
        properties: { className: ["sec-fleuron", "deco"], ariaHidden: "true" },
        children: fromHtml(FLEURON, { fragment: true }).children as ElementContent[],
      });
    }
  };
}
