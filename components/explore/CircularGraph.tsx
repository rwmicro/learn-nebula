"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type MouseEvent as ReactMouseEvent } from "react";
import { stratify, cluster, type HierarchyNode } from "d3-hierarchy";
import type { GraphData, GraphNode } from "@/lib/graph-data";
import { folderKey, t, pathName as localPathName } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { CHANGE_EVENT, loadStore, type ReadingStore } from "@/lib/reading-progress";
import { readingView } from "@/lib/graph-reading";
import { AppBack } from "@/components/layout/AppBack";
import { FAMILIES, buildClusters, type FamilyKey } from "@/lib/graph-families";

// --- discipline colours (same golden-angle palette as the old force graph) ---
type Palette = Map<string, string>;
function buildPalette(nodes: GraphNode[]): Palette {
  const themes = [...new Set(nodes.map((n) => n.theme))]
    .filter((th) => th && th !== "root")
    .sort();
  const p: Palette = new Map();
  themes.forEach((th, i) => {
    const hue = Math.round((i * 137.508) % 360);
    p.set(th, `${hue} 45% ${i % 2 ? 50 : 58}%`);
  });
  return p;
}
function themeColor(theme: string, p: Palette, alpha = 1): string {
  const base = theme && theme !== "root" ? p.get(theme) : undefined;
  if (!base) return alpha < 1 ? `hsl(0 0% 74% / ${alpha})` : "#bdbdbd";
  return alpha < 1 ? `hsl(${base} / ${alpha})` : `hsl(${base})`;
}

