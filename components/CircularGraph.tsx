"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type MouseEvent as ReactMouseEvent } from "react";
import { stratify, cluster, type HierarchyNode } from "d3-hierarchy";
import type { GraphData, GraphNode } from "@/lib/graph-data";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

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
  const tr = (k: string) => t(k, undefined, locale);
  const layout = useMemo(() => buildLayout(data), [data]);
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
  const [tip, setTip] = useState<{ x: number; y: number; label: string } | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

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

  const fitZoom = useMemo(
    () => Math.min(size.w, size.h) / (2 * layout.radius * 1.18),
    [size, layout.radius],
  );
  // Adopt the fit zoom on first measure / data change. The full graph opens a
  // little zoomed in on the centre (arriving from the home mini-map); the
  // preview fits the whole folder ring in its box.
  useEffect(() => {
    setZoom(preview ? fitZoom : fitZoom * 2.8);
    setPan({ x: 0, y: 0 });
  }, [fitZoom, preview]);

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
          const dim = filter !== null && p.node.kind !== "root" && p.node.theme !== filter;
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
              r={nodeR(p)}
              fill={fill}
              opacity={dim ? 0.07 : undefined}
              style={p.node.href ? { cursor: "pointer" } : undefined}
            />
          );
        })}
      </g>
    ),
    [layout.nodes, palette, filter],
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
              className={isDir ? "cg-dlabel" : "cg-flabel"}
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
    [layout.nodes, rot],
  );

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
      setRot((((p.rot + (angle - p.angle)) % TAU) + TAU) % TAU);
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
      .filter((n) => n.node.kind !== "root" && normalize(n.node.label).includes(q))
      .sort((a, b) => {
        const ad = a.node.kind === "dir" ? 0 : 1;
        const bd = b.node.kind === "dir" ? 0 : 1;
        if (ad !== bd) return ad - bd;
        return a.node.label.localeCompare(b.node.label, undefined, { numeric: true });
      })
      .slice(0, 8);
  }, [layout.nodes, query]);
  function locate(n: Positioned) {
    // Rotating the match to angle 0 (12 o'clock) puts it at local (0, -radius)
    // — straight up from the origin, NOT at the origin. pan:{0,0} only
    // recentres the origin, so anything but a near-root node (most searches:
    // files sit at the rim) landed far off-screen. Pan by zoom*radius to bring
    // the MATCH itself to the viewport centre instead.
    const z = fitZoom * 2.8;
    setRot(((-n.angle % TAU) + TAU) % TAU);
    setZoom(z);
    setPan({ x: 0, y: z * n.radius });
    setQuery("");
  }

  const disciplines = useMemo(
    () => [...palette.keys()].sort((a, b) => a.localeCompare(b)),
    [palette],
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

  return (
    <div ref={wrapRef} className={preview ? "cg-preview" : "graph-page cg-root"}>
      <svg
        className="cg-svg"
        width={size.w}
        height={size.h}
        data-filter={filter ?? undefined}
        data-zoomed={!preview && zoom >= fitZoom * 1.8 ? "" : undefined}
        style={preview ? { pointerEvents: "none" } : undefined}
        {...handlers}
      >
        <g transform={`translate(${cx + pan.x},${cy + pan.y}) scale(${zoom})`}>
          <g transform={`rotate(${(rot * 180) / Math.PI})`}>
            {linksEl}
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
      </svg>

      {preview && <span className="sr-only">{rootLabel}</span>}

      {!preview && (
        <>
          <a href="/" className="graph-back">
            ← {tr("nav.home")}
          </a>

          <div className="cg-locate">
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

          {/* Discipline legend + roulette control */}
          <div className="cg-panel">
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
            }}
          >
            {tr("graph.reset")}
          </button>
        </div>
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
                onClick={() => setFilter((f) => (f === d ? null : d))}
              >
                <span className="cg-swatch" style={{ background: themeColor(d, palette) }} />
                {d}
              </button>
            </li>
          ))}
            </ul>
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
