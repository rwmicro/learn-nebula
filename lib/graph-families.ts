import type { GraphData, GraphNode } from "./graph-data";
import { PATH_FAMILIES, familyOfFolder, type PathFamily } from "./path-family";

/**
 * The phone graph (CircularGraph.tsx) draws the colour families of
 * lib/path-family.ts (the same seven-plus-one as /parcours/) as one labelled
 * cluster each, readable on a 390px screen where the desktop ring's spoke
 * labels are not. A discipline with no family joins "societe".
 */
export type FamilyKey = PathFamily;
export const FAMILIES = PATH_FAMILIES;

export function familyOf(theme: string): FamilyKey {
  return familyOfFolder(`x/${theme}`) ?? "societe";
}

export interface ClusterNode {
  id: string;
  node: GraphNode;
  family: FamilyKey;
  x: number;
  y: number;
}
export interface ClusterHub {
  family: FamilyKey;
  x: number;
  y: number;
  /** Radius of the family's disc of notes. */
  r: number;
  notes: number;
}
export interface ClusterLayout {
  hubs: ClusterHub[];
  notes: ClusterNode[];
  /** Half-extents of the whole drawing, to fit it on screen. */
  w: number;
  h: number;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const SPACING = 7; // between neighbouring notes, in layout units
const HUB_GAP = 26; // free ring around the hub, where its label sits

/**
 * One disc per family: the hub in the middle, its notes on a sunflower
 * spiral around it, ordered by discipline so each one keeps a patch of its
 * own. The discs are then pushed apart until none overlap, inside a tall
 * frame shaped like a phone. Deterministic: the same vault draws the same
 * picture on every visit.
 */
export function buildClusters(data: GraphData): ClusterLayout {
  const notesBy = new Map<FamilyKey, GraphNode[]>();
  for (const n of data.nodes) {
    if (n.kind !== "note" || !n.theme || n.theme === "root") continue;
    const f = familyOf(n.theme);
    (notesBy.get(f) ?? notesBy.set(f, []).get(f)!).push(n);
  }
  const fams = FAMILIES.filter((f) => notesBy.get(f)?.length);
  const hubs: ClusterHub[] = fams.map((f) => {
    const k = notesBy.get(f)!.length;
    return { family: f, x: 0, y: 0, r: HUB_GAP + SPACING * Math.sqrt(k) * 0.62, notes: k };
  });

  // Start on a tall ellipse, biggest first, then relax.
  const order = [...hubs].sort((a, b) => b.notes - a.notes);
  order.forEach((h, i) => {
    const a = (i / order.length) * Math.PI * 2 + 0.4;
    h.x = Math.cos(a) * 120;
    h.y = Math.sin(a) * 220;
  });
  if (order.length) {
    order[0].x = 0;
    order[0].y = 0;
  }
  const PAD = 18;
  for (let it = 0; it < 400; it++) {
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const a = hubs[i];
        const b = hubs[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        const min = a.r + b.r + PAD;
        if (d < min) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }
    // Gravity: twice as strong across as down, so the picture grows tall.
    for (const h of hubs) {
      h.x *= 0.97;
      h.y *= 0.985;
    }
  }

  const notes: ClusterNode[] = [];
  for (const h of hubs) {
    const list = [...notesBy.get(h.family)!].sort(
      (a, b) => a.theme.localeCompare(b.theme) || a.label.localeCompare(b.label),
    );
    // Sunflower from the hub's gap outwards; sorting by discipline keeps each
    // one's notes on neighbouring turns.
    const r0 = HUB_GAP * 0.55;
    list.forEach((n, i) => {
      const r = r0 + SPACING * 0.62 * Math.sqrt(i + 1);
      const a = i * GOLDEN;
      notes.push({ id: n.id, node: n, family: h.family, x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r });
    });
  }

  // Centre the drawing on its bounding box.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const h of hubs) {
    x0 = Math.min(x0, h.x - h.r);
    x1 = Math.max(x1, h.x + h.r);
    y0 = Math.min(y0, h.y - h.r);
    y1 = Math.max(y1, h.y + h.r);
  }
  if (!hubs.length) return { hubs, notes, w: 1, h: 1 };
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  for (const h of hubs) {
    h.x -= mx;
    h.y -= my;
  }
  for (const n of notes) {
    n.x -= mx;
    n.y -= my;
  }
  return { hubs, notes, w: (x1 - x0) / 2, h: (y1 - y0) / 2 };
}