const TAU = Math.PI * 2;
const ROT_STEP = Math.PI / 12; // 15° per arrow-button click
/** Polar → cartesian with 0 rad at 12 o'clock, growing clockwise. */
function polar(angle: number, radius: number): [number, number] {
  const a = angle - Math.PI / 2;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

interface Positioned {
  id: string;
  node: GraphNode;
  angle: number; // 0..2π (before the roulette rotation)
  radius: number;
  depth: number;
}
interface Layout {
  nodes: Positioned[];
  links: { id: string; sa: number; sr: number; ta: number; tr: number }[];
  radius: number;
}

function buildLayout(data: GraphData): Layout {
  // Parent map from the containment (tree) links only — wikilinks are dropped.
  const parentOf = new Map<string, string>();
  for (const l of data.links) {
    if (l.kind === "wikilink") continue;
    const s = typeof l.source === "string" ? l.source : (l.source as { id: string }).id;
    const tg = typeof l.target === "string" ? l.target : (l.target as { id: string }).id;
    parentOf.set(tg, s);
  }
  // Keep only nodes reachable in the containment tree (root + anything with a parent).
  const keep = data.nodes.filter((n) => n.kind === "root" || parentOf.has(n.id));
  const root = stratify<GraphNode>()
    .id((d) => d.id)
    .parentId((d) => (d.kind === "root" ? null : parentOf.get(d.id) ?? null))(keep);

  // Folders before files, then natural-ish alpha, so siblings sit in a sensible
  // order around each arc.
  root.sort((a, b) => {
    const ad = a.data.kind === "dir" ? 0 : 1;
    const bd = b.data.kind === "dir" ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.data.label.localeCompare(b.data.label, undefined, { numeric: true });
  });

  const leaves = root.leaves().length;
  const radius = Math.min(2600, Math.max(560, leaves * 1.05));
  cluster<GraphNode>().size([TAU, radius]).separation(() => 1)(root);

  const nodes: Positioned[] = root.descendants().map((h: HierarchyNode<GraphNode>) => ({
    id: h.data.id,
    node: h.data,
    angle: (h as unknown as { x: number }).x,
    radius: (h as unknown as { y: number }).y,
    depth: h.depth,
  }));
  const links = root
    .links()
    .map((l) => {
      const s = l.source as unknown as { x: number; y: number; data: GraphNode };
      const tg = l.target as unknown as { x: number; y: number; data: GraphNode };
      return { id: `${s.data.id}->${tg.data.id}`, sa: s.x, sr: s.y, ta: tg.x, tr: tg.y };
    });
  return { nodes, links, radius };
}

function nodeR(n: Positioned): number {
  if (n.node.kind === "root") return 15;
  if (n.node.kind === "dir") return Math.max(3.5, 12 - n.depth * 2);
  return 2.2;
}

/** Smooth radial link (parent → child), the classic dendrogram curve. */
function linkPath(sa: number, sr: number, ta: number, tr: number): string {
  const [sx, sy] = polar(sa, sr);
  const [ex, ey] = polar(ta, tr);
  const mr = (sr + tr) / 2;
  const [c1x, c1y] = polar(sa, mr);
  const [c2x, c2y] = polar(ta, mr);
  return `M${sx.toFixed(1)},${sy.toFixed(1)}C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
}

export function CircularGraph({
  data,
  preview = false,
}: {
  data: GraphData;
  preview?: boolean;
}) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  // Folder names are the vault's English ones ("Applied Sciences",
  // "Litterature"): shown as the rest of the site names them.
  const folderName = (name: string) => {
    const k = folderKey(name);
    return k ? t(k, undefined, locale) : name;
  };
  const shown = useMemo(
    () => ({
      ...data,
      nodes: data.nodes.map((n) => (n.kind === "dir" ? { ...n, label: folderName(n.label) } : n)),
    }),
    // folderName only reads the locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, locale],
  );
  const layout = useMemo(() => buildLayout(shown), [shown]);
  const palette = useMemo(() => buildPalette(data.nodes), [data.nodes]);
  const rootLabel = useMemo(
    () => layout.nodes.find((n) => n.node.kind === "root")?.node.label ?? "",
    [layout.nodes],
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState(0); // radians — the "roulette"
  const [filter, setFilter] = useState<string | null>(null);
  // Reading-path filter (/parcours/): its notes and prerequisite edges lit,
  // the rest dimmed — the discipline filter's pattern, one or the other.
  const [pathSel, setPathSel] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; label: string } | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  // Phones: the panel is a bottom sheet, opened by the "Réglages" pill.
  const [sheet, setSheet] = useState(false);
  // "Mes lectures": read notes lit, the rest faded, and where to go next.
  const [mine, setMine] = useState(false);
  const [store, setStore] = useState<ReadingStore>({});
  // Phones draw the seven families as labelled clusters (lib/graph-families.ts)
  // instead of the ring, whose spoke labels can't be read at that width.
  const [isPhone, setIsPhone] = useState(false);
  const [famFilter, setFamFilter] = useState<FamilyKey | null>(null);
  useEffect(() => {
    if (preview) return;
    const mq = window.matchMedia("(max-width: 639.98px)");
    const sync = () => setIsPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [preview]);
  const clusters = useMemo(() => (isPhone ? buildClusters(shown) : null), [isPhone, shown]);
  const clusterXY = useMemo(
    () => new Map((clusters?.notes ?? []).map((n) => [n.id, n] as const)),
    [clusters],
  );
  useEffect(() => {
    if (preview) return;
    const sync = () => setStore(loadStore());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [preview]);
  const reading = useMemo(() => (preview ? null : readingView(data, store)), [data, store, preview]);
  const readIds = mine && reading ? reading.read : null;

  // Fit the ring to the viewport once we know the container size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Phones keep the floating search row (top) and the pills + tab bar
  // (bottom) clear of the clusters; PHONE_BAND is the free band's offset.
  const PHONE_TOP = 64;
  const PHONE_BOTTOM = 150;
  const fitZoom = useMemo(
    () =>
      clusters
        ? Math.min(
            (size.w - 16) / (2 * clusters.w),
            (size.h - PHONE_TOP - PHONE_BOTTOM) / (2 * clusters.h),
          )
        : Math.min(size.w, size.h) / (2 * layout.radius * 1.18),
    [size, layout.radius, clusters],
  );
  const PHONE_BAND = (PHONE_TOP - PHONE_BOTTOM) / 2;
  // Adopt the fit zoom on first measure / data change. The full graph opens a
  // little zoomed in on the centre (arriving from the home mini-map); the
  // preview fits the whole folder ring in its box.
  useEffect(() => {
    setZoom(preview || clusters ? fitZoom : fitZoom * 2.8);
    setPan({ x: 0, y: clusters ? PHONE_BAND : 0 });
    // PHONE_BAND is a constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitZoom, preview, clusters]);

  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);
  const pathView = useMemo(() => {
    const p = pathSel ? data.paths?.find((x) => x.slug === pathSel) : undefined;
    if (!p) return null;
    const ids = p.notes.map((s) => `file:/posts/${s}/`);
    return {
      path: p,
      ids: new Set(ids),
      edges: p.edges
        .map(([a, b]) => [byId.get(ids[a]), byId.get(ids[b])] as const)
        .filter((e): e is readonly [Positioned, Positioned] => !!e[0] && !!e[1]),
    };
  }, [pathSel, data.paths, byId]);
  const pathIds = pathView?.ids ?? null;

  const cx = size.w / 2;
  const cy = size.h / 2;

  // Static layers (independent of rot/zoom/pan/filter) — memoised so spinning or
  // zooming never re-renders the ~1000 circles + links.
  const linksEl = useMemo(
    () => (
      <g className="cg-links" fill="none">
        {layout.links.map((l) => (
          <path key={l.id} d={linkPath(l.sa, l.sr, l.ta, l.tr)} />
        ))}
      </g>
    ),
    [layout.links],
  );
  const circlesEl = useMemo(
    () => (
      <g className="cg-nodes">
        {layout.nodes.map((p) => {
          const [x, y] = polar(p.angle, p.radius);
          const fill =
            p.node.kind === "root"
              ? "#111"
              : p.node.kind === "dir"
                ? themeColor(p.node.theme, palette)
                : themeColor(p.node.theme, palette, 0.6);
          const onPath = !!pathIds?.has(p.id);
          const isRead = !!readIds?.has(p.id);
          const fog = readIds !== null && p.node.kind === "note" && !isRead;
          const dim =
            p.node.kind !== "root" &&
            ((filter !== null && p.node.theme !== filter) || (pathIds !== null && !onPath));
          return (
            <circle
              key={p.id}
              data-node
              data-kind={p.node.kind}
              data-theme={p.node.theme}
              data-href={p.node.href ?? ""}
              data-angle={p.angle}
              data-label={p.node.label}
              cx={x.toFixed(1)}
              cy={y.toFixed(1)}
              r={onPath || isRead ? Math.max(3.4, nodeR(p)) : nodeR(p)}
              fill={isRead ? themeColor(p.node.theme, palette) : fill}
              className={[onPath && "cg-path-node", isRead && "cg-read-node"].filter(Boolean).join(" ") || undefined}
              opacity={dim ? 0.07 : fog ? 0.16 : undefined}
              style={p.node.href ? { cursor: "pointer" } : undefined}
            />
          );
        })}
      </g>
    ),
    [layout.nodes, palette, filter, pathIds, readIds],
  );
  // The chosen path's prerequisite edges, bowed towards the centre so they
  // read apart from the folder spokes.
  const pathEl = pathView && clusters ? (
    <g className="cg-path-edges" fill="none">
      {pathView.edges.map(([a, b]) => {
        const p = clusterXY.get(a.id);
        const q = clusterXY.get(b.id);
        if (!p || !q) return null;
        // A slight bow, so a back-and-forth pair reads as two arrows.
        const mx = (p.x + q.x) / 2 - (q.y - p.y) * 0.15;
        const my = (p.y + q.y) / 2 + (q.x - p.x) * 0.15;
        return (
          <path
            key={`${a.id}>${b.id}`}
            d={`M${p.x.toFixed(1)},${p.y.toFixed(1)}Q${mx.toFixed(1)},${my.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`}
            markerEnd="url(#cg-path-arrow)"
          />
        );
      })}
    </g>
  ) : pathView && (
    <g className="cg-path-edges" fill="none">
      {pathView.edges.map(([a, b]) => {
        const [x1, y1] = polar(a.angle, a.radius);
        const [x2, y2] = polar(b.angle, b.radius);
        const span = Math.abs(a.angle - b.angle);
        const d = Math.min(span, TAU - span);
        const mid = (a.angle + b.angle) / 2 + (span > Math.PI ? Math.PI : 0);
        // Neighbours on the rim get a shallow bow, far-apart notes a deep one.
        const bow = Math.min(0.3, 0.03 + d * 0.6);
        const [qx, qy] = polar(mid, Math.min(a.radius, b.radius) * (1 - bow));
        return (
          <path
            key={`${a.id}>${b.id}`}
            d={`M${x1.toFixed(1)},${y1.toFixed(1)}Q${qx.toFixed(1)},${qy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`}
            markerEnd="url(#cg-path-arrow)"
          />
        );
      })}
    </g>
  );

  // Radial labels for EVERY sub-folder and file (classic dendrogram treatment:
  // text runs along the spoke, flipped on the left half so it always reads
  // outward). Kept OUTSIDE the rotating group and positioned at (angle + rot) so
  // the flip is recomputed for the label's CURRENT position — otherwise text
  // ends up upside-down once the ring is spun past ~90°. Each label carries the
  // same data-* as its node so clicking the text opens the note (or spins the
  // folder) just like clicking the dot. File names only show once zoomed in
  // (CSS, via the svg's data-zoomed flag) — else the rim is an illegible pile.
  const labelsLayer = useMemo(
    () => (
      <g className="cg-labels">
        {layout.nodes.map((p) => {
          if (p.node.kind === "root") return null;
          const a = ((p.angle + rot) % TAU + TAU) % TAU;
          const deg = (a * 180) / Math.PI - 90;
          const flip = a >= Math.PI;
          const isDir = p.node.kind === "dir";
          return (
            <text
              key={p.id}
              className={`${isDir ? "cg-dlabel" : "cg-flabel"}${pathIds?.has(p.id) ? " is-path" : ""}${readIds?.has(p.id) ? " is-read" : ""}`}
              data-node
              data-kind={p.node.kind}
              data-href={p.node.href ?? ""}
              data-angle={p.angle}
              data-label={p.node.label}
              transform={`rotate(${deg.toFixed(2)}) translate(${(p.radius + 5).toFixed(1)},0)${flip ? " rotate(180)" : ""}`}
              textAnchor={flip ? "end" : "start"}
              dominantBaseline="central"
              style={p.node.href ? { cursor: "pointer" } : undefined}
            >
              {p.node.label}
            </text>
          );
        })}
      </g>
    ),
    [layout.nodes, rot, pathIds, readIds],
  );

  // Phone clusters: spokes from each family's hub to its notes, the notes,
  // then the hubs. Same dimming rules as the ring (family filter, path,
  // "Mes lectures").
  const clusterEl = useMemo(() => {
    if (!clusters) return null;
    const hubAt = new Map(clusters.hubs.map((h) => [h.family, h]));
    return (
      <>
        <g className="cg-links cg-spokes" fill="none">
          {clusters.notes.map((n) => {
            const h = hubAt.get(n.family)!;
            const dim = (famFilter !== null && n.family !== famFilter) || (pathIds !== null && !pathIds.has(n.id));
            return (
              <line
                key={n.id}
                x1={h.x.toFixed(1)}
                y1={h.y.toFixed(1)}
                x2={n.x.toFixed(1)}
                y2={n.y.toFixed(1)}
                opacity={dim ? 0.15 : undefined}
              />
            );
          })}
        </g>
        <g className="cg-nodes">
          {clusters.notes.map((n) => {
            const onPath = !!pathIds?.has(n.id);
            const isRead = !!readIds?.has(n.id);
            const fog = readIds !== null && !isRead;
            const dim = (famFilter !== null && n.family !== famFilter) || (pathIds !== null && !onPath);
            return (
              <circle
                key={n.id}
                data-node
                data-kind="note"
                data-href={n.node.href ?? ""}
                data-label={n.node.label}
                cx={n.x.toFixed(1)}
                cy={n.y.toFixed(1)}
                r={onPath || isRead ? 3.6 : 2.6}
                data-family={n.family}
                className={[onPath && "cg-path-node", isRead && "cg-read-node"].filter(Boolean).join(" ") || undefined}
                opacity={dim ? 0.08 : fog ? 0.16 : undefined}
              />
            );
          })}
          {clusters.hubs.map((h) => (
            <circle
              key={h.family}
              data-node
              data-family={h.family}
              data-hub={h.family}
              data-label={tr(`parcours.family.${h.family}`)}
              cx={h.x.toFixed(1)}
              cy={h.y.toFixed(1)}
              r={9}
              opacity={famFilter !== null && h.family !== famFilter ? 0.2 : undefined}
              style={{ cursor: "pointer" }}
            />
          ))}
        </g>
      </>
    );
    // tr only reads the locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters, famFilter, pathIds, readIds, locale]);

  // --- interaction ---------------------------------------------------------
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  // Pinch-to-zoom (touch): tracks every active pointer so a 2nd finger down is
  // detected, then anchors zoom+pan to the pinch's ORIGINAL midpoint (not
  // frame-to-frame) so the content under the fingers stays under the fingers —
  // covers a plain pinch, a 2-finger pan, or both at once, the way map apps do.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{
    dist: number;
    midX: number;
    midY: number;
    angle: number; // atan2 of the vector between the two fingers — drives 2-finger rotate
    zoom: number;
    panX: number;
    panY: number;
    rot: number;
  } | null>(null);

  // Anchored on the cursor (not the viewport centre): the content point under
  // the pointer stays under it as zoom changes, like any map/canvas tool.
  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.min(8, Math.max(0.05, zoom * factor));
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const localX = (px - cx - pan.x) / zoom;
    const localY = (py - cy - pan.y) / zoom;
    setZoom(newZoom);
    setPan({ x: px - cx - newZoom * localX, y: py - cy - newZoom * localY });
  };
  const onPointerDown = (e: ReactPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      drag.current = null; // a 2nd finger always takes over from a single-finger pan
      const rect = wrapRef.current!.getBoundingClientRect();
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        midX: (a.x + b.x) / 2 - rect.left,
        midY: (a.y + b.y) / 2 - rect.top,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        zoom,
        panX: pan.x,
        panY: pan.y,
        rot,
      };
      return;
    }
    if (pointers.current.size > 2) return; // ignore a 3rd+ finger
    if ((e.target as Element).closest("[data-node]")) return; // let clicks through
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current && pointers.current.size >= 2) {
      const rect = wrapRef.current!.getBoundingClientRect();
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const midX = (a.x + b.x) / 2 - rect.left;
      const midY = (a.y + b.y) / 2 - rect.top;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const p = pinch.current;
      const newZoom = Math.min(8, Math.max(0.05, p.zoom * (dist / p.dist)));
      // The content point that sat under the pinch's starting midpoint, kept
      // under the CURRENT midpoint as zoom/pan both update.
      const localX = (p.midX - cx - p.panX) / p.zoom;
      const localY = (p.midY - cy - p.panY) / p.zoom;
      setZoom(newZoom);
      setPan({ x: midX - cx - newZoom * localX, y: midY - cy - newZoom * localY });
      // Twist the two fingers around each other to rotate the ring — folder
      // clicks used to do this but now always navigate (see onClick), so this
      // is the only rotate affordance left on touch besides the locate field.
      if (!clusters) setRot((((p.rot + (angle - p.angle)) % TAU) + TAU) % TAU);
      return;
    }
    if (drag.current) {
      setPan({
        x: drag.current.px + (e.clientX - drag.current.x),
        y: drag.current.py + (e.clientY - drag.current.y),
      });
      return;
    }
    const hit = (e.target as Element).closest("[data-node]");
    if (hit) {
      const label = hit.getAttribute("data-label") || "";
      const rect = wrapRef.current!.getBoundingClientRect();
      setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, label });
    } else if (tip) {
      setTip(null);
    }
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };
  const onClick = (e: ReactMouseEvent) => {
    const hit = (e.target as Element).closest("[data-node]");
    if (!hit) return;
    const fam = hit.getAttribute("data-hub") as FamilyKey | null;
    if (fam) {
      setPathSel(null);
      setFamFilter((f) => (f === fam ? null : fam));
      return;
    }
    const href = hit.getAttribute("data-href");
    if (href) {
      window.location.href = href;
      return;
    }
    // Every folder/note now carries an href (folders → their note list), so
    // only the root ever reaches here — recentring it is a harmless no-op.
    const a = parseFloat(hit.getAttribute("data-angle") || "0");
    setRot(((-a % TAU) + TAU) % TAU);
  };

  // --- locate: search box that spins+zooms to a match without navigating,
  // so you can see it in context before deciding to open it (opening it is
  // still just a click away, same as any other node). ---
  const [query, setQuery] = useState("");
  const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const matches = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return layout.nodes
      .filter(
        (n) =>
          n.node.kind !== "root" &&
          (!clusters || clusterXY.has(n.id)) &&
          normalize(n.node.label).includes(q),
      )
      .sort((a, b) => {
        const ad = a.node.kind === "dir" ? 0 : 1;
        const bd = b.node.kind === "dir" ? 0 : 1;
        if (ad !== bd) return ad - bd;
        return a.node.label.localeCompare(b.node.label, undefined, { numeric: true });
      })
      .slice(0, 8);
  }, [layout.nodes, query, clusters, clusterXY]);
  function locate(n: Positioned) {
    // Rotating the match to angle 0 (12 o'clock) puts it at local (0, -radius)
    // — straight up from the origin, NOT at the origin. pan:{0,0} only
    // recentres the origin, so anything but a near-root node (most searches:
    // files sit at the rim) landed far off-screen. Pan by zoom*radius to bring
    // the MATCH itself to the viewport centre instead.
    const c = clusterXY.get(n.id);
    if (c) {
      const z = fitZoom * 3;
      setZoom(z);
      setPan({ x: -z * c.x, y: PHONE_BAND - z * c.y });
      setQuery("");
      return;
    }
    const z = fitZoom * 2.8;
    setRot(((-n.angle % TAU) + TAU) % TAU);
    setZoom(z);
    setPan({ x: 0, y: z * n.radius });
    setQuery("");
  }

  // Choosing a path turns its notes to face the top and zooms in on them.
  function selectPath(slug: string | null) {
    setPathSel(slug);
    if (!slug) return;
    setFilter(null);
    const p = data.paths?.find((x) => x.slug === slug);
    const pos = (p?.notes ?? [])
      .map((s) => byId.get(`file:/posts/${s}/`))
      .filter((n): n is Positioned => !!n);
    if (!pos.length) return;
    if (clusters) {
      setFamFilter(null);
      const xy = pos.map((n) => clusterXY.get(n.id)).filter((c) => !!c);
      if (!xy.length) return;
      const xs = xy.map((c) => c.x);
      const ys = xy.map((c) => c.y);
      const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const my = (Math.min(...ys) + Math.max(...ys)) / 2;
      const span = Math.max(40, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const z = Math.min(fitZoom * 4, Math.max(fitZoom, (0.6 * size.w) / span));
      setZoom(z);
      setPan({ x: -z * mx, y: PHONE_BAND - z * my });
      return;
    }
    // Circular mean of the angles; mean radius.
    const sx = pos.reduce((a, n) => a + Math.sin(n.angle), 0);
    const cy0 = pos.reduce((a, n) => a + Math.cos(n.angle), 0);
    const angle = Math.atan2(sx, cy0);
    const radius = pos.reduce((a, n) => a + n.radius, 0) / pos.length;
    // Zoom so the path's arc (its notes' angular spread on the rim) fills
    // about half the screen, within the usual zoom range.
    const spread = Math.max(...pos.map((n) => {
      const d = Math.abs(((n.angle - angle + Math.PI) % TAU + TAU) % TAU - Math.PI);
      return d;
    }));
    const arc = Math.max(40, 2 * spread * radius);
    const z = Math.min(fitZoom * 5, Math.max(fitZoom * 2.2, (0.5 * Math.min(size.w, size.h)) / arc));
    setRot(((-angle % TAU) + TAU) % TAU);
    setZoom(z);
    // The rim a little above the centre: room for the labels above it and
    // for the prerequisite arcs that bow inwards below it.
    setPan({ x: 0, y: z * radius - 0.08 * size.h });
  }

  const disciplines = useMemo(
    () => [...palette.keys()].sort((a, b) => folderName(a).localeCompare(folderName(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [palette, locale],
  );

  // The home mini-map is a static, non-interactive teaser: no chrome, no labels,
  // pointer-events off so the click falls through to the wrapping <a> → /graph.
  const handlers = preview
    ? {}
    : {
        onWheel,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerLeave: onPointerUp,
        onClick,
      };

  // "Mes lectures" on: where to go next, under the switch (ring and phone).
  const mineNext = reading && (
    <div className="cg-mine-next">
      <p className="cg-mine-next-k">
        {reading.fromReading
          ? tr("graph.mineNext")
          : reading.read.size
            ? tr("graph.mineNoNeighbour")
            : tr("graph.mineStart")}
      </p>
      <ul>
        {reading.next.map((id) => {
          const n = byId.get(id);
          if (!n) return null;
          return (
            <li key={id}>
              <button type="button" onClick={() => locate(n)} title={tr("graph.mineLocate")}>
                <span
                  className="cg-swatch"
                  style={{ background: themeColor(n.node.theme, palette) }}
                />
                {n.node.label}
              </button>
              <a href={n.node.href} aria-label={tr("graph.mineOpen", { title: n.node.label })}>
                →
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const selPath = pathSel ? data.paths?.find((p) => p.slug === pathSel) : undefined;
  const pathName = selPath ? localPathName(selPath, "full", locale) : undefined;
  const resetView = () => {
    setRot(0);
    setZoom(fitZoom);
    setPan({ x: 0, y: clusters ? PHONE_BAND : 0 });
    setFilter(null);
    setFamFilter(null);
    setPathSel(null);
  };
  // Phones: the sheet as a settings page — two rows (switch, chooser), the
  // seven families as chips, one wide reset button.
  const phoneSheet = (
    <>
      <div className="cg-rows">
        {reading && (
          <button type="button" className="cg-row" role="switch" aria-checked={mine} onClick={() => setMine((v) => !v)}>
            <span className="cg-row-text">
              <b>{tr("graph.mine")}</b>
              <small>
                {tr("graph.mineHint", {
                  n: reading.read.size.toLocaleString(locale),
                  total: reading.total.toLocaleString(locale),
                })}
              </small>
            </span>
            <span className="cg-switch" aria-hidden="true" />
          </button>
        )}
        {!!data.paths?.length && (
          <label className="cg-row">
            <span className="cg-row-text">
              <b>{tr("graph.path")}</b>
              <small>{tr("graph.pathHint")}</small>
            </span>
            <span className="cg-row-value">{pathName ?? tr("graph.pathNoneShort")}</span>
            <svg className="cg-row-chev" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
            <select
              className="cg-row-select"
              value={pathSel ?? ""}
              aria-label={tr("graph.pathAria")}
              onChange={(e) => selectPath(e.target.value || null)}
            >
              <option value="">{tr("graph.pathNone")}</option>
              {data.paths.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {localPathName(p, "full", locale)} ({p.notes.length})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {mine && mineNext}
      <p className="cg-sheet-k">{tr("graph.disciplines")}</p>
      <ul className="cg-chips">
        <li>
          <button
            type="button"
            aria-pressed={famFilter === null}
            onClick={() => setFamFilter(null)}
          >
            {tr("graph.allFamilies")}
          </button>
        </li>
        {FAMILIES.filter((f) => clusters?.hubs.some((h) => h.family === f)).map((f) => (
          <li key={f}>
            <button
              type="button"
              aria-pressed={famFilter === f}
              onClick={() => {
                setPathSel(null);
                setFamFilter((v) => (v === f ? null : f));
              }}
            >
              <span className="cg-swatch" data-family={f} />
              {tr(`parcours.family.${f}`)}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="cg-reset-wide" onClick={resetView}>
        {tr("graph.resetView")}
      </button>
    </>
  );

  return (
    <div ref={wrapRef} className={preview ? "cg-preview" : "graph-page cg-root"}>
      <svg
        className="cg-svg"
        width={size.w}
        height={size.h}
        data-filter={filter ?? pathSel ?? undefined}
        data-path={pathSel ?? undefined}
        data-mine={readIds ? "" : undefined}
        data-zoomed={!preview && zoom >= fitZoom * 1.8 ? "" : undefined}
        style={preview ? { pointerEvents: "none" } : undefined}
        {...handlers}
      >
        {!preview && (
          <defs>
            <marker
              id="cg-path-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L9,5 L0,9 z" className="cg-path-arrowhead" />
            </marker>
          </defs>
        )}
        {clusters ? (
          <>
            <g transform={`translate(${cx + pan.x},${cy + pan.y}) scale(${zoom})`}>
              {clusterEl}
              {pathEl}
            </g>
            {/* Family names in screen units, so they stay 13px at any zoom. */}
            <g className="cg-hub-labels">
              {clusters.hubs.map((h) => (
                <text
                  key={h.family}
                  data-node
                  data-hub={h.family}
                  data-label={tr(`parcours.family.${h.family}`)}
                  x={(cx + pan.x + h.x * zoom).toFixed(1)}
                  y={(cy + pan.y + h.y * zoom - 9 * zoom - 7).toFixed(1)}
                  textAnchor="middle"
                  opacity={famFilter !== null && h.family !== famFilter ? 0.35 : undefined}
                >
                  {tr(`parcours.family.${h.family}`)}
                </text>
              ))}
            </g>
          </>
        ) : (
        <g transform={`translate(${cx + pan.x},${cy + pan.y}) scale(${zoom})`}>
          <g transform={`rotate(${(rot * 180) / Math.PI})`}>
            {linksEl}
            {pathEl}
            {circlesEl}
          </g>
          {/* Labels live outside the rotating group so their flip tracks the
              current (rotated) position instead of going upside-down. */}
          {!preview && labelsLayer}
          {!preview && (
            <text className="cg-label-root" y="26" textAnchor="middle">
              {rootLabel}
            </text>
          )}
        </g>
        )}
      </svg>

      {preview && <span className="sr-only">{rootLabel}</span>}

      {!preview && (
        <>
          <AppBack href="/notes/" labelKey="tabbar.notes" />
          <a href="/" className="old-back graph-back">
            ← {tr("nav.home")}
          </a>

          <div className="cg-locate">
            <svg className="cg-locate-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              type="search"
              className="cg-locate-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("graph.locatePlaceholder")}
              aria-label={tr("graph.locateAria")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches[0]) {
                  locate(matches[0]);
                  (e.currentTarget as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setQuery("");
                }
              }}
            />
            {matches.length > 0 && (
              <ul className="cg-locate-results">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => locate(m)}>
                      <span
                        className="cg-swatch"
                        style={{
                          background: themeColor(
                            m.node.theme,
                            palette,
                            m.node.kind === "dir" ? 1 : 0.6,
                          ),
                        }}
                      />
                      {m.node.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Phones: the panel opens as a bottom sheet from these pills
              (graph.css); from 640px up they stay hidden. */}
          <div className="cg-pills">
            <button type="button" className="cg-pill" aria-expanded={sheet} onClick={() => setSheet(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="10" cy="17" r="2" />
              </svg>
              {tr("graph.settings")}
            </button>
            {reading && (
              <button type="button" className="cg-pill" aria-pressed={mine} onClick={() => setMine((v) => !v)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                {tr("graph.mine")} · {reading.read.size}
              </button>
            )}
          </div>
          {sheet && <div className="cg-scrim" onClick={() => setSheet(false)} aria-hidden="true" />}

          {/* Discipline legend + roulette control */}
          <div className="cg-panel" data-sheet={sheet ? "open" : undefined}>
            <div className="cg-sheet-head">
              <span className="cg-sheet-grab" aria-hidden="true" />
              <b>{tr("graph.settingsTitle")}</b>
              <button type="button" onClick={() => setSheet(false)}>
                {tr("graph.settingsDone")}
              </button>
            </div>
        {clusters ? (
          phoneSheet
        ) : (
        <>
        <div className="cg-roulette">
          <span className="cg-rot-label">{tr("graph.rotate")}</span>
          <button
            type="button"
            className="cg-rot-btn"
            aria-label={tr("graph.rotateLeft")}
            onClick={() => setRot((r) => ((r - ROT_STEP) % TAU + TAU) % TAU)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="cg-rot-btn"
            aria-label={tr("graph.rotateRight")}
            onClick={() => setRot((r) => (r + ROT_STEP) % TAU)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M9 5 L16 12 L9 19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="cg-reset"
            onClick={() => {
              setRot(0);
              setZoom(fitZoom);
              setPan({ x: 0, y: 0 });
              setFilter(null);
              setPathSel(null);
            }}
          >
            {tr("graph.reset")}
          </button>
        </div>
        {reading && (
          <div className="cg-mine">
            <button
              type="button"
              className="cg-mine-toggle"
              aria-pressed={mine}
              onClick={() => setMine((v) => !v)}
            >
              <span className="cg-mine-dot" aria-hidden="true" />
              {tr("graph.mine")}
              <span className="cg-mine-count">
                {tr("graph.mineCount", { n: reading.read.size, total: reading.total })}
              </span>
            </button>
            {mine && mineNext}
          </div>
        )}
        {!!data.paths?.length && (
          <label className="cg-path">
            <span className="cg-path-label">{tr("graph.path")}</span>
            <select
              value={pathSel ?? ""}
              aria-label={tr("graph.pathAria")}
              onChange={(e) => selectPath(e.target.value || null)}
            >
              <option value="">{tr("graph.pathNone")}</option>
              {data.paths.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {localPathName(p, "full", locale)} ({p.notes.length})
                </option>
              ))}
            </select>
          </label>
        )}
        {/* Below 640px this becomes a collapse toggle (CSS-only above that
            width — the button stays hidden and the list stays open). */}
        <button
          type="button"
          className="cg-legend-toggle"
          aria-expanded={legendOpen}
          onClick={() => setLegendOpen((v) => !v)}
        >
          {tr("graph.disciplines")}
          <span aria-hidden="true">{legendOpen ? "▲" : "▼"}</span>
        </button>
        <ul className="cg-legend" data-open={legendOpen || undefined}>
          {disciplines.map((d) => (
            <li key={d}>
              <button
                type="button"
                aria-pressed={filter === d}
                className={filter === d ? "on" : undefined}
                onClick={() => {
                  setPathSel(null);
                  setFilter((f) => (f === d ? null : d));
                }}
              >
                <span className="cg-swatch" style={{ background: themeColor(d, palette) }} />
                {folderName(d)}
              </button>
            </li>
          ))}
            </ul>
        </>
        )}
          </div>

          {tip && (
            <div className="cg-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
              {tip.label}
            </div>
          )}

          <div className="graph-hint graph-hint-desktop">{tr("graph.hint")}</div>
          <div className="graph-hint graph-hint-touch">{tr("graph.hintTouch")}</div>
        </>
      )}
    </div>
  );
}
