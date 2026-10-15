// Widget goals for the widget packs (public/js/widget-kit.js, mount): the
// `objectif` / `cible` / `indice` / `bravo` / `erreur` lines of a widget block
// (syntax in pensine's sources/CLAUDE.md), parsed and checked against the
// state a widget reports. public/js/widgets.js, served raw rather than
// bundled, keeps its own copy of the same rules (parseGoals, holds).

export type Cond = { key: string; op: string; val: string };
export type Goal = {
  text: string;
  conds: Cond[];
  hint: string;
  bravo: string;
  errors: { conds: Cond[]; msg: string }[];
};

const OPS = /^\s*([A-Za-z_][\w.-]*)\s*(>=|<=|!=|=|>|<)\s*(.+?)\s*$/;

export function parseConds(src: unknown): Cond[] {
  return String(src || "")
    .split(",")
    .map((c) => OPS.exec(c))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ key: m[1], op: m[2], val: m[3] }));
}

export function parseGoals(props: Record<string, unknown>): Goal[] {
  const out: Goal[] = [];
  for (let i = 1; i <= 12; i++) {
    const sfx = i === 1 ? "" : "-" + i;
    const text = props["objectif" + sfx];
    const conds = parseConds(props["cible" + sfx]);
    if (!text || !conds.length) continue;
    const errors = String(props["erreur" + sfx] || "")
      .split(";;")
      .map((e) => e.split(/\s*(?:→|->)\s*/))
      .filter((p) => p.length >= 2)
      .map((p) => ({ conds: parseConds(p[0]), msg: p.slice(1).join(" → ").trim() }))
      .filter((e) => e.conds.length && e.msg);
    out.push({
      text: String(text),
      conds,
      hint: String(props["indice" + sfx] || ""),
      bravo: String(props["bravo" + sfx] || ""),
      errors,
    });
  }
  return out;
}

/** Whether every condition holds: numbers compare as numbers, text exactly. */
export function holds(state: Record<string, unknown> | undefined, conds: Cond[]): boolean {
  if (!state) return false;
  return conds.every((c) => {
    if (!(c.key in state)) return false;
    const sv = state[c.key];
    const a = Number(sv);
    const b = Number(c.val);
    const numeric = typeof sv !== "string" || (sv.trim() !== "" && Number.isFinite(a));
    if (numeric && Number.isFinite(a) && Number.isFinite(b)) {
      const eq = Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));
      if (c.op === "=") return eq;
      if (c.op === "!=") return !eq;
      if (c.op === "<") return a < b;
      if (c.op === "<=") return a <= b || eq;
      if (c.op === ">") return a > b;
      return a >= b || eq;
    }
    const x = String(sv).trim();
    const y = String(c.val).trim();
    if (c.op === "=") return x === y;
    if (c.op === "!=") return x !== y;
    return false;
  });
}
