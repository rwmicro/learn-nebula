"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { buildNavigationPath } from "@/lib/tools"
import { loadBacklinks } from "@/lib/pensine-index"

// Live force-directed graph showing the local neighborhood of the current
// article (up to 2 hops). Continuous simulation via requestAnimationFrame,
// drag-to-rearrange nodes, wheel-zoom + pan, hover highlights, node size by
// degree, color by hop distance. No graph library — ~250 lines of pure React
// + SVG, GPU-cheap for the typical neighborhood size (< 60 nodes).

interface SimNode {
  id: string
  name: string
  x: number
  y: number
  vx: number
  vy: number
  hop: number
  degree: number
  pinned: boolean
}

interface SimEdge {
  source: string
  target: string
}

interface Viewport {
  x: number
  y: number
  scale: number
}

function shortName(path: string): string {
  return path.split("/").pop()?.replace(/\.[^/.]+$/, "") ?? path
}

// Build the bidirectional adjacency list from the backlinks inverted index,
// then BFS from the focused article to collect 2 hops with hop distance.
function neighborhood(
  graph: Record<string, string[]>,
  center: string,
  hops = 2,
): { nodes: Map<string, number>; edges: SimEdge[] } {
  const adj: Record<string, Set<string>> = {}
  for (const [target, sources] of Object.entries(graph)) {
    for (const src of sources) {
      ;(adj[src] ??= new Set()).add(target)
      ;(adj[target] ??= new Set()).add(src)
    }
  }

  const distance = new Map<string, number>([[center, 0]])
  let frontier = new Set<string>([center])
  for (let h = 0; h < hops; h++) {
    const next = new Set<string>()
    for (const id of frontier) {
      for (const n of adj[id] ?? []) {
        if (distance.has(n)) continue
        distance.set(n, h + 1)
        next.add(n)
      }
    }
    frontier = next
    if (frontier.size === 0) break
  }

  const edges: SimEdge[] = []
  for (const id of distance.keys()) {
    for (const n of adj[id] ?? []) {
      if (distance.has(n) && id < n) edges.push({ source: id, target: n })
    }
  }
  return { nodes: distance, edges }
}

interface GraphViewProps {
  currentPath: string
  onClose: () => void
}

