"use client";

import { useState } from "react";
import { t as buildT, i18nAttrProps } from "@/lib/i18n";
import { fold } from "@/lib/palette-match";

/**
 * Instant filter over the /themes/ tag cloud. The groups stay server-rendered
 * (components/Themes.tsx); this only hides the `li[data-name]` that don't
 * match, the groups left empty, and opens the folded rare tags while a query
 * is typed. Accent-insensitive, any part of the name.
 */
export function ThemesFilter({ total }: { total: number }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(total);

  const apply = (value: string) => {
    const root = document.querySelector("[data-themes-groups]");
    if (!root) return total;
    const needle = fold(value.trim());
    let count = 0;
    root.querySelectorAll<HTMLElement>("[data-themes-group]").forEach((group) => {
      let inGroup = 0;
      group.querySelectorAll<HTMLElement>("li[data-name]").forEach((li) => {
        const hit = !needle || fold(li.dataset.name ?? "").includes(needle);
        li.hidden = !hit;
        if (hit) inGroup++;
      });
      group.hidden = inGroup === 0;
      const rare = group.querySelector<HTMLDetailsElement>("[data-themes-rare]");
      if (rare) {
        // Open while filtering (remembering whether the reader had opened it).
        if (needle) {
          if (!rare.dataset.wasOpen) rare.dataset.wasOpen = rare.open ? "1" : "0";
          rare.open = true;
        } else if (rare.dataset.wasOpen) {
          rare.open = rare.dataset.wasOpen === "1";
          delete rare.dataset.wasOpen;
        }
        const rareHits = [...rare.querySelectorAll<HTMLElement>("li[data-name]")].some((li) => !li.hidden);
        rare.hidden = !!needle && !rareHits;
      }
      // Phones and desktop each show one of the two views (themes.css):
      // count only the one on screen.
      if (getComputedStyle(group).display !== "none") count += inGroup;
    });
    const empty = document.querySelector<HTMLElement>("[data-themes-empty]");
    if (empty) empty.hidden = count > 0;
    return count;
  };
  const update = (value: string) => {
    setQ(value);
    setShown(apply(value));
  };

  const tr = (key: string, vars?: Record<string, string | number>) => {
    const rt = typeof window !== "undefined" ? (window as I18nWindow).__i18n?.t : undefined;
    return rt ? rt(key, vars) : buildT(key, vars);
  };

  return (
    <div className="themes-filter" role="search">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5L21 21" />
      </svg>
      <input
        type="search"
        value={q}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && q) {
            e.preventDefault();
            update("");
          }
        }}
        autoComplete="off"
        spellCheck={false}
        placeholder={buildT("themes.filterPlaceholder")}
        aria-label={buildT("themes.filterPlaceholder")}
        {...i18nAttrProps("placeholder", "themes.filterPlaceholder")}
        {...i18nAttrProps("aria-label", "themes.filterPlaceholder")}
      />
      <span className="themes-filter-count" aria-live="polite">
        {q.trim() ? tr(shown === 1 ? "themes.filterCountOne" : "themes.filterCount", { n: shown }) : ""}
      </span>
    </div>
  );
}

type I18nWindow = Window & {
  __i18n?: { t?: (k: string, v?: Record<string, string | number>) => string };
};

