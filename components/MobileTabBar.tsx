"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { useReviewDue } from "@/components/AccountChip";
import { FamilyIcon } from "@/components/FamilyIcon";
import { attachLens } from "@/lib/liquid-glass";
import { CHANGE_EVENT, NOW_KEY, STORAGE_KEY, loadNow, loadStore, nowPlaying } from "@/lib/reading-progress";
import type { PathFamily } from "@/lib/path-family";

// The phone tab bar: a floating "liquid glass" capsule with the four places a
// reader goes back to (Accueil, Parcours, Notes, Réviser), and a round
// glass button beside it that opens the command palette (wired by
// /js/palette.js through data-palette-open). Phones only (global.css
// `.tabbar`, under 640px); the site bar keeps the menu on wider screens.
//
// A note has its own bottom toolbar instead (lib/note-app.ts), at the same
// height, so the other floating buttons (assistant, "Remonter"…) keep their
// place above it (app.css, --gk-tabbar-h).
//
// As on iOS 26, the current tab sits under a glass pill, and a finger can
// slide along the bar: the pill turns into a larger clear lens that follows
// it, the tab under it lights up, and letting go opens that tab. A plain tap
// still just follows the link.
//
// Scrolling down, the bar shrinks to the current tab and a mini player takes
// the middle, as in Apple Music on iOS 26: the note being read (gkNow,
// written by public/js/reading-state.js), its progress ring and a play
// button that resumes it. Scrolling back up (or a tap on the shrunk tab)
// brings the whole bar back.
//
// The glass is app.css `.glass`; on Chromium its rim also bends what passes
// under it (lib/liquid-glass.ts), which is why the drop shadows live on
// their own elements here (.tabbar-shadow).

type Tab = { key: string; href: string; icon: React.ReactNode; match: (p: string) => boolean };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// The Notes tab (app/notes/) also holds the views Explorer used to: graph,
// timeline, map, themes…, so it stays lit on their pages.
const NOTES = ["/notes/", "/explorer/", "/graph/", "/frise/", "/carte/", "/themes/", "/jardin/", "/disciplines/", "/donnees/", "/hasard/"];

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
    key: "tabbar.notes",
    href: "/notes/",
    match: (p) => NOTES.some((x) => p.startsWith(x)),
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path className="tabbar-fill" d="M4 19.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v14.5" />
        <path d="M9 19.5V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v12.5" />
        <path d="m14.6 7.4 2.8-.8a1 1 0 0 1 1.2.7l3 11.3" />
        <path d="M3 20h18" />
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

/** Pixels a finger moves before a press becomes a slide. */
const SLOP = 8;
/** Scrolled past this, scrolling down shrinks the bar; above it, it is whole. */
const COMPACT_FROM = 160;

type Playing = ReturnType<typeof nowPlaying>;

/** The note being read, kept in step with this tab and the others. */
function useNowPlaying(): Playing {
  const [playing, setPlaying] = useState<Playing>(null);
  useEffect(() => {
    const load = () => setPlaying(nowPlaying(loadNow(), loadStore()));
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === NOW_KEY || e.key === STORAGE_KEY || e.key === null) load();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", load);
    window.addEventListener(CHANGE_EVENT, load);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", load);
      window.removeEventListener(CHANGE_EVENT, load);
    };
  }, []);
  return playing;
}

/** Shrinks on the way down, comes back on the way up or near the top. */
function useCompact(path: string): [boolean, (v: boolean) => void] {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    setCompact(false);
    let last = window.scrollY;
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const y = window.scrollY;
        const dy = y - last;
        if (y < COMPACT_FROM) setCompact(false);
        else if (dy > 6) setCompact(true);
        else if (dy < -10) setCompact(false);
        if (Math.abs(dy) > 6 || y < COMPACT_FROM) last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [path]);
  return [compact, setCompact];
}

