"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { useReviewDue } from "@/components/AccountChip";

// The phone tab bar: a floating "liquid glass" capsule with the four places a
// reader goes back to (Accueil, Parcours, Explorer, Réviser), and a round
// glass button beside it that opens the command palette (wired by
// /js/palette.js through data-palette-open). Phones only (global.css
// `.tabbar`, under 640px); the site bar keeps the menu on wider screens.
//
// On a note it slides away while the reader scrolls down and comes back on the
// way up, so it never sits on the text. Its state is mirrored on <html
// data-tabbar="shown|hidden"> so the other floating buttons (assistant,
// "Remonter", "Étape suivante"…) can sit above it, and drop back when it goes.

type Tab = { key: string; href: string; icon: React.ReactNode; match: (p: string) => boolean };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const EXPLORE = ["/explorer/", "/graph/", "/frise/", "/carte/", "/themes/", "/jardin/", "/disciplines/", "/donnees/", "/hasard/"];

const TABS: Tab[] = [
  {
    key: "tabbar.home",
    href: "/",
    match: (p) => p === "/",
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M12 21v-7" />
        <path className="tabbar-fill" d="M12 14C7 14 4.5 11 4.5 6.5 9 6.5 12 9 12 14Z" />
        <path className="tabbar-fill" d="M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5Z" />
      </svg>
    ),
  },
  {
    key: "tabbar.parcours",
    href: "/parcours/",
    match: (p) => p.startsWith("/parcours/"),
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="5" r="2" />
        <path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" />
      </svg>
    ),
  },
  {
    key: "tabbar.explore",
    href: "/explorer/",
    match: (p) => EXPLORE.some((x) => p.startsWith(x)),
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="12" r="9" />
        <path className="tabbar-fill" d="m15.5 8.5-2 5-5 2 2-5z" />
      </svg>
    ),
  },
  {
    key: "tabbar.review",
    href: "/cartes/",
    match: (p) => p.startsWith("/cartes/"),
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <rect className="tabbar-fill" x="3" y="7" width="13" height="14" rx="2" />
        <path d="M8 3h11a2 2 0 0 1 2 2v12" />
      </svg>
    ),
  },
];

export function MobileTabBar() {
  const locale = useLocale();
  const raw = usePathname() ?? "/";
  const path = raw.endsWith("/") ? raw : `${raw}/`;
  const due = useReviewDue();
  const [scrolledAway, setScrolledAway] = useState(false);
  const onNote = path.startsWith("/posts/");
  const hidden = onNote && scrolledAway;

  // Hide while scrolling down a note, show again on the way up (and near the
  // top). A few pixels of slack so a trembling thumb doesn't flicker it.
  useEffect(() => {
    if (!onNote) return;
    let last = window.scrollY;
    let queued = false;
    const tick = () => {
      queued = false;
      const y = window.scrollY;
      const dy = y - last;
      if (Math.abs(dy) < 6) return;
      setScrolledAway(dy > 0 && y > 160);
      last = y;
    };
    const onScroll = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(tick);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onNote]);

  useEffect(() => {
    document.documentElement.dataset.tabbar = hidden ? "hidden" : "shown";
  }, [hidden]);

  if (path.startsWith("/admin/")) return null;

  return (
    <nav
      className="tabbar"
      aria-label={t("tabbar.aria", undefined, locale)}
      data-hidden={hidden ? "" : undefined}
      data-pagefind-ignore
    >
      <ul className="tabbar-bar glass">
        {TABS.map((tab) => {
          const on = tab.match(path);
          const badge = tab.key === "tabbar.review" && due ? due.n : 0;
          return (
            <li key={tab.key}>
              <a
                href={tab.key === "tabbar.review" && due ? due.href : tab.href}
                className="tabbar-tab"
                aria-current={on ? "page" : undefined}
              >
                <span className="tabbar-icon" aria-hidden="true">
                  {tab.icon}
                </span>
                <span className="tabbar-label">{t(tab.key, undefined, locale)}</span>
                {badge > 0 && (
                  <span className="tabbar-badge">
                    {badge > 99 ? "99+" : badge}
                    <span className="sr-only"> {t("tabbar.due", undefined, locale)}</span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="tabbar-search glass"
        data-palette-open
        aria-haspopup="dialog"
        aria-label={t("palette.openAria", undefined, locale)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
    </nav>
  );
}
