"use client";

// The tab bar + panels for ADMIN_TABS (config.tsx). WAI-ARIA tabs pattern:
// one tab stop, arrows/Home/End move between tabs (automatic activation).
// Every panel stays mounted (just `hidden`), so a card keeps its state — and
// its data, which the dashboard shares — across tab switches.

import { useRef, type KeyboardEvent } from "react";
import { ADMIN_TABS, type TabId } from "./config";
import { useTabsNeedingAttention } from "./Dashboard";
import type { AdminCardProps } from "./shared";
import { CardBoundary } from "./CardBoundary";

export function AdminTabs({ active, onSelect, card }: {
  active: TabId;
  onSelect: (id: TabId) => void;
  card: AdminCardProps;
}) {
  const attention = useTabsNeedingAttention();
  const refs = useRef(new Map<TabId, HTMLButtonElement>());

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    let j: number | null = null;
    if (e.key === "ArrowRight") j = (i + 1) % ADMIN_TABS.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + ADMIN_TABS.length) % ADMIN_TABS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = ADMIN_TABS.length - 1;
    if (j === null) return;
    e.preventDefault();
    const id = ADMIN_TABS[j].id;
    onSelect(id);
    refs.current.get(id)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Sections de l'administration" className="admin-tablist">
        {ADMIN_TABS.map((t, i) => {
          const selected = t.id === active;
          const hot = attention.has(t.id);
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
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className="admin-tabbtn"
            >
              {t.label}
              {hot && (
                <>
                  <span aria-hidden="true" className="admin-tabdot" />
                  <span className="sr-only"> (à traiter)</span>
                </>
              )}
            </button>
          );
        })}
      </div>
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
    </>
  );
}
