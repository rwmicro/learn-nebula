// Widget "syllogisme": two premises and a conclusion over the terms S, M, P,
// drawn on a three-circle Venn diagram and checked by lib/sci-syllogism.ts.
import { el, svg } from "../widget-kit.js";
import {
  REGIONS,
  dans,
  diagramme,
  figure,
  nomDuMode,
  parseForme,
  regionsVisees,
  verifier,
} from "../../../lib/sci-syllogism.ts";
import { uid } from "./common.js";

// Diagram geometry (viewBox units).
const R = 66;
const CENTRES = { S: [112, 96], P: [188, 96], M: [150, 162] };
const VB = [300, 248];

/** Centre of each region, by sampling the box once. */
const CENTROIDES = (() => {
  const acc = REGIONS.map(() => [0, 0, 0]);
  for (let x = 0; x < VB[0]; x += 2)
    for (let y = 0; y < VB[1]; y += 2) {
      let r = 0;
      if ((x - CENTRES.S[0]) ** 2 + (y - CENTRES.S[1]) ** 2 < R * R) r |= 1;
      if ((x - CENTRES.M[0]) ** 2 + (y - CENTRES.M[1]) ** 2 < R * R) r |= 2;
      if ((x - CENTRES.P[0]) ** 2 + (y - CENTRES.P[1]) ** 2 < R * R) r |= 4;
      acc[r][0] += x;
      acc[r][1] += y;
      acc[r][2]++;
    }
  return acc.map(([x, y, n]) => [x / n, y / n]);
})();

/** Plural noun → singular, naively, for « Aucun X n'est Y ». */
const singulier = (s) =>
  s
    .split(" ")
    .map((w) =>
      w.length > 3 && /aux$/i.test(w)
        ? w.slice(0, -3) + "al"
        : w.length > 2 && /[sx]$/i.test(w)
          ? w.slice(0, -1)
          : w,
    )
    .join(" ");

const FORM_LABEL = {
  A: "Tous les … sont …",
  E: "Aucun … n'est …",
  I: "Quelques … sont …",
  O: "Quelques … ne sont pas …",
};

const PRESETS = [
  {
    nom: "Barbara",
    maj: ["A", "M", "P"],
    min: ["A", "S", "M"],
    c: "A",
    t: { S: "Grecs", M: "humains", P: "mortels" },
  },
  {
    nom: "Moyen terme non distribué",
    maj: ["A", "P", "M"],
    min: ["A", "S", "M"],
    c: "A",
    t: { S: "chiens", M: "mammifères", P: "chats" },
  },
  {
    nom: "Celarent",
    maj: ["E", "M", "P"],
    min: ["A", "S", "M"],
    c: "E",
    t: { S: "serpents", M: "reptiles", P: "mammifères" },
  },
  {
    nom: "Darii",
    maj: ["A", "M", "P"],
    min: ["I", "S", "M"],
    c: "I",
    t: { S: "animaux marins", M: "mammifères", P: "vertébrés" },
  },
  {
    nom: "Majeur illicite",
    maj: ["A", "M", "P"],
    min: ["E", "S", "M"],
    c: "E",
    t: { S: "chiens", M: "chats", P: "mammifères" },
  },
  {
    nom: "Darapti (dragons)",
    maj: ["A", "M", "P"],
    min: ["A", "M", "S"],
    c: "I",
    t: { S: "reptiles", M: "dragons", P: "ailés" },
  },
];

