"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphData, GraphNode, GraphLink } from "@/lib/graph-data";
import { escapeHtml } from "@/lib/escape";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

type ThemePalette = Map<string, string>;

/** "es" → "espagnol"/"Spanish"/… in the active UI locale; falls back to the
 * raw code for one Intl.DisplayNames doesn't recognise. */
function langLabel(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Build the per-theme colour table once from the graph's nodes. Distinct
 * disciplines are sorted then spaced around the hue wheel by the golden angle
 * (137.5°), which packs them as far apart as possible (sunflower distribution)
 * instead of letting a raw hash bunch them up; lightness alternates so even
 * near-hue neighbours stay tellable apart. Stored as a bare "H S% L%" triple so
 * themeColor can wrap it with or without an alpha. */
function buildThemePalette(data: GraphData): ThemePalette {
  const themes = [...new Set(data.nodes.map((n) => n.theme))]
    .filter((t) => t && t !== "root")
    .sort();
  const palette: ThemePalette = new Map();
  themes.forEach((t, i) => {
    const hue = Math.round((i * 137.508) % 360);
    const light = i % 2 ? 50 : 58;
    palette.set(t, `${hue} 45% ${light}%`);
  });
  return palette;
}

/** Colour for a node/edge's "grand thème" (a discipline = level-2 folder).
 * `alpha` < 1 returns an hsl(… / a) string for edges and dimmed nodes. Unthemed
 * entries (the root, or notes sitting directly at the vault root) fall back to
 * neutral grey. */
function themeColor(theme: string, palette: ThemePalette, alpha = 1): string {
  const base = theme && theme !== "root" ? palette.get(theme) : undefined;
  if (!base) return alpha < 1 ? `rgba(212,212,212,${alpha})` : "#d4d4d4";
  return alpha < 1 ? `hsl(${base} / ${alpha})` : `hsl(${base})`;
}

const COLOR_TEXT = "#111";
const COLOR_DIM_TEXT = "rgba(85,85,85,0.28)";
const COLOR_EDGE_DIM = "rgba(212,212,212,0.2)";
const COLOR_EDGE_FOCUS = "#003366";
const COLOR_ROOT = "#111";
const COLOR_NOTE_FOCUS = "#003366";

function nodeFill(
  node: GraphNode,
  focus: boolean,
  dim: boolean,
  palette: ThemePalette,
): string {
  if (node.kind === "root") return dim ? "rgba(17,17,17,0.25)" : COLOR_ROOT;
  if (node.kind === "dir") {
    return dim ? themeColor(node.theme, palette, 0.22) : themeColor(node.theme, palette);
  }
  // Notes: small dots tinted by their discipline, so the outer ring reads as
  // coloured clusters. Light up to link-blue when in the hover focus set.
  if (focus) return COLOR_NOTE_FOCUS;
  return themeColor(node.theme, palette, dim ? 0.12 : 0.6);
}

function nodeRadius(node: GraphNode): number {
  if (node.kind === "root") return 16;
  // Size by depth in the folder tree: the top-level disciplines (Social
  // Sciences, Applied Sciences) read as very large hubs, and each nested level
  // is markedly smaller. Steep drop (−7px/level, floored at 5) so the hierarchy
  // is obvious at a glance. Notes/assets stay the smallest dots.
  if (node.kind === "dir") return Math.max(5, 30 - node.depth * 7);
  return 2;
}

interface CanvasNode extends GraphNode {
  x?: number;
  y?: number;
}

// Once force-graph hydrates the data, source/target may be either the original
// string id or the resolved node object — model both.
type CanvasLink = Omit<GraphLink, "source" | "target"> & {
  source: string | CanvasNode;
  target: string | CanvasNode;
};

type ForceGraphInstance = {
  width(n: number): ForceGraphInstance;
  height(n: number): ForceGraphInstance;
  graphData(d: GraphData): ForceGraphInstance;
  backgroundColor(c: string): ForceGraphInstance;
  nodeId(k: string): ForceGraphInstance;
  nodeRelSize(n: number): ForceGraphInstance;
  nodeVal(fn: (n: GraphNode) => number): ForceGraphInstance;
  nodeLabel(fn: (n: GraphNode) => string): ForceGraphInstance;
  nodeColor(fn: (n: GraphNode) => string): ForceGraphInstance;
  nodeCanvasObjectMode(fn: () => string): ForceGraphInstance;
  nodeCanvasObject(
    fn: (n: CanvasNode, ctx: CanvasRenderingContext2D, scale: number) => void,
  ): ForceGraphInstance;
  nodePointerAreaPaint(
    fn: (n: CanvasNode, color: string, ctx: CanvasRenderingContext2D) => void,
  ): ForceGraphInstance;
  linkColor(fn: (l: CanvasLink) => string): ForceGraphInstance;
  linkWidth(fn: (l: CanvasLink) => number): ForceGraphInstance;
  nodeVisibility(fn: (n: CanvasNode) => boolean): ForceGraphInstance;
  linkVisibility(fn: (l: CanvasLink) => boolean): ForceGraphInstance;
  resumeAnimation(): ForceGraphInstance;
  linkCurvature(v: number | ((l: CanvasLink) => number)): ForceGraphInstance;
  linkDirectionalArrowLength(n: number): ForceGraphInstance;
  linkDirectionalArrowRelPos(n: number): ForceGraphInstance;
  linkDirectionalArrowColor(fn: (l: CanvasLink) => string): ForceGraphInstance;
  dagMode(s: string): ForceGraphInstance;
  dagLevelDistance(n: number): ForceGraphInstance;
  onDagError(fn: (loop: unknown) => void): ForceGraphInstance;
  d3Force(name: string):
    | {
        strength?: (v: number | ((d: unknown) => number)) => unknown;
        distance?: (fn: (l: unknown) => number) => unknown;
        radius?: (v: number | ((d: unknown) => number)) => unknown;
      }
    | undefined;
  d3VelocityDecay(n: number): ForceGraphInstance;
  d3AlphaDecay(n: number): ForceGraphInstance;
  cooldownTicks(n: number): ForceGraphInstance;
  onEngineStop(fn: () => void): ForceGraphInstance;
  onNodeClick(fn: (n: GraphNode) => void): ForceGraphInstance;
  onNodeHover(fn: (n: GraphNode | null) => void): ForceGraphInstance;
  onBackgroundClick(fn: () => void): ForceGraphInstance;
  zoomToFit(ms: number, padding: number): ForceGraphInstance;
  centerAt(x: number, y: number, ms?: number): ForceGraphInstance;
  zoom(k: number, ms?: number): ForceGraphInstance;
  autoPauseRedraw(b: boolean): ForceGraphInstance;
  enableNodeDrag(b: boolean): ForceGraphInstance;
  _destructor?: () => void;
};

export function Graph({
  data,
  embedded = false,
}: {
  data: GraphData;
  /** Small, non-interactive preview (home page): no chrome, no drag/zoom; the
   *  parent wraps it in a link to /graph. */
  embedded?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Live handles so the search box (React) can drive the imperative graph.
  const graphRef = useRef<ForceGraphInstance | null>(null);
  const nodesRef = useRef<CanvasNode[]>([]);
  const [locate, setLocate] = useState("");
  const locale = useLocale();
  const tr = (k: string) => t(k, undefined, locale);

  // Decluttering controls (full graph only).
  const [filterTheme, setFilterTheme] = useState<string | null>(null);
  const [filterLang, setFilterLang] = useState<string | null>(null);
  const [showWiki, setShowWiki] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  // Mirrored into refs so the imperative render callbacks read live values.
  const filterRef = useRef<string | null>(null);
  const filterLangRef = useRef<string | null>(null);
  const showWikiRef = useRef(false);
  const showNotesRef = useRef(true);
  const refreshRef = useRef<(() => void) | null>(null);

  // Discipline list + colour key for the legend — same deterministic palette the
  // canvas uses, so swatches match the nodes.
  const legendPalette = useMemo(() => buildThemePalette(data), [data]);
  const themes = useMemo(
    () =>
      [...new Set(data.nodes.map((n) => n.theme))]
        .filter((t) => t && t !== "root")
        .sort(),
    [data],
  );
  // Language codes present on any note (frontmatter `lang`) — empty unless at
  // least one note is tagged, so the panel section only shows up when relevant.
  const langs = useMemo(
    () => [...new Set(data.nodes.map((n) => n.lang).filter((l): l is string => !!l))].sort(),
    [data],
  );

  // Push control state into the graph and force a redraw.
  useEffect(() => {
    filterRef.current = filterTheme;
    filterLangRef.current = filterLang;
    showWikiRef.current = showWiki;
    showNotesRef.current = showNotes;
    refreshRef.current?.();
  }, [filterTheme, filterLang, showWiki, showNotes]);

  // Find a node by (diacritic-insensitive) name and fly the camera to it — the
  // one decluttering aid a ~1000-node graph really needs.
  function locateNode(q: string) {
    const term = foldText(q);
    const g = graphRef.current;
    if (!term || !g) return;
    const nodes = nodesRef.current;
    const hit =
      nodes.find((n) => foldText(n.label) === term) ??
      nodes.find((n) => foldText(n.label).includes(term));
    if (!hit || hit.x == null || hit.y == null) return;
    g.centerAt(hit.x, hit.y, 700);
    g.zoom(4.5, 700);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let graph: ForceGraphInstance | null = null;
    let onResize: (() => void) | null = null;
    const neighbours = buildNeighbourIndex(data);
    const themeOf = new Map(data.nodes.map((n) => [n.id, n.theme]));
    const palette = buildThemePalette(data);
    // Containment-only degree, used to reproduce d3's default link strength
    // (1/min degree) for the tree edges — so adding wikilink edges (which get
    // zero force) leaves the radial layout pixel-for-pixel unchanged. Computed
    // now, before graphData() mutates source/target from ids into node objects.
    const treeDeg = new Map<string, number>();
    for (const l of data.links) {
      if (l.kind === "wikilink") continue;
      treeDeg.set(l.source, (treeDeg.get(l.source) ?? 0) + 1);
      treeDeg.set(l.target, (treeDeg.get(l.target) ?? 0) + 1);
    }
    let hoverId: string | null = null;

    (async () => {
      const mod = (await import("force-graph")) as unknown as {
        default: new () => (el: HTMLElement) => ForceGraphInstance;
      };
      if (cancelled || !ref.current) return;
      const ForceGraph = mod.default;
      graph = new ForceGraph()(el);
      graphRef.current = graph;
      nodesRef.current = data.nodes as CanvasNode[];

      // "Notes" toggle → hide leaf note/asset nodes (folders-only aggregation),
      // and any link that would dangle from a hidden node.
      const nodeVis = (n: CanvasNode) =>
        showNotesRef.current || (n.kind !== "note" && n.kind !== "asset");
      const linkVis = (l: CanvasLink) => {
        const s = typeof l.source === "string" ? null : l.source;
        const t = typeof l.target === "string" ? null : l.target;
        return (!s || nodeVis(s)) && (!t || nodeVis(t));
      };

      graph
        .backgroundColor("#fcfcfc")
        .width(el.clientWidth)
        .height(el.clientHeight)
        .graphData(data)
        .nodeId("id")
        .nodeRelSize(4)
        .nodeVal((n) => nodeRadius(n))
        .nodeLabel((n) => `<span class="graph-tip">${escapeHtml(n.label)}</span>`)
        .nodeColor((n) => nodeFill(n, false, false, palette))
        // Radial hierarchy: root at the centre, top folders form an inner ring,
        // sub-folders the next ring, notes the outer ring. Distributes leaves
        // angularly so a deep folder with many notes doesn't crush the layout.
        .dagMode("radialout")
        .dagLevelDistance(110)
        .onDagError(() => {})
        .linkColor((l) =>
          linkColor(l, themeOf, palette, hoverId, showWikiRef.current, filterRef.current),
        )
        .linkWidth((l) => linkWidth(l, neighbours, hoverId, showWikiRef.current))
        .nodeVisibility(nodeVis)
        .linkVisibility(linkVis)
        // Containment spokes stay straight (cleanest in a radial layout); the
        // [[wikilink]] cross-links arc gently so they read as a separate layer
        // and don't get mistaken for the centre-to-rim hierarchy. Arrows stay
        // off — direction is implicit for spokes, noise for the cross-links.
        .linkCurvature((l) => (l.kind === "wikilink" ? 0.18 : 0))
        .linkDirectionalArrowLength(0)
        // Custom drawing per node:
        //  - root → filled circle + Alegreya SC label below
        //  - dirs/notes → filled circle + tangential label radiating outward
        //    from the radial centre, so siblings on the same ring don't pile
        //    up on each other.
        .nodeCanvasObjectMode(() => "replace")
        .nodeCanvasObject((n, ctx, scale) => {
          // Discipline filter: everything outside the chosen theme reads as dimmed
          // (root stays as an anchor). Language filter is narrower — it only ever
          // dims individual *notes* (a folder can hold notes in several
          // languages, so folders/root/assets stay fully legible landmarks
          // regardless of which language is picked); it doesn't touch edges.
          const filteredOut =
            (filterRef.current !== null &&
              n.kind !== "root" &&
              n.theme !== filterRef.current) ||
            (filterLangRef.current !== null &&
              n.kind === "note" &&
              n.lang !== filterLangRef.current);
          const dim =
            filteredOut || (hoverId !== null && !isNeighbour(neighbours, hoverId, n.id));
          const focus =
            !filteredOut && hoverId !== null && isNeighbour(neighbours, hoverId, n.id);
          const r = nodeRadius(n);
          const x = n.x ?? 0;
          const y = n.y ?? 0;

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = nodeFill(n, focus, dim, palette);
          ctx.fill();

          if (n.kind === "root") {
            const fontSize = 13 / scale;
            ctx.font = `700 ${fontSize}px "Alegreya SC", "Alegreya SC Fallback", serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = dim ? COLOR_DIM_TEXT : COLOR_TEXT;
            ctx.fillText(n.label.toLowerCase(), x, y + r + 4 / scale);
            return;
          }

          // Home preview: colour clusters only. At this size the ~25 discipline
          // labels overlap into an illegible tangle; the full graph (one click
          // away) carries them. Keep just the central "garden" anchor drawn above.
          if (embedded) return;

          const isDir = n.kind === "dir";
          // Level-of-detail: drawing a rotated text label for every node (≈1000
          // notes) on every frame is what makes the graph lag — during the load
          // simulation and on each hover redraw. Only draw labels legible at the
          // current zoom; folders fade in as you zoom, notes only when close.
          // Names stay available via the hover tooltip and the focus highlight.
          const labelMinScale = isDir ? (n.depth <= 2 ? 0 : 1) : 1.8;
          if (scale < labelMinScale) return;
          // Viewport cull: force-graph invokes this for every node each frame, so
          // a deep zoom would otherwise still draw all ≈1000 note labels even when
          // most are off-screen. Skip those outside the visible canvas (+margin).
          const tr = ctx.getTransform();
          const sx = tr.a * x + tr.c * y + tr.e;
          const sy = tr.b * x + tr.d * y + tr.f;
          if (
            sx < -120 ||
            sx > ctx.canvas.width + 120 ||
            sy < -120 ||
            sy > ctx.canvas.height + 120
          ) {
            return;
          }
          const fontSize = isDir
            ? Math.max(9, 12 - n.depth) / scale
            : 7 / scale;
          const text = isDir ? n.label.toLowerCase() : n.label;
          const font = isDir
            ? `700 ${fontSize}px "Alegreya SC", "Alegreya SC Fallback", serif`
            : `400 ${fontSize}px "Alegreya", "Alegreya Fallback", serif`;
          const baseColor = isDir ? COLOR_TEXT : "rgba(60,60,60,0.85)";
          const labelColor = dim
            ? isDir
              ? COLOR_DIM_TEXT
              : "rgba(85,85,85,0.18)"
            : focus
              ? COLOR_EDGE_FOCUS
              : baseColor;

          // Angle from the radial centre (root sits at the simulation origin
          // in `radialout` mode). Flip labels in the left half so they read
          // right-side-up instead of upside-down.
          const angle = Math.atan2(y, x);
          const flipped = angle > Math.PI / 2 || angle < -Math.PI / 2;
          const gap = r + 3 / scale;

          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(flipped ? angle + Math.PI : angle);
          ctx.font = font;
          ctx.textAlign = flipped ? "right" : "left";
          ctx.textBaseline = "middle";
          ctx.fillStyle = labelColor;
          ctx.fillText(text, flipped ? -gap : gap, 0);
          ctx.restore();
        })
        .nodePointerAreaPaint((n, color, ctx) => {
          // Pad the clickable area so small note dots are easy to hit.
          const r = nodeRadius(n) + 4;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        })
        .d3VelocityDecay(0.55)
        .d3AlphaDecay(0.035)
        .cooldownTicks(180)
        .autoPauseRedraw(true)
        .enableNodeDrag(!embedded)
        .onNodeClick((n) => {
          if (!embedded && n.href) window.location.href = n.href;
        })
        .onNodeHover((n) => {
          hoverId = n ? n.id : null;
          el.style.cursor = n && n.href ? "pointer" : "default";
        })
        .onBackgroundClick(() => {
          hoverId = null;
        })
        .onEngineStop(() => {
          graph?.zoomToFit(500, embedded ? 16 : 80);
        });

      // Stronger many-body repulsion → siblings on the same ring spread out
      // angularly instead of bunching at one azimuth. The radial constraint
      // keeps the level fixed; charge only affects θ.
      const chargeForce = graph.d3Force("charge");
      if (chargeForce && typeof chargeForce.strength === "function") {
        chargeForce.strength(-220);
      }

      // Keep the layout driven purely by containment: tree edges get d3's
      // default strength, wikilink edges get zero (drawn, never pulling). The
      // cycles they introduce are dropped from the radial DAG by onDagError.
      const linkForce = graph.d3Force("link");
      if (linkForce && typeof linkForce.strength === "function") {
        linkForce.strength((l: unknown) => {
          const link = l as CanvasLink;
          if (link.kind === "wikilink") return 0;
          const [s, t] = linkEndpoints(link);
          return 1 / Math.min(treeDeg.get(s) ?? 1, treeDeg.get(t) ?? 1);
        });
      }

      // Re-evaluate visibility and force one render frame (autoPauseRedraw keeps
      // the canvas idle otherwise). Colours/widths read the refs live.
      refreshRef.current = () => {
        graph?.nodeVisibility(nodeVis).linkVisibility(linkVis).resumeAnimation();
      };

      onResize = () => {
        if (!graph || !ref.current) return;
        graph.width(ref.current.clientWidth).height(ref.current.clientHeight);
      };
      window.addEventListener("resize", onResize);
    })();

    return () => {
      cancelled = true;
      graphRef.current = null;
      refreshRef.current = null;
      if (onResize) window.removeEventListener("resize", onResize);
      if (graph && typeof graph._destructor === "function") graph._destructor();
    };
  }, [data]);

  // Embedded preview: bare canvas host, non-interactive so the wrapping <a> in
  // HomeContent takes the click through to /graph.
  if (embedded) {
    return <div ref={ref} className="h-full w-full [pointer-events:none]" />;
  }

  return (
    <section className="graph-page relative">
      <a className="graph-back" href="/">← {tr("graph.back")}</a>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          locateNode(locate);
        }}
        className="absolute z-10 flex items-center gap-2 rounded-full border border-[#d4d4d4] bg-[#fcfcfc]/90 px-3 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur bottom-4 left-1/2 -translate-x-1/2 sm:bottom-auto sm:left-auto sm:top-3 sm:right-3 sm:translate-x-0"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="shrink-0 text-[#787369]">
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M15.5 15.5 21 21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={locate}
          onChange={(e) => setLocate(e.target.value)}
          placeholder={tr("graph.locatePlaceholder")}
          aria-label={tr("graph.locateAria")}
          className="w-40 border-0 bg-transparent p-0 text-sm text-[#1a1a1a] outline-none placeholder:text-[#787369] sm:w-48"
        />
      </form>
      <div className="absolute left-3 top-12 z-10 w-52 rounded-md border border-[#e4e2dd] bg-[#fcfcfc]/92 p-3 text-sm text-[#1a1a1a] shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mb-2 flex gap-4">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={showWiki}
              onChange={(e) => setShowWiki(e.target.checked)}
            />
            <span>{tr("graph.links")}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={showNotes}
              onChange={(e) => setShowNotes(e.target.checked)}
            />
            <span>{tr("graph.notes")}</span>
          </label>
        </div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-meta uppercase tracking-[0.08em] text-[#787369]">
            {tr("graph.disciplines")}
          </span>
          {filterTheme && (
            <button
              type="button"
              onClick={() => setFilterTheme(null)}
              className="text-meta text-[#003366] hover:underline"
            >
              {tr("graph.all")}
            </button>
          )}
        </div>
        <ul className="m-0 max-h-56 list-none overflow-y-auto p-0">
          {themes.map((th) => (
            <li key={th}>
              <button
                type="button"
                onClick={() => setFilterTheme(filterTheme === th ? null : th)}
                className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left ${
                  filterTheme === th ? "bg-[#eef1f5] font-semibold" : "hover:bg-[#f3f1ec]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: themeColor(th, legendPalette) }}
                />
                <span className="truncate">{th}</span>
              </button>
            </li>
          ))}
        </ul>

        {/* Language filter (frontmatter `lang`) — a secondary facet, so pill
            chips rather than the discipline list's swatch style; only shown
            once at least one note is tagged. Dims individual notes only, never
            folders/root (see the nodeCanvasObject comment above). */}
        {langs.length > 0 && (
          <div className="mt-2 border-t border-[#e4e2dd] pt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-meta uppercase tracking-[0.08em] text-[#787369]">
                {tr("graph.langs")}
              </span>
              {filterLang && (
                <button
                  type="button"
                  onClick={() => setFilterLang(null)}
                  className="text-meta text-[#003366] hover:underline"
                >
                  {tr("graph.all")}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {langs.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setFilterLang(filterLang === code ? null : code)}
                  className={`rounded-full border px-2 py-0.5 text-meta ${
                    filterLang === code
                      ? "border-[#003366] bg-[#eef1f5] font-semibold text-[#003366]"
                      : "border-[#d4d4d4] hover:bg-[#f3f1ec]"
                  }`}
                >
                  {langLabel(code, locale)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div ref={ref} className="graph-canvas" />
      <div className="graph-hint">{tr("graph.hint")}</div>
    </section>
  );
}

function foldText(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function buildNeighbourIndex(data: GraphData): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const l of data.links) {
    const s = typeof l.source === "string" ? l.source : (l.source as unknown as { id: string }).id;
    const t = typeof l.target === "string" ? l.target : (l.target as unknown as { id: string }).id;
    if (!map.has(s)) map.set(s, new Set());
    if (!map.has(t)) map.set(t, new Set());
    map.get(s)!.add(t);
    map.get(t)!.add(s);
  }
  return map;
}

function isNeighbour(map: Map<string, Set<string>>, a: string, b: string): boolean {
  if (a === b) return true;
  return map.get(a)?.has(b) ?? false;
}

function linkEndpoints(l: CanvasLink): [string, string] {
  const s = typeof l.source === "string" ? l.source : l.source.id;
  const t = typeof l.target === "string" ? l.target : l.target.id;
  return [s, t];
}

// escapeHtml now lives in lib/escape (shared with the server HTML builders).

function linkColor(
  l: CanvasLink,
  themeOf: Map<string, string>,
  palette: ThemePalette,
  hoverId: string | null,
  showWiki: boolean,
  filterTheme: string | null,
): string {
  const [s, t] = linkEndpoints(l);
  const wiki = l.kind === "wikilink";
  const linkTheme = themeOf.get(wiki ? s : t) ?? "";
  const touches = hoverId !== null && (s === hoverId || t === hoverId);
  const filteredOut = filterTheme !== null && linkTheme !== filterTheme;
  if (wiki) {
    // Wikilink arcs criss-cross the radial layout, so they stay hidden at rest
    // and light up for the hovered note. The "Liens" toggle reveals them all,
    // faintly tinted by theme (and respecting the discipline filter).
    if (touches) return COLOR_EDGE_FOCUS;
    return showWiki && !filteredOut ? themeColor(linkTheme, palette, 0.18) : "rgba(0,0,0,0)";
  }
  if (touches) return COLOR_EDGE_FOCUS;
  if (filteredOut) return COLOR_EDGE_DIM;
  if (hoverId !== null) return COLOR_EDGE_DIM;
  // Containment spokes tint by their child's grand thème → a whole branch glows.
  return themeColor(linkTheme, palette, 0.5);
}

function linkWidth(
  l: CanvasLink,
  n: Map<string, Set<string>>,
  hoverId: string | null,
  showWiki: boolean,
): number {
  const [s, t] = linkEndpoints(l);
  const touches = hoverId !== null && (s === hoverId || t === hoverId);
  // Wikilinks: only the hovered note's, unless the "Liens" toggle is on.
  if (l.kind === "wikilink") return touches ? 1.2 : showWiki ? 0.4 : 0;
  if (hoverId === null) return 0.8;
  return touches ? 1.4 : 0.6;
}
