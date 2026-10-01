// Build-time layout of one reading path (/parcours/<slug>/) as a top-down
// layered graph, Sugiyama-style but small: longest-path layering, dummy nodes
// for edges that skip layers, a few barycenter sweeps to reduce crossings, then
// x coordinates pulled towards each node's neighbours. Pure and deterministic
// (same input, same SVG), so it runs during `next build` and the page ships a
// plain inline SVG — no layout library in the browser. Unit-tested in
// lib/prereq-layout.test.ts.

import type { PrereqEdge } from "./prereq-graph";

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  /** Horizontal gap between two boxes of a layer. */
  gapX: number;
  /** Vertical gap between two layers (where the arrows run). */
  gapY: number;
  /** Width a long edge's waypoint takes in its layer. */
  dummyWidth: number;
  padding: number;
  /** Characters per title line before wrapping (two lines at most). */
  lineChars: number;
  sweeps: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  nodeWidth: 184,
  nodeHeight: 58,
  gapX: 28,
  gapY: 46,
  dummyWidth: 16,
  padding: 14,
  lineChars: 22,
  sweeps: 6,
};

export interface LayoutNode {
  slug: string;
  title: string;
  /** Title wrapped to at most two lines (the second ellipsised if needed). */
  lines: string[];
  layer: number;
  /** Top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** Polyline from the bottom of `from` to the top of `to`, through the
   *  waypoints of the layers it crosses. */
  points: [number, number][];
}

export interface GraphLayout {
  width: number;
  height: number;
  layers: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

/** Wrap a title into at most two lines of about `max` characters. */
export function wrapTitle(title: string, max: number): string[] {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= 2)
    return lines.map((l) => (l.length > max ? l.slice(0, max - 1) + "…" : l));
  const second = lines.slice(1).join(" ");
  return [
    lines[0].length > max ? lines[0].slice(0, max - 1) + "…" : lines[0],
    second.length > max ? second.slice(0, max - 1).trimEnd() + "…" : second,
  ];
}

interface Slot {
  id: string; // slug, or "\u0000dummy:from>to:layer" for a waypoint
  dummy: boolean;
  layer: number;
  w: number;
  x: number; // centre
}

/** Number of crossings between two consecutive layers given the edges between them. */
function crossings(
  upper: string[],
  lower: string[],
  links: [string, string][],
): number {
  const pu = new Map(upper.map((s, i) => [s, i]));
  const pl = new Map(lower.map((s, i) => [s, i]));
  const segs = links
    .filter(([a, b]) => pu.has(a) && pl.has(b))
    .map(([a, b]) => [pu.get(a)!, pl.get(b)!] as const);
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a1, b1] = segs[i];
      const [a2, b2] = segs[j];
      if ((a1 - a2) * (b1 - b2) < 0) n++;
    }
  }
  return n;
}

/**
 * Lay out `order` (slugs, already in topological order — see topoOrder) with
 * `edges` [prerequisite, dependent]. Edges must not form a cycle (topoOrder
 * reports and removes them); an edge pointing backwards in `order` or naming
 * an unknown slug is ignored rather than trusted.
 */