export function GraphView({ currentPath, onClose }: GraphViewProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [graph, setGraph] = useState<Record<string, string[]> | null>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [hovered, setHovered] = useState<string | null>(null)
  const [, forceRender] = useState(0)

  // Mutable simulation state — survives across renders without re-allocation.
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<SimEdge[]>([])
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 })
  const alphaRef = useRef(1)
  const draggingRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const panningRef = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  // Adjacency lookup for hover highlights.
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map())

  useEffect(() => {
    loadBacklinks().then(setGraph)
  }, [])

  // Track container size for responsive SVG.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setSize({ w: rect.width, h: rect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Rebuild simulation whenever the focused article or the underlying graph changes.
  useEffect(() => {
    if (!graph) return
    const { nodes: distance, edges } = neighborhood(graph, currentPath, 2)

    // Compute degree per node.
    const degree = new Map<string, number>()
    for (const id of distance.keys()) degree.set(id, 0)
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    }

    // Adjacency for hover lookup.
    const adj = new Map<string, Set<string>>()
    for (const e of edges) {
      ;(adj.get(e.source) ?? adj.set(e.source, new Set()).get(e.source)!).add(e.target)
      ;(adj.get(e.target) ?? adj.set(e.target, new Set()).get(e.target)!).add(e.source)
    }
    adjacencyRef.current = adj

    const cx = size.w / 2
    const cy = size.h / 2
    nodesRef.current = Array.from(distance.entries()).map(([id, hop]) => {
      const angle = Math.random() * Math.PI * 2
      const radius = hop * 80 + 20
      return {
        id,
        name: shortName(id),
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        hop,
        degree: degree.get(id) ?? 0,
        pinned: hop === 0, // center stays put
      }
    })
    edgesRef.current = edges
    alphaRef.current = 1
    viewportRef.current = { x: 0, y: 0, scale: 1 }
    forceRender((n) => n + 1)
  }, [graph, currentPath, size.w, size.h])

  // Force simulation step.
  const step = useCallback(() => {
    const nodes = nodesRef.current
    const edges = edgesRef.current
    const alpha = alphaRef.current
    if (alpha <= 0.005 || nodes.length === 0) return

    const REPULSE = 2400
    const SPRING = 0.06
    const SPRING_LEN = 90
    const GRAVITY = 0.012
    const DAMPING = 0.78
    const cx = size.w / 2
    const cy = size.h / 2

    // Repulsion (Coulomb-ish, O(n²) is fine for ≤ ~100 nodes).
    for (let a = 0; a < nodes.length; a++) {
      const na = nodes[a]
      for (let b = a + 1; b < nodes.length; b++) {
        const nb = nodes[b]
        const dx = na.x - nb.x
        const dy = na.y - nb.y
        const distSq = dx * dx + dy * dy || 0.01
        const dist = Math.sqrt(distSq)
        const f = (REPULSE * alpha) / distSq
        const fx = (dx / dist) * f
        const fy = (dy / dist) * f
        na.vx += fx
        na.vy += fy
        nb.vx -= fx
        nb.vy -= fy
      }
    }

    // Spring attraction along edges.
    const idMap = new Map(nodes.map((n) => [n.id, n]))
    for (const e of edges) {
      const a = idMap.get(e.source)
      const b = idMap.get(e.target)
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const f = SPRING * alpha * (dist - SPRING_LEN)
      a.vx += (dx / dist) * f
      a.vy += (dy / dist) * f
      b.vx -= (dx / dist) * f
      b.vy -= (dy / dist) * f
    }

    // Gentle gravity to canvas center keeps disconnected components from drifting off.
    for (const n of nodes) {
      n.vx += (cx - n.x) * GRAVITY * alpha
      n.vy += (cy - n.y) * GRAVITY * alpha
    }

    // Integrate (skip pinned + dragged).
    const dragId = draggingRef.current?.id
    for (const n of nodes) {
      if (n.pinned || n.id === dragId) {
        n.vx = 0
        n.vy = 0
        continue
      }
      n.x += n.vx
      n.y += n.vy
      n.vx *= DAMPING
      n.vy *= DAMPING
    }

    // Cool the simulation gradually so motion settles instead of jittering.
    alphaRef.current = alpha * 0.992
  }, [size.w, size.h])

  // Continuous rAF loop. Re-render on every frame; React reconciliation for
  // ~30-60 elements is sub-ms.
  useEffect(() => {
    const loop = () => {
      step()
      forceRender((n) => (n + 1) % 1_000_000)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [step])

  // Keyboard: Esc closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  // Reheat the simulation (used after drag, on demand).
  const reheat = (alpha = 1) => {
    alphaRef.current = Math.max(alphaRef.current, alpha)
  }

  // Pointer / wheel handlers ────────────────────────────────────────────────
  const worldFromScreen = (clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return { x: clientX, y: clientY }
    const rect = svg.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    const { x, y, scale } = viewportRef.current
    return { x: (sx - x) / scale, y: (sy - y) / scale }
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const v = viewportRef.current
    const newScale = Math.max(0.3, Math.min(3, v.scale * factor))
    // Zoom toward cursor: keep the world point under the cursor fixed.
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    v.x = mx - (mx - v.x) * (newScale / v.scale)
    v.y = my - (my - v.y) * (newScale / v.scale)
    v.scale = newScale
    forceRender((n) => n + 1)
  }

  const onPointerDownNode = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    const node = nodesRef.current.find((n) => n.id === id)
    if (!node) return
    const w = worldFromScreen(e.clientX, e.clientY)
    draggingRef.current = { id, offsetX: w.x - node.x, offsetY: w.y - node.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    reheat(0.6)
  }

  const onPointerDownBg = (e: React.PointerEvent) => {
    panningRef.current = { x: e.clientX - viewportRef.current.x, y: e.clientY - viewportRef.current.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (draggingRef.current) {
      const w = worldFromScreen(e.clientX, e.clientY)
      const node = nodesRef.current.find((n) => n.id === draggingRef.current!.id)
      if (node) {
        node.x = w.x - draggingRef.current.offsetX
        node.y = w.y - draggingRef.current.offsetY
        reheat(0.3)
      }
    } else if (panningRef.current) {
      viewportRef.current.x = e.clientX - panningRef.current.x
      viewportRef.current.y = e.clientY - panningRef.current.y
      forceRender((n) => n + 1)
    }
  }

  const onPointerUp = () => {
    if (draggingRef.current) reheat(0.4)
    draggingRef.current = null
    panningRef.current = null
  }

  const navigateTo = (id: string) => {
    if (id === currentPath) return
    router.push(buildNavigationPath(id))
    onClose()
  }

  const resetView = () => {
    viewportRef.current = { x: 0, y: 0, scale: 1 }
    reheat(0.8)
  }

  // Hover highlight set: hovered node + its direct neighbors.
  const highlighted = useMemo(() => {
    if (!hovered) return null
    const set = new Set<string>([hovered])
    for (const n of adjacencyRef.current.get(hovered) ?? []) set.add(n)
    return set
  }, [hovered])

  const isVisible = (id: string) => !highlighted || highlighted.has(id)
  const isEdgeVisible = (e: SimEdge) =>
    !highlighted || (highlighted.has(e.source) && highlighted.has(e.target))

  const nodes = nodesRef.current
  const edges = edgesRef.current
  const { x: vx, y: vy, scale } = viewportRef.current

  const colorForHop = (hop: number) => {
    if (hop === 0) return "#da3434"
    if (hop === 1) return "var(--c-text-1)"
    return "var(--c-text-3)"
  }

  const radiusForNode = (n: SimNode) => {
    if (n.hop === 0) return 9
    return Math.min(8, 4 + Math.sqrt(n.degree))
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--c-bg)]"
      role="dialog"
      aria-modal="true"
      aria-label="Vue graphe"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
        <h2 className="text-sm font-semibold text-[var(--c-text-1)]">
          Graphe — <span className="text-[var(--c-text-2)]">{shortName(currentPath)}</span>
          <span className="ml-3 text-xs font-normal text-[var(--c-text-3)]">
            {nodes.length} note{nodes.length > 1 ? "s" : ""} · {edges.length} lien{edges.length > 1 ? "s" : ""}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={resetView}
            type="button"
            className="px-3 py-1.5 text-xs text-[var(--c-text-2)] hover:bg-[var(--c-surface-hover)] rounded-md transition-colors"
            title="Recadrer la vue"
          >
            Recadrer
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-[var(--c-text-2)] bg-[var(--c-surface-hover)] hover:bg-[var(--c-border)] rounded-md transition-colors"
            type="button"
          >
            Fermer (Esc)
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        {!graph ? (
          <div className="flex items-center justify-center h-full text-[var(--c-text-3)] text-sm">Chargement du graphe…</div>
        ) : nodes.length <= 1 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--c-text-3)] text-sm px-4 text-center">
            <p>Cet article n&apos;est pas encore relié à d&apos;autres notes.</p>
            <p className="mt-1 text-xs">Ajoute un <code className="px-1 bg-[var(--c-surface-hover)] rounded">[[lien]]</code> vers ou depuis cet article.</p>
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              width={size.w}
              height={size.h}
              className="block touch-none select-none cursor-grab active:cursor-grabbing"
              onWheel={onWheel}
              onPointerDown={onPointerDownBg}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* Subtle grid backdrop helps with depth perception during pan/zoom. */}
              <defs>
                <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse" patternTransform={`translate(${vx % 40} ${vy % 40}) scale(${scale})`}>
                  <circle cx={20} cy={20} r={0.6} fill="var(--c-border)" opacity={0.5} />
                </pattern>
              </defs>
              <rect width={size.w} height={size.h} fill="url(#grid)" />

              <g transform={`translate(${vx} ${vy}) scale(${scale})`}>
                {/* Edges */}
                {edges.map((e, i) => {
                  const a = nodes.find((n) => n.id === e.source)
                  const b = nodes.find((n) => n.id === e.target)
                  if (!a || !b) return null
                  const visible = isEdgeVisible(e)
                  return (
                    <line
                      key={i}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={visible ? "var(--c-text-3)" : "var(--c-border)"}
                      strokeWidth={visible && highlighted ? 1.5 : 1}
                      opacity={visible ? 0.65 : 0.08}
                      style={{ transition: "opacity 160ms, stroke-width 160ms" }}
                    />
                  )
                })}

                {/* Nodes */}
                {nodes.map((n) => {
                  const visible = isVisible(n.id)
                  const r = radiusForNode(n)
                  const isHover = hovered === n.id
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x} ${n.y})`}
                      onPointerDown={(e) => onPointerDownNode(e, n.id)}
                      onPointerEnter={() => setHovered(n.id)}
                      onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                      onDoubleClick={() => navigateTo(n.id)}
                      onClick={(e) => {
                        // Treat single-click without drag as navigation, but only on 2-hop+ to
                        // avoid accidental jumps when interacting with neighbors. Center & 1-hop
                        // require double-click.
                        if (n.hop >= 2) navigateTo(n.id)
                        e.stopPropagation()
                      }}
                      style={{
                        cursor: n.id === currentPath ? "default" : "pointer",
                        opacity: visible ? 1 : 0.18,
                        transition: "opacity 160ms",
                      }}
                    >
                      {/* Glow ring on hover or for center */}
                      {(isHover || n.hop === 0) && (
                        <circle
                          cx={0}
                          cy={0}
                          r={r + 6}
                          fill="none"
                          stroke={colorForHop(n.hop)}
                          strokeWidth={1.5}
                          opacity={0.3}
                        />
                      )}
                      <circle
                        cx={0}
                        cy={0}
                        r={r}
                        fill={colorForHop(n.hop)}
                        stroke="var(--c-bg)"
                        strokeWidth={1.5}
                        style={{ transition: "r 160ms" }}
                      />
                      {(n.hop <= 1 || isHover) && (
                        <text
                          x={0}
                          y={-r - 6}
                          fontSize={11}
                          textAnchor="middle"
                          fill="var(--c-text-2)"
                          fontWeight={n.hop === 0 ? 600 : 400}
                          style={{ paintOrder: "stroke", stroke: "var(--c-bg)", strokeWidth: 3, pointerEvents: "none" }}
                        >
                          {n.name.length > 28 ? n.name.slice(0, 28) + "…" : n.name}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>

            {/* Bottom-left legend */}
            <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 text-[11px] text-[var(--c-text-3)] bg-[var(--c-surface)]/80 backdrop-blur-sm rounded-md border border-[var(--c-border)] px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#da3434" }} />
                <span>Article courant</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--c-text-1)]" />
                <span>Connexion directe</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--c-text-3)]" />
                <span>2 sauts</span>
              </div>
            </div>

            {/* Bottom-right controls + hint */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2 text-[11px] text-[var(--c-text-3)] bg-[var(--c-surface)]/80 backdrop-blur-sm rounded-md border border-[var(--c-border)] px-2.5 py-1.5">
              <kbd className="px-1.5 py-0.5 font-mono bg-[var(--c-surface-hover)] border border-[var(--c-border)] rounded text-[10px]">drag</kbd>
              <span>déplacer un nœud</span>
              <span className="mx-1 opacity-40">·</span>
              <kbd className="px-1.5 py-0.5 font-mono bg-[var(--c-surface-hover)] border border-[var(--c-border)] rounded text-[10px]">wheel</kbd>
              <span>zoom</span>
              <span className="mx-1 opacity-40">·</span>
              <kbd className="px-1.5 py-0.5 font-mono bg-[var(--c-surface-hover)] border border-[var(--c-border)] rounded text-[10px]">dbl-clic</kbd>
              <span>ouvrir</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