export function syllogisme(props) {
  const start =
    PRESETS.find(
      (p) =>
        p.nom
          .toLowerCase()
          .startsWith(String(props.preset || "").toLowerCase()) && props.preset,
    ) || PRESETS[0];
  const st = {
    noms: {
      S: props.s || start.t.S,
      M: props.m || start.t.M,
      P: props.p || start.t.P,
    },
    maj: {
      forme: parseForme(props.majeure, start.maj[0]),
      sujet: start.maj[1],
      predicat: start.maj[2],
    },
    min: {
      forme: parseForme(props.mineure, start.min[0]),
      sujet: start.min[1],
      predicat: start.min[2],
    },
    conc: {
      forme: parseForme(props.conclusion, start.c),
      sujet: "S",
      predicat: "P",
    },
    aristote: false,
  };

  const inputs = {};
  for (const t of ["S", "M", "P"]) {
    inputs[t] = el("input", {
      type: "text",
      class: "w-input sci-term-in",
      value: st.noms[t],
      maxlength: "30",
      "aria-label": "nom du terme " + t,
    });
    inputs[t].addEventListener("input", () => {
      st.noms[t] = inputs[t].value.trim() || t;
      draw();
    });
  }
  const formSelect = (prop, label) => {
    const s = el(
      "select",
      { class: "w-input sci-select", "aria-label": label },
      Object.entries(FORM_LABEL).map(([k, v]) =>
        el("option", { value: k }, [v]),
      ),
    );
    s.value = prop.forme;
    s.addEventListener("change", () => {
      prop.forme = s.value;
      draw();
    });
    return s;
  };
  const orderSelect = (prop, a, b, label) => {
    const s = el(
      "select",
      { class: "w-input sci-select sci-order", "aria-label": label },
      [
        el("option", { value: a + b }, [a + " … " + b]),
        el("option", { value: b + a }, [b + " … " + a]),
      ],
    );
    s.value = prop.sujet + prop.predicat;
    s.addEventListener("change", () => {
      prop.sujet = s.value[0];
      prop.predicat = s.value[1];
      draw();
    });
    return s;
  };
  const selMaj = formSelect(st.maj, "forme de la majeure");
  const ordMaj = orderSelect(
    st.maj,
    "M",
    "P",
    "ordre des termes de la majeure",
  );
  const selMin = formSelect(st.min, "forme de la mineure");
  const ordMin = orderSelect(
    st.min,
    "S",
    "M",
    "ordre des termes de la mineure",
  );
  const selConc = formSelect(st.conc, "forme de la conclusion");
  const chk = el("input", { type: "checkbox" });
  chk.addEventListener("change", () => {
    st.aristote = chk.checked;
    draw();
  });

  const texte = el("ol", { class: "sci-syl-text" });
  const diag = el("div", { class: "sci-venn" });
  const verdict = el("div", { class: "sci-verdict-box" });

  const term = (t) => el("span", { class: "sci-term is-" + t }, [st.noms[t]]);
  function phrase(p, prefix) {
    const a = p.sujet;
    const b = p.predicat;
    const sg = (t) =>
      el("span", { class: "sci-term is-" + t }, [singulier(st.noms[t])]);
    const parts = {
      A: ["Tous les ", term(a), " sont ", term(b)],
      E: ["Aucun ", sg(a), " n'est ", sg(b)],
      I: ["Quelques ", term(a), " sont ", term(b)],
      O: ["Quelques ", term(a), " ne sont pas ", term(b)],
    }[p.forme];
    if (prefix) parts[0] = prefix + parts[0].toLowerCase();
    return [...parts, "."];
  }
  /** "dans S et M, hors de P" with the reader's names. */
  function region(r) {
    const ins = ["S", "M", "P"].filter((t) => dans(r, t));
    const outs = ["S", "M", "P"].filter((t) => !dans(r, t));
    const nodes = ["un élément de "];
    ins.forEach((t, i) =>
      nodes.push(
        i ? (i === ins.length - 1 ? " et de " : ", de ") : "",
        term(t),
      ),
    );
    if (outs.length) {
      nodes.push(" qui ne fait pas partie de ");
      outs.forEach((t, i) => nodes.push(i ? " ni de " : "", term(t)));
    }
    return nodes;
  }

  function drawVenn(d) {
    const id = uid("venn");
    const circleClip = (t) =>
      svg("clipPath", { id: `${id}-c${t}` }, [
        svg("circle", { cx: CENTRES[t][0], cy: CENTRES[t][1], r: R }),
      ]);
    const defs = svg("defs", {}, ["S", "M", "P"].map(circleClip));
    const kids = [defs];
    // Shaded (empty) regions: clip to the circles the region is in, mask out the others.
    for (const r of d.vides) {
      const ins = ["S", "M", "P"].filter((t) => dans(r, t));
      const outs = ["S", "M", "P"].filter((t) => !dans(r, t));
      const mid = `${id}-m${r}`;
      defs.appendChild(
        svg(
          "mask",
          {
            id: mid,
            maskUnits: "userSpaceOnUse",
            x: 0,
            y: 0,
            width: VB[0],
            height: VB[1],
          },
          [
            svg("rect", {
              x: 0,
              y: 0,
              width: VB[0],
              height: VB[1],
              fill: "white",
            }),
            ...outs.map((t) =>
              svg("circle", {
                cx: CENTRES[t][0],
                cy: CENTRES[t][1],
                r: R,
                fill: "black",
              }),
            ),
          ],
        ),
      );
      let node = svg("rect", {
        x: 0,
        y: 0,
        width: VB[0],
        height: VB[1],
        class: "sci-vide",
      });
      for (const t of ins)
        node = svg("g", { "clip-path": `url(#${id}-c${t})` }, [node]);
      kids.push(svg("g", { mask: `url(#${mid})` }, [node]));
    }
    for (const t of ["S", "M", "P"])
      kids.push(
        svg("circle", {
          cx: CENTRES[t][0],
          cy: CENTRES[t][1],
          r: R,
          class: "sci-circle is-" + t,
        }),
      );
    // Term labels outside the circles.
    const lab = {
      S: [CENTRES.S[0] - R + 4, CENTRES.S[1] - R + 6, "end"],
      P: [CENTRES.P[0] + R - 4, CENTRES.P[1] - R + 6, "start"],
      M: [CENTRES.M[0], CENTRES.M[1] + R + 16, "middle"],
    };
    for (const t of ["S", "M", "P"]) {
      const [x, y, anchor] = lab[t];
      const name =
        st.noms[t].length > 14 ? st.noms[t].slice(0, 13) + "…" : st.noms[t];
      kids.push(
        svg(
          "text",
          { x, y, "text-anchor": anchor, class: "sci-venn-l is-" + t },
          [t + " · " + name],
        ),
      );
    }
    // ×: inside a region, or on the boundary between two.
    for (const c of d.croix) {
      let x;
      let y;
      if (c.length === 1) [x, y] = CENTROIDES[c[0]];
      else {
        const [a, b] = c;
        const t = ["S", "M", "P"].find((k) => dans(a, k) !== dans(b, k));
        const mx = (CENTROIDES[a][0] + CENTROIDES[b][0]) / 2;
        const my = (CENTROIDES[a][1] + CENTROIDES[b][1]) / 2;
        const [cx, cy] = CENTRES[t];
        const len = Math.hypot(mx - cx, my - cy) || 1;
        x = cx + ((mx - cx) / len) * R;
        y = cy + ((my - cy) / len) * R;
      }
      kids.push(
        svg(
          "text",
          {
            x,
            y: y + 7,
            "text-anchor": "middle",
            class: "sci-cross" + (c.length > 1 ? " is-line" : ""),
          },
          ["×"],
        ),
      );
    }
    diag.replaceChildren(
      svg(
        "svg",
        {
          viewBox: `-40 -14 ${VB[0] + 80} ${VB[1] + 22}`,
          role: "img",
          "aria-label":
            "diagramme de Venn des prémisses : zones grisées vides, × = au moins un élément",
        },
        kids,
      ),
    );
  }

  function draw() {
    const premisses = [st.maj, st.min];
    const d = diagramme(premisses);
    drawVenn(d);
    texte.replaceChildren(
      el("li", {}, [
        el("span", { class: "sci-role" }, ["Majeure"]),
        ...phrase(st.maj),
      ]),
      el("li", {}, [
        el("span", { class: "sci-role" }, ["Mineure"]),
        ...phrase(st.min),
      ]),
      el("li", { class: "sci-concl" }, [
        el("span", { class: "sci-role" }, ["Conclusion"]),
        ...phrase(st.conc, "Donc "),
      ]),
    );
    const v = verifier(premisses, st.conc, {
      importationExistentielle: st.aristote,
    });
    const vBool = st.aristote ? verifier(premisses, st.conc) : v;
    const nom = nomDuMode(st.maj, st.min, st.conc);
    const fig = figure(st.maj, st.min);
    const expl = [];
    if (v.valide) {
      expl.push(
        st.conc.forme === "A" || st.conc.forme === "E"
          ? "Toute la zone que la conclusion déclare vide est déjà grisée par les prémisses : la conclusion n'ajoute rien, elle était dans le diagramme."
          : "Les prémisses forcent un × dans la zone où la conclusion affirme qu'il existe quelque chose.",
      );
      if (st.aristote && !vBool.valide)
        expl.push(
          " Mais seulement parce qu'on suppose que les trois termes désignent des choses qui existent : en logique moderne, « Tous les X sont Y » reste vrai s'il n'y a aucun X, et ce syllogisme ne tient plus.",
        );
    } else {
      const m = v.contreExemple ?? 0;
      const visees = regionsVisees(st.conc);
      if (st.conc.forme === "A" || st.conc.forme === "E") {
        const r = visees.find((x) => (m >> x) & 1);
        expl.push(
          "Les prémisses laissent possible ",
          ...region(r),
          " : rien ne grise cette zone, et un seul élément y suffit à rendre la conclusion fausse.",
        );
      } else {
        expl.push(
          "Rien n'oblige la zone visée par la conclusion à contenir quelque chose : " +
            (d.croix.some((c) => c.length > 1)
              ? "un × posé sur une ligne peut être d'un côté comme de l'autre."
              : "aucun × n'y est forcé.") +
            (st.aristote
              ? ""
              : " Coche la lecture d'Aristote pour voir si l'existence des termes suffirait."),
        );
      }
    }
    verdict.replaceChildren(
      el("p", { class: "w-verdict " + (v.valide ? "w-ok" : "w-ko") }, [
        v.valide ? "Valide" : "Non valide",
        nom ? " — " + nom : "",
        fig ? ` (figure ${fig})` : "",
      ]),
      el("p", { class: "w-note" }, expl),
    );
  }

  const presets = PRESETS.map((p) =>
    el(
      "button",
      {
        type: "button",
        class: "w-btn",
        onclick: () => {
          Object.assign(st.maj, {
            forme: p.maj[0],
            sujet: p.maj[1],
            predicat: p.maj[2],
          });
          Object.assign(st.min, {
            forme: p.min[0],
            sujet: p.min[1],
            predicat: p.min[2],
          });
          st.conc.forme = p.c;
          for (const t of ["S", "M", "P"]) {
            st.noms[t] = p.t[t];
            inputs[t].value = p.t[t];
          }
          selMaj.value = p.maj[0];
          ordMaj.value = p.maj[1] + p.maj[2];
          selMin.value = p.min[0];
          ordMin.value = p.min[1] + p.min[2];
          selConc.value = p.c;
          draw();
        },
      },
      [p.nom],
    ),
  );

  draw();
  return el("div", { class: "w-root sci-syl" }, [
    el("div", { class: "w-controls" }, [
      el("span", { class: "w-hint" }, ["Exemples :"]),
      ...presets,
    ]),
    el("div", { class: "sci-syl-form" }, [
      el(
        "div",
        { class: "sci-syl-terms" },
        ["S", "M", "P"].map((t) =>
          el("label", {}, [
            el("span", { class: "sci-term is-" + t }, [t]),
            inputs[t],
          ]),
        ),
      ),
      el("div", { class: "sci-syl-row" }, [
        el("span", { class: "sci-role" }, ["Majeure"]),
        selMaj,
        ordMaj,
      ]),
      el("div", { class: "sci-syl-row" }, [
        el("span", { class: "sci-role" }, ["Mineure"]),
        selMin,
        ordMin,
      ]),
      el("div", { class: "sci-syl-row" }, [
        el("span", { class: "sci-role" }, ["Conclusion"]),
        selConc,
        el("span", { class: "w-hint" }, ["S … P"]),
      ]),
      el("label", { class: "sci-check" }, [
        chk,
        " Lecture d'Aristote : S, M et P désignent des choses qui existent",
      ]),
    ]),
    el("div", { class: "sci-syl-main" }, [
      diag,
      el("div", {}, [texte, verdict]),
    ]),
    el("p", { class: "w-note" }, [
      "Chaque zone du diagramme est une combinaison « dans / hors » des trois cercles. Une prémisse universelle grise les zones qu'elle déclare vides ; une particulière place un × là où il existe au moins un élément, ou sur une ligne quand les prémisses ne disent pas de quel côté. La conclusion est valide si, une fois les prémisses dessinées, elle se lit déjà sur le diagramme. Ici la vérification essaie les 256 façons de remplir ou vider les 8 zones. En lecture moderne, 15 des 24 modes classiques restent valides ; les 9 autres (Darapti, Barbari…) supposent que les termes ne sont pas vides.",
    ]),
  ]);
}
