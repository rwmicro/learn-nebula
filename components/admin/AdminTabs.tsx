"use client";

// The console layout for ADMIN_TABS (config.tsx): a sidebar of sections on the
// left (a strip on top on a phone), the dashboard and the active section's
// cards on the right, in a two-column grid. WAI-ARIA tabs pattern: one tab
// stop, arrows/Home/End move between sections (automatic activation); the
// global "g <key>" shortcuts live in AdminPanel. Every panel stays mounted
// (just `hidden`), so a card keeps its state — and its data, which the
// dashboard shares — across switches.

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { ADMIN_TABS, type TabId } from "./config";
import { useTabAttention } from "./Dashboard";
import type { AdminCardProps } from "./shared";
import { CardBoundary } from "./CardBoundary";

export function AdminTabs({
  active,
  onSelect,
  card,
  top,
  footer,
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
  card: AdminCardProps;
  /** Shown above every section (the dashboard). */
  top?: ReactNode;
  /** Bottom of the sidebar (shortcuts hint). */
  footer?: ReactNode;
}) {
  const attention = useTabAttention();
  const refs = useRef(new Map<TabId, HTMLButtonElement>());

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let j: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") j = (i + 1) % ADMIN_TABS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") j = (i - 1 + ADMIN_TABS.length) % ADMIN_TABS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = ADMIN_TABS.length - 1;
    if (j === null) return;
    e.preventDefault();
    const id = ADMIN_TABS[j].id;
    onSelect(id);
    refs.current.get(id)?.focus();
  }

  return (
    <div className="admin-console">
      <aside className="admin-side">
        <div role="tablist" aria-orientation="vertical" aria-label="Sections de l'administration" className="admin-tablist">
          {ADMIN_TABS.map((t, i) => {
            const selected = t.id === active;
            const n = attention.get(t.id);
            return (
              <button
                key={t.id}
                ref={(el) => {
                  if (el) refs.current.set(t.id, el);
                  else refs.current.delete(t.id);
                }}
                type="button"
                role="tab"
                id={`admin-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`admin-panel-${t.id}`}
                aria-keyshortcuts={`G ${t.key.toUpperCase()}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(t.id)}
                onKeyDown={(e) => onKey(e, i)}
                className="admin-tabbtn"
              >
                <span className="admin-tabbtn-label">{t.label}</span>
                {n ? (
                  <span className="admin-tabbtn-count tabular-nums">
                    {n}
                    <span className="sr-only"> à traiter</span>
                  </span>
                ) : (
                  <kbd className="admin-tabbtn-key" aria-hidden="true">
                    g {t.key}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
        {footer}
      </aside>
      <div className="admin-main">
        {top}
        {ADMIN_TABS.map((t) => (
          <div
            key={t.id}
            role="tabpanel"
            id={`admin-panel-${t.id}`}
            aria-labelledby={`admin-tab-${t.id}`}
            data-tab={t.id}
            hidden={t.id !== active}
            className="admin-tabpanel"
          >
            {t.cards.map((Card, i) => (
              <CardBoundary key={i}>
                <Card {...card} />
              </CardBoundary>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
