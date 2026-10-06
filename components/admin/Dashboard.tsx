"use client";

// Top-of-page dashboard: one tile per actionable count (DASHBOARD_TILES in
// config.tsx). Each tile publishes its count to a tiny store so the tab bar
// can light its attention dots without fetching anything itself.

import { useEffect, useSyncExternalStore, type MouseEvent } from "react";
import { FOCUS_RING } from "./shared";
import { DASHBOARD_TILES, type DashboardTile, type TabId, type TileContext } from "./config";

// --- tile counts, shared with the tab bar
const counts = new Map<string, number | null>();
let snapshot: Record<string, number | null> = {};
const listeners = new Set<() => void>();

function report(id: string, n: number | null) {
  if (counts.get(id) === n && id in snapshot) return;
  counts.set(id, n);
  snapshot = Object.fromEntries(counts);
  listeners.forEach((l) => l());
}

export function useTileCounts(): Record<string, number | null> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => snapshot,
    () => snapshot,
  );
}

/** Tabs with at least one tile above zero. */
export function useTabsNeedingAttention(): Set<TabId> {
  const c = useTileCounts();
  const out = new Set<TabId>();
  for (const t of DASHBOARD_TILES) if ((c[t.id] ?? 0) > 0) out.add(t.tab);
  return out;
}

export function Dashboard({
  ctx,
  onJump,
}: {
  ctx: TileContext;
  onJump: (tab: TabId, target: string) => void;
}) {
  return (
    <nav aria-label="À traiter" className="admin-dashboard">
      <ul>
        {DASHBOARD_TILES.map((t) => (
          <Tile key={t.id} tile={t} ctx={ctx} onJump={onJump} />
        ))}
      </ul>
    </nav>
  );
}

function Tile({
  tile,
  ctx,
  onJump,
}: {
  tile: DashboardTile;
  ctx: TileContext;
  onJump: (tab: TabId, target: string) => void;
}) {
  const n = tile.useCount(ctx);
  useEffect(() => {
    report(tile.id, n);
  }, [tile.id, n]);

  const state = n === null ? "is-unknown" : n > 0 ? "is-hot" : "is-calm";
  return (
    <li>
      <a
        href={`#${tile.tab}`}
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          onJump(tile.tab, tile.target);
        }}
        className={`admin-tile ${state} ${FOCUS_RING}`}
      >
        <span className="admin-tile-value tabular-nums">{n === null ? "—" : n.toLocaleString("fr-FR")}</span>
        <span className="admin-tile-label">{tile.label}</span>
      </a>
    </li>
  );
}