export function layoutPrereqGraph(
  order: string[],
  edges: PrereqEdge[],
  titleOf: (slug: string) => string,
  options: Partial<LayoutOptions> = {},
): GraphLayout {
  const o = { ...DEFAULT_LAYOUT, ...options };
  const index = new Map(order.map((s, i) => [s, i]));
  // Canonical edge order (by position of both ends), so waypoint order — and
  // so the whole layout — does not depend on the order edges were listed in.
  const seen = new Set<string>();
  const valid = edges
    .filter(([a, b]) => {
      const k = `${a}\n${b}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return index.has(a) && index.has(b) && index.get(a)! < index.get(b)!;
    })
    .sort(
      (x, y) =>
        index.get(x[0])! - index.get(y[0])! ||
        index.get(x[1])! - index.get(y[1])!,
    );

  // 1. Longest-path layering: a note sits one layer below its deepest prerequisite.
  const layerOf = new Map<string, number>();
  for (const s of order) {
    let l = 0;
    for (const [a, b] of valid)
      if (b === s) l = Math.max(l, layerOf.get(a)! + 1);
    layerOf.set(s, l);
  }
  const layerCount = order.length ? Math.max(...layerOf.values()) + 1 : 0;

  // 2. Waypoints for edges that skip layers, so they route between boxes and
  //    take part in crossing reduction.
  const layers: string[][] = Array.from({ length: layerCount }, () => []);
  const slots = new Map<string, Slot>();
  for (const s of order) {
    const l = layerOf.get(s)!;
    layers[l].push(s);
    slots.set(s, { id: s, dummy: false, layer: l, w: o.nodeWidth, x: 0 });
  }
  const links: [string, string][] = []; // consecutive-layer segments
  const chains = new Map<string, string[]>(); // "a>b" → slot ids top to bottom
  for (const [a, b] of valid) {
    const chain = [a];
    for (let l = layerOf.get(a)! + 1; l < layerOf.get(b)!; l++) {
      const id = `\u0000dummy:${a}>${b}:${l}`;
      slots.set(id, { id, dummy: true, layer: l, w: o.dummyWidth, x: 0 });
      layers[l].push(id);
      chain.push(id);
    }
    chain.push(b);
    for (let i = 0; i + 1 < chain.length; i++)
      links.push([chain[i], chain[i + 1]]);
    chains.set(`${a}>${b}`, chain);
  }

  // 3. Crossing reduction: barycenter sweeps down then up, keeping the best
  //    ordering seen. Sorting is stable, so ties keep the previous order and
  //    the result never depends on anything but the input.
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const [a, b] of links) {
    down.set(a, [...(down.get(a) ?? []), b]);
    up.set(b, [...(up.get(b) ?? []), a]);
  }
  const total = (ls: string[][]) => {
    let n = 0;
    for (let i = 0; i + 1 < ls.length; i++)
      n += crossings(ls[i], ls[i + 1], links);
    return n;
  };
  const reorder = (
    layer: string[],
    ref: string[],
    nbrs: Map<string, string[]>,
  ) => {
    const pos = new Map(ref.map((s, i) => [s, i]));
    const bary = new Map<string, number>();
    layer.forEach((s, i) => {
      const ps = (nbrs.get(s) ?? [])
        .map((n) => pos.get(n))
        .filter((p): p is number => p != null);
      bary.set(s, ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : i);
    });
    return [...layer].sort((a, b) => bary.get(a)! - bary.get(b)!);
  };
  let best = layers.map((l) => [...l]);
  let bestCross = total(best);
  let cur = layers.map((l) => [...l]);
  for (let sweep = 0; sweep < o.sweeps && bestCross > 0; sweep++) {
    if (sweep % 2 === 0) {
      for (let i = 1; i < cur.length; i++)
        cur[i] = reorder(cur[i], cur[i - 1], up);
    } else {
      for (let i = cur.length - 2; i >= 0; i--)
        cur[i] = reorder(cur[i], cur[i + 1], down);
    }
    const c = total(cur);
    if (c < bestCross) {
      best = cur.map((l) => [...l]);
      bestCross = c;
    }
  }

  // 4. x coordinates. Start packed and centred, then a few passes pulling each
  //    slot towards the mean of its neighbours' centres while keeping the
  //    layer's order and minimum spacing (a cheap stand-in for Brandes–Köpf):
  //    chains come out straight, a note with two prerequisites sits between them.
  const gap = (a: Slot, b: Slot) => (a.dummy || b.dummy ? o.gapX / 2 : o.gapX);
  const sep = (a: Slot, b: Slot) => (a.w + b.w) / 2 + gap(a, b);
  const widthOf = (ids: string[]) =>
    ids.reduce(
      (w, id, i) =>
        w +
        slots.get(id)!.w +
        (i ? gap(slots.get(ids[i - 1])!, slots.get(id)!) : 0),
      0,
    );
  const maxW = Math.max(0, ...best.map(widthOf));
  for (const ids of best) {
    let x = (maxW - widthOf(ids)) / 2;
    ids.forEach((id, i) => {
      const s = slots.get(id)!;
      if (i) x += gap(slots.get(ids[i - 1])!, s);
      s.x = x + s.w / 2;
      x += s.w;
    });
  }
  // Closest positions to the wishes (least squares) that keep the order and
  // the spacing: subtract each slot's minimum offset from the first, which
  // turns it into an isotonic regression, solved by pool-adjacent-violators.
  const place = (ids: string[], nbrs: Map<string, string[]>) => {
    if (!ids.length) return;
    const offset: number[] = [0];
    for (let i = 1; i < ids.length; i++) {
      offset[i] =
        offset[i - 1] + sep(slots.get(ids[i - 1])!, slots.get(ids[i])!);
    }
    const want = ids.map((id, i) => {
      const ns = nbrs.get(id) ?? [];
      const w = ns.length
        ? ns.reduce((sum, n) => sum + slots.get(n)!.x, 0) / ns.length
        : slots.get(id)!.x;
      return w - offset[i];
    });
    const blocks: { sum: number; n: number }[] = [];
    for (const v of want) {
      blocks.push({ sum: v, n: 1 });
      while (
        blocks.length > 1 &&
        blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n >
          blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n
      ) {
        const b = blocks.pop()!;
        blocks[blocks.length - 1].sum += b.sum;
        blocks[blocks.length - 1].n += b.n;
      }
    }
    let i = 0;
    for (const b of blocks) {
      for (let k = 0; k < b.n; k++, i++)
        slots.get(ids[i])!.x = b.sum / b.n + offset[i];
    }
  };
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < best.length; i++) place(best[i], up);
    for (let i = best.length - 2; i >= 0; i--) place(best[i], down);
  }
  // Normalise: leftmost box edge at the padding.
  let minX = Infinity;
  let maxX = -Infinity;
  for (const s of slots.values()) {
    minX = Math.min(minX, s.x - s.w / 2);
    maxX = Math.max(maxX, s.x + s.w / 2);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
  }
  const dx = o.padding - minX;
  const round = (v: number) => Math.round(v * 10) / 10;
  const yOf = (layer: number) => o.padding + layer * (o.nodeHeight + o.gapY);

  const nodes: LayoutNode[] = order.map((slug) => {
    const s = slots.get(slug)!;
    return {
      slug,
      title: titleOf(slug),
      lines: wrapTitle(titleOf(slug), o.lineChars),
      layer: s.layer,
      x: round(s.x - s.w / 2 + dx),
      y: yOf(s.layer),
      w: o.nodeWidth,
      h: o.nodeHeight,
    };
  });
  const outEdges: LayoutEdge[] = valid.map(([a, b]) => {
    const chain = chains.get(`${a}>${b}`)!;
    const points = chain.map((id, i): [number, number] => {
      const s = slots.get(id)!;
      const x = round(s.x + dx);
      if (i === 0) return [x, yOf(s.layer) + o.nodeHeight];
      if (i === chain.length - 1) return [x, yOf(s.layer)];
      return [x, yOf(s.layer) + o.nodeHeight / 2];
    });
    return { from: a, to: b, points };
  });
  // Spread the ports: several arrows into (or out of) one box get their own
  // spot along its edge, ordered by where they come from, instead of piling
  // onto its centre.
  const spread = (key: "from" | "to") => {
    const byNode = new Map<string, LayoutEdge[]>();
    for (const e of outEdges)
      byNode.set(e[key], [...(byNode.get(e[key]) ?? []), e]);
    for (const list of byNode.values()) {
      if (list.length < 2) continue;
      const end = (e: LayoutEdge) => (key === "from" ? 0 : e.points.length - 1);
      const other = (e: LayoutEdge) =>
        e.points[key === "from" ? 1 : e.points.length - 2][0];
      list.sort(
        (x, y) =>
          other(x) - other(y) || (x.from + x.to < y.from + y.to ? -1 : 1),
      );
      const step = Math.min(18, (o.nodeWidth - 24) / list.length);
      list.forEach((e, i) => {
        const p = e.points[end(e)];
        e.points[end(e)] = [
          round(p[0] + (i - (list.length - 1) / 2) * step),
          p[1],
        ];
      });
    }
  };
  spread("to");
  spread("from");
  return {
    width: round(maxX - minX + 2 * o.padding),
    height: layerCount ? yOf(layerCount - 1) + o.nodeHeight + o.padding : 0,
    layers: layerCount,
    nodes,
    edges: outEdges,
  };
}

/** SVG path data for an edge: vertical cubic curves through its points, so a
 *  long edge bends smoothly round the boxes it passes. */
export function edgePath(points: [number, number][]): string {
  if (!points.length) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const my = Math.round(((y0 + y1) / 2) * 10) / 10;
    d += ` C${x0},${my} ${x1},${my} ${x1},${y1}`;
  }
  return d;
}
