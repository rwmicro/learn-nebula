// arbre-langues: the family tree of the garden's languages, drawn from the
// same families as meme-mot (Familles-Linguistiques.md). A language with a
// folder in the vault is marked and links to its theme page; which folders
// exist is read at build (lib/widget-data.ts arbreLangues), so a new language
// folder shows up without touching this file.
//
// Props (from the build): have: [{ label: folder name, href|null }]
import { el, svg, drawWidth } from "../widget-kit.js";
import { FAMILIES, LANG } from "./meme-mot.js";

// Language code → vault folder name under "Languages - Dialects".
const FOLDER = {
  en: "Anglais", de: "Allemand", es: "Espagnol", ro: "Roumain", hi: "Hindi", tr: "Turc", az: "Azéri",
  ug: "Ouighour", zh: "Mandarin", hak: "Hakka-Khek", id: "Indonésien", ms: "Malais", sbs: "Sambas",
  ta: "Tamoul", ar: "Arabe", lb: "Arabe", ary: "Darija", kab: "Kabyle", tpi: "Tok Pisin",
};
const NAME = { ...LANG, ary: "Darija", lb: "Arabe libanais" };

/** FAMILIES with Darija beside Lebanese Arabic: meme-mot has no Darija words. */
function tree() {
  return {
    name: "Langues du jardin",
    children: FAMILIES.map((f) => ({
      name: f.name,
      children: f.branches.flatMap(([b, codes]) => {
        const all = b === "Sémitiques" ? [...codes, "ary"] : codes;
        const leaves = all.map((c) => ({ name: NAME[c] || c, code: c }));
        return b ? [{ name: b, children: leaves }] : leaves;
      }),
    })),
  };
}

export function arbreLangues(props, fig) {
  const have = new Map((props.have || []).map((h) => [h.label, h.href]));
  const root = tree();
  const leaves = [];
  (function walk(n, depth) {
    n.depth = depth;
    if (n.children) n.children.forEach((c) => walk(c, depth + 1));
    else leaves.push(n);
  })(root, 0);
  const maxDepth = Math.max(...leaves.map((l) => l.depth));
  const out = el("p", { class: "w-result", "aria-live": "polite" }, ["Touche une langue en vert pour ouvrir son dossier."]);
  const plot = el("div", { class: "w-plot-wrap w-scroll-x" });
  const count = leaves.filter((l) => have.has(FOLDER[l.code])).length;

  function draw() {
    plot.replaceChildren();
    const W = Math.max(560, drawWidth(fig, 720));
    const rowH = 21;
    const H = leaves.length * rowH + 16;
    const m = { l: 8, r: 120 };
    const col = (d) => m.l + (d / maxDepth) * (W - m.l - m.r);
    leaves.forEach((l, i) => (l.y = 10 + i * rowH + rowH / 2));
    (function place(n) {
      if (n.children) {
        n.children.forEach(place);
        n.y = (n.children[0].y + n.children.at(-1).y) / 2;
      }
      n.x = n.children ? col(n.depth) : col(maxDepth);
    })(root);
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Arbre des langues : ${count} langues du jardin` });
    s.style.minWidth = W + "px";
    (function links(n) {
      for (const c of n.children || []) {
        const mx = (n.x + c.x) / 2;
        s.appendChild(svg("path", { d: `M${n.x},${n.y}C${mx},${n.y} ${mx},${c.y} ${c.x},${c.y}`, fill: "none", stroke: "var(--rule-strong)" }));
        links(c);
      }
    })(root);
    (function nodes(n) {
      const mine = !n.children && have.has(FOLDER[n.code]);
      const href = mine ? have.get(FOLDER[n.code]) : null;
      s.appendChild(svg("circle", { cx: n.x, cy: n.y, r: mine ? 4.5 : 3, fill: mine ? "var(--garden, var(--link))" : "var(--rule-strong)" }));
      const t = svg("text", {
        class: "w-label l-tree" + (mine ? " is-mine" : ""),
        x: n.children ? n.x - 7 : n.x + 8,
        y: n.children && n.depth ? n.y - 6 : n.y + 4,
        "text-anchor": n.children ? "end" : "start",
      });
      t.textContent = n.name;
      if (mine) {
        t.setAttribute("tabindex", "0");
        t.setAttribute("role", "link");
        const go = () => {
          const path = [];
          for (let p = parentOf(root, n); p && p !== root; p = parentOf(root, p)) path.unshift(p.name);
          out.replaceChildren(
            el("b", {}, [n.name]),
            ` · ${path.join(" › ")} · `,
            href ? el("a", { href }, [`dossier ${FOLDER[n.code]}`]) : `dossier ${FOLDER[n.code]}`,
          );
        };
        t.addEventListener("click", go);
        t.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
      }
      if (n !== root) s.appendChild(t); // the root's name is the title's job
      (n.children || []).forEach(nodes);
    })(root);
    plot.appendChild(s);
  }
  const families = root.children.length;
  const node = el("div", { class: "w-root" }, [
    el("p", { class: "w-chart-title" }, [`${count} langues du jardin, ${families} familles`]),
    el("p", { class: "w-chart-sub" }, ["En vert, les langues qui ont un dossier dans le jardin."]),
    plot,
    out,
  ]);
  node.onMount = draw;
  return node;
}

function parentOf(root, target) {
  for (const c of root.children || []) {
    if (c === target) return root;
    const p = parentOf(c, target);
    if (p) return p;
  }
  return null;
}
