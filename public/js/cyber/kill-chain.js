// Widget "kill-chain": an attack laid out day by day, and defenses to switch
// on. Some block a stage, some only see it; a detection stops the attack only
// when someone acts on it before the next stage. Model: lib/cyber.ts.
//   e1: J0 | Accès initial | VPN sans MFA, identifiants achetés
//   d1: MFA sur le VPN | bloque 1
//   d2: EDR (alertes) | détecte 2, 5 | actif
//   d3: Alertes traitées en 24 h | soc
//   d4: Sauvegardes hors ligne | sauvegarde
import { el } from "../widget-kit.js";
import {
  chainOutcome,
  parseDefenses,
  parseStages,
} from "../../../lib/cyber.ts";

export function killChain(props, fig, ctx) {
  const stages = parseStages(props);
  const defs = parseDefenses(props);
  if (!stages.length) return null;
  const chain = el("ol", { class: "cy-kc" });
  const note = el("p", { class: "w-note", "aria-live": "polite" });
  const last = stages.length - 1;

  const boxes = defs.map((d) => {
    const b = el("input", { type: "checkbox", checked: d.on });
    b.addEventListener("change", () => {
      d.on = b.checked;
      draw();
    });
    return el("label", { class: "sci-check" }, [b, " " + d.label]);
  });

  function draw() {
    const r = chainOutcome(stages, defs);
    chain.replaceChildren(
      ...stages.map((s, i) => {
        let cls = "cy-kc-s";
        const tags = [];
        if (r.halt >= 0 && i > r.halt) cls += " is-never";
        else if (i === r.halt) {
          cls += " is-block";
          tags.push(
            el("span", { class: "cy-tag is-ok" }, [
              r.by === "soc" ? "le SOC isole le poste" : "bloqué",
            ]),
          );
        } else cls += " is-done";
        if (r.detected.includes(i) && !(r.halt >= 0 && i > r.halt)) {
          if (cls.includes("is-done")) cls = cls.replace("is-done", "is-det");
          tags.push(el("span", { class: "cy-tag is-ko" }, ["alerte"]));
        }
        return el("li", { class: cls }, [
          el("span", { class: "cy-kc-day" }, ["J" + s.day]),
          el("span", { class: "cy-kc-dot", "aria-hidden": "true" }),
          el("span", { class: "cy-kc-t" }, [
            s.name,
            ...tags,
            s.detail ? el("small", {}, [s.detail]) : null,
          ]),
        ]);
      }),
    );
    const v = (cls, t) => el("span", { class: "cy-verdict " + cls }, [t]);
    const end = stages[last];
    const parts = [];
    if (r.halt >= 0 && r.halt < last)
      parts.push(
        v("is-ok", "Attaque arrêtée"),
        ` à « ${stages[r.halt].name} », jour ${stages[r.halt].day}${r.by === "soc" ? " : une alerte a été traitée à temps" : ""}.`,
      );
    else if (r.halt === last)
      parts.push(
        v("is-ok", "Dernière étape bloquée"),
        ` mais tout ce qui précède a eu lieu.`,
      );
    else if (r.firstAlert >= 0)
      parts.push(
        v("is-flaw", `${end.name}, jour ${end.day}`),
        ` L'attaque a été vue dès le jour ${stages[r.firstAlert].day}, mais personne n'a traité l'alerte. C'est le cas le plus courant.`,
      );
    else
      parts.push(
        v("is-flaw", `${end.name}, jour ${end.day}`),
        " Rien n'a vu passer l'attaque.",
      );
    if (r.halt < 0 || r.halt === last)
      parts.push(
        r.backup
          ? " Les sauvegardes hors ligne permettent de repartir sans payer ; les données volées, elles, restent publiables."
          : "",
      );
    note.replaceChildren(...parts);
    ctx?.report({
      arretee: r.halt >= 0 && r.halt < last ? 1 : 0,
      etape: r.halt + 1,
      alertes: r.detected.length,
      defenses: defs.filter((d) => d.on).length,
    });
  }

  draw();
  return el("div", { class: "w-root cy-kc-root" }, [
    el("div", { class: "cy-kc-defs" }, boxes),
    chain,
    note,
  ]);
}