export function MobileTabBar() {
  const locale = useLocale();
  const raw = usePathname() ?? "/";
  const path = raw.endsWith("/") ? raw : `${raw}/`;
  const due = useReviewDue();
  const current = TABS.findIndex((tab) => tab.match(path));

  const barRef = useRef<HTMLUListElement>(null);
  // The slide: where the finger is (x in the bar), and whether it moved far
  // enough to be one. `picked` holds the tab chosen on release while its
  // page loads, so the pill is already there.
  const press = useRef<{ id: number; x0: number; moved: boolean } | null>(null);
  // When the last slide ended: the browser's own click after it is dropped.
  const slidEnd = useRef(0);
  const [drag, setDrag] = useState<number | null>(null);
  // Remembered with the page it was picked on: once the new page is here,
  // the pill follows the real current tab again.
  const [picked, setPicked] = useState<{ i: number; from: string } | null>(null);
  const [width, setWidth] = useState(0);
  const [scrolledDown, setCompact] = useCompact(path);
  // Only a page under one of the tabs shrinks the bar to it.
  const compact = scrolledDown && current >= 0;
  const playing = useNowPlaying();
  const searchRef = useRef<HTMLButtonElement>(null);
  const miniRef = useRef<HTMLAnchorElement>(null);

  // The refracting rim (Chromium; elsewhere the CSS glass alone).
  useEffect(() => {
    const off = [
      barRef.current && attachLens(barRef.current, { depth: 26, chroma: 0.12 }),
      searchRef.current && attachLens(searchRef.current, { depth: 22, chroma: 0.12 }),
    ];
    return () => off.forEach((f) => f?.());
  }, []);
  const hasMini = !!playing;
  useEffect(() => {
    if (!hasMini || !miniRef.current) return;
    return attachLens(miniRef.current, { depth: 24, chroma: 0.12 });
  }, [hasMini]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => setWidth(bar.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  if (path.startsWith("/admin/") || path.startsWith("/posts/")) return null;

  const PAD = 4; // .tabbar-bar padding, in px
  const cell = width ? (width - 2 * PAD) / TABS.length : 0;
  const tabAt = (x: number) => Math.max(0, Math.min(TABS.length - 1, Math.floor((x - PAD) / (cell || 1))));
  const localX = (e: React.PointerEvent) => e.clientX - (barRef.current?.getBoundingClientRect().left ?? 0);
  const hover = drag != null ? tabAt(drag) : null;
  const shown = hover ?? (picked?.from === path ? picked.i : current);
  // The pill's left edge: under the finger while sliding, else on its tab.
  const pillX = drag != null ? Math.max(PAD, Math.min(width - PAD - cell, drag - cell / 2)) : PAD + shown * cell;

  const onDown = (e: React.PointerEvent<HTMLUListElement>) => {
    if (compact) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press.current = { id: e.pointerId, x0: localX(e), moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLUListElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const x = localX(e);
    if (!p.moved && Math.abs(x - p.x0) < SLOP) return;
    if (!p.moved) {
      p.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const before = drag != null ? tabAt(drag) : null;
    if (before != null && before !== tabAt(x)) navigator.vibrate?.(6);
    setDrag(x);
  };
  const onUp = (e: React.PointerEvent<HTMLUListElement>) => {
    const p = press.current;
    press.current = null;
    if (!p?.moved || drag == null) return;
    const i = tabAt(localX(e));
    setDrag(null);
    slidEnd.current = e.timeStamp;
    if (i === current) return;
    setPicked({ i, from: path });
    // Follow the tab's own link, so it opens like a tap would.
    barRef.current?.querySelectorAll<HTMLAnchorElement>("a.tabbar-tab")[i]?.click();
  };
  const onCancel = () => {
    press.current = null;
    setDrag(null);
  };

  return (
    <nav
      className={`tabbar${compact ? " is-compact" : ""}${playing ? " has-mini" : ""}`}
      aria-label={t("tabbar.aria", undefined, locale)}
      data-pagefind-ignore
    >
      <span className="tabbar-shadow tabbar-shadow-bar" aria-hidden="true" />
      <span className="tabbar-shadow tabbar-shadow-search" aria-hidden="true" />
      {playing && <span className="tabbar-shadow tabbar-shadow-mini" aria-hidden="true" />}
      <ul
        ref={barRef}
        className={`tabbar-bar glass${drag != null ? " is-sliding" : ""}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onClickCapture={(e) => {
          // The click that ends a slide is not a tap on the tab it started
          // on (the tab's link is followed in onUp instead).
          if (e.isTrusted && e.timeStamp - slidEnd.current < 500) e.preventDefault();
          // Shrunk: a tap on the one tab left brings the whole bar back.
          if (compact) {
            e.preventDefault();
            setCompact(false);
          }
        }}
      >
        {shown >= 0 && (
          <li
            className="tabbar-pill"
            aria-hidden="true"
            style={
              width > 0
                ? { width: cell, transform: `translateX(${pillX}px)${drag != null ? " scale(1.18, 1.28)" : ""}` }
                : // Before the bar is measured (the exported HTML, the first
                  // frame of a page): the same place in CSS, so the pill is
                  // there when a view transition captures the new page and
                  // can glide to it from the old one (palette.css).
                  { width: `calc((100% - ${2 * PAD}px) / ${TABS.length})`, transform: `translateX(calc(${PAD}px + ${shown * 100}%))` }
            }
          >
            {/* The lens magnifies the tabs under it: a copy of the row, lined
                up with the real one, scaled with the pill (every browser). */}
            {drag != null && (
              <span className="tabbar-lens" style={{ width: width - 2 * PAD, transform: `translateX(${PAD - pillX}px)` }}>
                {TABS.map((tab, i) => (
                  <span key={tab.key} className={`tabbar-tab${i === shown ? " is-lit" : ""}`}>
                    <span className="tabbar-icon">{tab.icon}</span>
                    <span className="tabbar-label">{t(tab.key, undefined, locale)}</span>
                  </span>
                ))}
              </span>
            )}
          </li>
        )}
        {TABS.map((tab, i) => {
          const on = tab.match(path);
          const badge = tab.key === "tabbar.review" && due ? due.n : 0;
          return (
            <li key={tab.key}>
              <a
                href={tab.key === "tabbar.review" && due ? due.href : tab.href}
                className={`tabbar-tab${i === shown ? " is-lit" : ""}${i === current ? " is-current" : ""}`}
                draggable={false}
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
      {playing && (
        <a
          ref={miniRef}
          className="tabbar-mini glass"
          href={`/posts/${playing.note.s}/#reprendre`}
          data-family={playing.note.f}
          aria-label={t("tabbar.resumeAria", { title: playing.note.title }, locale)}
          tabIndex={compact ? 0 : -1}
          aria-hidden={compact ? undefined : true}
        >
          <span
            className="tabbar-mini-ring"
            style={{ "--p": playing.progress } as React.CSSProperties}
            aria-hidden="true"
          >
            <FamilyIcon family={(playing.note.f as PathFamily | undefined) ?? null} />
          </span>
          <span className="tabbar-mini-text">
            <b>{playing.note.title}</b>
            <small>{t("tabbar.left", { m: playing.left }, locale)}</small>
          </span>
          <span className="tabbar-mini-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </span>
        </a>
      )}
      <button
        ref={searchRef}
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
