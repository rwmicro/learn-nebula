// arbre-langues: the family tree of the garden's languages, following
// Familles-Linguistiques.md (names from meme-mot). A language with a
// folder in the vault is marked and links to its theme page; which folders
// exist is read at build (lib/widget-data.ts arbreLangues), so a new language
// folder shows up without touching this file.
//
// Props (from the build): have: [{ label: folder name, href|null }]
import { el, svg, drawWidth } from "../widget-kit.js";
import { LANG } from "./meme-mot.js";

// Language code → vault folder name under "Languages - Dialects".
const FOLDER = {
  en: "Anglais", de: "Allemand", es: "Espagnol", ro: "Roumain", hi: "Hindi", tr: "Turc", az: "Azéri",
  ug: "Ouighour", zh: "Mandarin", hak: "Hakka-Khek", id: "Indonésien", ms: "Malais", sbs: "Sambas",
  ta: "Tamoul", ar: "Arabe", lb: "Arabe", ary: "Darija", kab: "Kabyle", tpi: "Tok Pisin",
};
const NAME = { ...LANG, ar: "Littéraire", lb: "Libanais", ary: "Darija", tpi: "Tok Pisin (créole)" };

const leaf = (code, children) => ({ name: NAME[code] || code, code, children });
/** The tree of the mockup: a language that gave birth to another carries it
 *  (English → Tok Pisin), Arabic gathers its varieties, and a family with a
 *  single branch skips the branch level. */
function tree() {
  return {
    name: "Langues",
    children: [
      { name: "Indo-européennes", children: [
        { name: "Germaniques", children: [leaf("de"), leaf("en", [leaf("tpi")])] },
        { name: "Romanes", children: [leaf("es"), leaf("ro")] },
        { name: "Indo-aryennes", children: [leaf("hi")] },
      ] },
      { name: "Afro-asiatiques", children: [
        { name: "Sémitiques", children: [{ name: "Arabe", code: "ar-all", children: [leaf("ar"), leaf("lb"), leaf("ary")] }] },
        { name: "Berbères", children: [leaf("kab")] },
      ] },
      { name: "Turciques", children: [leaf("tr"), leaf("az"), leaf("ug")] },
      { name: "Austronésiennes", children: [{ name: "Malaïques", children: [leaf("ms"), leaf("id"), leaf("sbs")] }] },
      { name: "Sino-tibétaines", children: [leaf("zh"), leaf("hak")] },
      { name: "Dravidiennes", children: [leaf("ta")] },
    ],
  };
}
FOLDER["ar-all"] = "Arabe";

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
  const out = el("p", { class: "w-result", "aria-live": "polite" }, ["Clique une langue en vert."]);
  const plot = el("div", { class: "w-plot-wrap w-scroll-x" });
  const all = (n) => [n, ...(n.children || []).flatMap(all)];
  const count = new Set(all(root).map((n) => FOLDER[n.code]).filter((f) => f && have.has(f))).size;

  function draw() {
    plot.replaceChildren();
    const W = Math.max(520, drawWidth(fig, 720));
    const rowH = 20;
    const H = leaves.length * rowH + 16;
    const m = { l: 62, r: 130 };
    const col = (d) => m.l + (d / maxDepth) * (W - m.l - m.r);
    leaves.forEach((l, i) => (l.y = 10 + i * rowH + rowH / 2));
    (function place(n) {
      if (n.children) {
        n.children.forEach(place);
        n.y = (n.children[0].y + n.children.at(-1).y) / 2;
      }
      n.x = col(n.depth);
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
      const mine = have.has(FOLDER[n.code]);
      const href = mine ? have.get(FOLDER[n.code]) : null;
      s.appendChild(svg("circle", { cx: n.x, cy: n.y, r: mine ? 4 : 2.5, fill: mine ? "var(--garden, var(--link))" : "var(--muted)" }));
      // Leaves are named after their dot; inner nodes above it, the root before it.
      const pos = !n.children
        ? { x: n.x + 7, y: n.y + 4, a: "start" }
        : n === root
          ? { x: n.x - 7, y: n.y + 4, a: "end" }
          : { x: n.x - 4, y: n.y - 6, a: mine ? "middle" : "end" };
      const t = svg("text", { class: "w-label l-tree" + (mine ? " is-mine" : ""), x: pos.x, y: pos.y, "text-anchor": pos.a });
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
      s.appendChild(t);
      (n.children || []).forEach(nodes);
    })(root);
    plot.appendChild(s);
  }
  const families = root.children.length;
  const node = el("div", { class: "w-root" }, [
    el("p", { class: "w-chart-title" }, [`Tes ${count} langues appartiennent à ${families} familles`]),
    el("p", { class: "w-chart-sub" }, ["En vert, les langues qui ont un dossier dans le jardin. Clique une langue pour voir son dossier."]),
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
