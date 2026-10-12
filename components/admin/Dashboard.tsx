"use client";

// Top-of-page dashboard, built from DASHBOARD_TILES (config.tsx). Every tile
// reads its count through an invisible probe that publishes it to a tiny
// store; only counts above zero get a big tile, the rest fold into one line
// ("rien à faire : …", and what couldn't be read). The sidebar lights its
// attention dots from the same store without fetching anything itself.

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

/** Forget every count (disconnect), so a new session doesn't flash old ones. */
export function resetTileCounts() {
  counts.clear();
  snapshot = {};
  listeners.forEach((l) => l());
}

/** Per tab, the sum of its tiles above zero (absent = nothing to do). */
export function useTabAttention(): Map<TabId, number> {
  const c = useTileCounts();
  const out = new Map<TabId, number>();
  for (const t of DASHBOARD_TILES) {
    const n = c[t.id] ?? 0;
    if (n > 0) out.set(t.tab, (out.get(t.tab) ?? 0) + n);
  }
  return out;
}

export function Dashboard({
  ctx,
  onJump,
}: {
  ctx: TileContext;
  onJump: (tab: TabId, target: string) => void;
}) {
  const c = useTileCounts();
  const hot = DASHBOARD_TILES.filter((t) => (c[t.id] ?? 0) > 0);
  const calm = DASHBOARD_TILES.filter((t) => c[t.id] === 0);
  const unknown = DASHBOARD_TILES.filter((t) => c[t.id] === null || c[t.id] === undefined);
  return (
    <nav aria-label="À traiter" className="admin-dashboard">
      {DASHBOARD_TILES.map((t) => (
        <TileProbe key={t.id} tile={t} ctx={ctx} />
      ))}
      {hot.length > 0 && (
        <ul className="admin-tiles">
          {hot.map((t) => (
            <li key={t.id}>
              <a
                href={`#${t.tab}`}
                onClick={(e: MouseEvent) => {
                  e.preventDefault();
                  onJump(t.tab, t.target);
                }}
                className={`admin-tile is-hot ${FOCUS_RING}`}
              >
                <span className="admin-tile-value tabular-nums">{(c[t.id] ?? 0).toLocaleString("fr-FR")}</span>
                <span className="admin-tile-label">{t.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <TileLine label={hot.length ? "Rien à faire" : "Tout est à jour, rien à faire"} tiles={calm} onJump={onJump} />
      <TileLine label="Pas encore lu" tiles={unknown} onJump={onJump} muted />
    </nav>
  );
}

function TileLine({
  label,
  tiles,
  onJump,
  muted = false,
}: {
  label: string;
  tiles: DashboardTile[];
  onJump: (tab: TabId, target: string) => void;
  muted?: boolean;
}) {
  if (!tiles.length) return null;
  return (
    <p className={`admin-tileline ${muted ? "is-muted" : ""}`}>
      <span className="admin-tileline-label">{label} :</span>{" "}
      {tiles.map((t, i) => (
        <span key={t.id}>
          {i > 0 && ", "}
          <a
            href={`#${t.tab}`}
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              onJump(t.tab, t.target);
            }}
            className={`rounded underline-offset-2 hover:underline ${FOCUS_RING}`}
          >
            {t.label}
          </a>
        </span>
      ))}
    </p>
  );
}

/** Reads one tile's count (its hook) and publishes it; renders nothing. */
function TileProbe({ tile, ctx }: { tile: DashboardTile; ctx: TileContext }) {
  const n = tile.useCount(ctx);
  useEffect(() => {
    report(tile.id, n);
  }, [tile.id, n]);
  return null;
}
