"use client";

import { HomeBookmarks } from "@/components/home/HomeBookmarks";
import { useEffect, useMemo, useRef, useState } from "react";
import type { HomeTreeNode } from "@/lib/content";
import type { HomeData } from "@/lib/home-data";
import type { GraphData } from "@/lib/graph-data";
import { CircularGraph } from "@/components/explore/CircularGraph";
import { t, folderKey, DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";
import { folderAnchor } from "@/lib/slug";
import {
  CHANGE_EVENT,
  STORAGE_KEY,
  folderReadCounts,
  isRead,
  loadStore,
  resumeCandidate,
  slugFromHref,
  type ReadingStore,
} from "@/lib/reading-progress";

type PaletteWindow = Window & { __palette?: { open: (q?: string) => void } };

// Track the active UI locale reactively (same signal LangSwitcher emits), so
// every label re-renders through t() instead of being mutated by /js/i18n.js.
function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    const isLocale = (s: unknown): s is Locale =>
      typeof s === "string" && (LOCALES as readonly string[]).includes(s);
    const current = window.__i18n?.locale ?? window.__i18n?.defaultLocale;
    if (isLocale(current)) setLocale(current);
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ locale: string }>).detail?.locale;
      if (isLocale(next)) setLocale(next);
    };
    document.addEventListener("i18n:change", onChange);
    return () => document.removeEventListener("i18n:change", onChange);
  }, []);
  return locale;
}

const labelCls =
  "m-0 mb-4 border-0 p-0 text-meta font-semibold uppercase tracking-[0.1em] leading-tight text-ink [font-family:var(--gk-serif),Georgia,serif]";
const linkCls =
  "text-ink no-underline underline-offset-[3px] hover:bg-transparent hover:underline focus-visible:underline";
function Chevron({ open, size = 11 }: { open: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 text-muted-warm transition-transform duration-200 ${
        open ? "rotate-90" : ""
      }`}
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Mount the circular-map preview only once its box scrolls near the viewport,
// so the home page's most-common first paint isn't weighed down by it.
function LazyGraph({ graphData }: { graphData: GraphData | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} className="h-full w-full">
      {show && graphData ? <CircularGraph data={graphData} preview /> : null}
    </div>
  );
}

// Fetch /home-data.json once (lib/home-data.ts). The version is the file's
// content hash, so the URL changes with each build and the service worker's
// stale-while-revalidate can never serve last build's tree. Null until it
// lands, or for good if it fails: the shell tree and Pagefind still work.
export function useHomeData(version: string): HomeData | null {
  const [data, setData] = useState<HomeData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/home-data.json?v=${version}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HomeData | null) => {
        if (!cancelled && d) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);
  return data;
}

// The reader's reading progress (lib/reading-progress.ts, localStorage only),
// kept in sync with other tabs and with a back/forward restore of this page.
export function useReadingStore(): ReadingStore {
  const [store, setStore] = useState<ReadingStore>({});
  useEffect(() => {
    const load = () => setStore(loadStore());
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === null) load();
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
  return store;
}

export function HomeContent({
  shell,
  dataVersion,
  hasPaths = false,
  noteCount = 0,
}: {
  shell: HomeTreeNode[];
  dataVersion: string;
  /** Whether /parcours/ has reading paths to link to. */
  hasPaths?: boolean;
  /** How many notes the assistant searches, for its phone intro. */
  noteCount?: number;
}) {
  const data = useHomeData(dataVersion);
  const tree = data?.tree ?? shell;
  // --- reading progress: per-folder "x/y lues" and the "Reprendre" card ---
  const readStore = useReadingStore();
  const readCounts = useMemo(() => folderReadCounts(tree, readStore), [tree, readStore]);
  const noteTitles = useMemo(() => {
    const m = new Map<string, string>();
    const walk = (nodes: HomeTreeNode[]) => {
      for (const n of nodes) {
        if (n.type === "dir") walk(n.children);
        else if (!n.deck && !n.asset) m.set(n.href, n.title);
      }
    };
    walk(data?.tree ?? []);
    return m;
  }, [data]);
  const resume = useMemo(() => {
    const c = resumeCandidate(readStore, (s) => noteTitles.has(`/posts/${s}/`));
    return c && { ...c, title: noteTitles.get(`/posts/${c.slug}/`)!, pct: Math.round(c.progress * 100) };
  }, [readStore, noteTitles]);
  const graphData = data?.graph ?? null;
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  // Heavy attachments link straight to the original file (zooming into a
  // 12022px timeline is the whole point of it), so the tree says what it costs
  // before the click rather than picking a smaller file on the reader's behalf.
  const assetSize = (bytes: number) =>
    t("home.assetSize", { size: Math.round(bytes / 1048576) }, locale);
  // Localise the two top-level "grands thèmes" (nav.*) and the disciplines
  // (discipline.*); deeper folder names stay as authored on disk.
  const folderName = (name: string) => {
    const key = folderKey(name);
    return key ? t(key, undefined, locale) : name;
  };
  // --- browse state ----------------------------------------------------------
  // Open folders by path (browse mode). The two top-level "grands thèmes" start
  // expanded so the tree shows its disciplines on first paint — it fills the
  // left column and reveals the garden's breadth instead of two lone rows.
  // Deeper folders stay collapsed; a saved session (below) overrides this.
  const [openDirs, setOpenDirs] = useState<Set<string>>(
    () => new Set(tree.filter((n) => n.type === "dir").map((n) => n.path)),
  );
  const toggleDir = (path: string) =>
    setOpenDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  // Restore / persist the open folders across back-navigation (session).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("gkHome") || "null");
      if (Array.isArray(saved?.open)) setOpenDirs(new Set(saved.open));
    } catch {
      /* sessionStorage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("gkHome", JSON.stringify({ open: [...openDirs] }));
    } catch {
      /* sessionStorage unavailable */
    }
  }, [openDirs]);

  // An explicit ?q= (a shared link, a tag without a page, or Google's
  // sitelinks search box — the SearchAction in lib/jsonld.ts advertises this
  // entry point) opens the command palette on that query. The palette loads
  // after hydration, so wait for it a little.
  useEffect(() => {
    const urlQ = new URLSearchParams(window.location.search).get("q");
    if (!urlQ) return;
    let tries = 0;
    const timer = setInterval(() => {
      const palette = (window as PaletteWindow).__palette;
      if (palette || ++tries > 40) clearInterval(timer);
      palette?.open(urlQ);
    }, 50);
    return () => clearInterval(timer);
  }, []);

  // Deep links to any folder in the tree, at any depth: the header groups
  // ("/#applied-sciences") and the note-page breadcrumbs (a sub-folder like
  // "/#applied-sciences-agriculture"). Find the folder anywhere in the tree,
  // open it plus every ancestor, then scroll to its row.
  useEffect(() => {
    const findDir = (nodes: HomeTreeNode[], h: string): HomeTreeNode | null => {
      for (const n of nodes) {
        if (n.type !== "dir") continue;
        if (folderAnchor(n.path) === h) return n;
        const found = findDir(n.children, h);
        if (found) return found;
      }
      return null;
    };
    // The target row may not be in the DOM until React commits the newly
    // opened ancestors, so retry across a few frames before giving up.
    const scrollToAnchor = (h: string, tries = 0) => {
      const el = document.getElementById(h);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else if (tries < 12)
        requestAnimationFrame(() => scrollToAnchor(h, tries + 1));
    };
    const applyHash = () => {
      const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!h) return;
      const group = findDir(tree, h);
      if (!group || group.type !== "dir") return;
      const segs = group.path.split("/");
      setOpenDirs((prev) => {
        const next = new Set(prev);
        for (let i = 0; i < segs.length; i++) next.add(segs.slice(0, i + 1).join("/"));
        return next;
      });
      scrollToAnchor(h);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [tree]);

  // Recursive browse tree. Depth 0 = editorial group header (uppercase +
  // hairline + note count); deeper folders are lighter disclosures; notes are
  // links prefixed with an em dash.
  const renderNodes = (nodes: HomeTreeNode[], depth: number) => (
    <ul className={`m-0 list-none p-0 ${depth > 0 ? "pl-[1.1rem]" : ""}`}>
      {nodes.map((node) => {
        if (node.type === "note") {
          const icon = node.deck ? "▦" : node.asset ? "▤" : "—";
          return (
            <li key={node.href} className="m-0 mb-[0.55rem] flex items-baseline">
              <span aria-hidden="true" className="mr-2 select-none text-muted-warm">
                {icon}
              </span>
              <a
                href={node.href}
                {...(node.asset ? { target: "_blank", rel: "noopener" } : {})}
                className={`${linkCls} text-body`}
              >
                {node.title}
              </a>
              {!node.deck && !node.asset && isRead(readStore, slugFromHref(node.href)) && (
                <span
                  className="ml-[0.4rem] shrink-0 text-garden"
                  title={tr("reading.read")}
                  data-pagefind-ignore
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="sr-only"> ({tr("reading.read").toLowerCase()})</span>
                </span>
              )}
              {node.deck && (
                <span className="ml-2 shrink-0 text-micro uppercase tracking-[0.08em] text-muted-warm">
                  cartes
                </span>
              )}
              {node.bytes != null && (
                // No `uppercase` here, unlike the "cartes" tag next to it: Mo is
                // a unit symbol, and MO is a different thing.
                <span className="ml-2 shrink-0 text-micro tracking-[0.08em] text-muted-warm">
                  {assetSize(node.bytes)}
                </span>
              )}
            </li>
          );
        }
        const open = openDirs.has(node.path);
        // Every folder row is an anchor target so a note breadcrumb can deep-link
        // to it (/#<folderAnchor>); top-level groups keep their editorial spacing.
        const anchor = folderAnchor(node.path);
        const listId = `gk-dir-${anchor}`;
        const isGroup = depth === 0;
        // "x/y lues" once the reader has finished a note in this folder.
        const rc = readCounts.get(node.path);
        const readLabel =
          rc && rc.read > 0 ? t("reading.count", { read: rc.read, total: rc.total }, locale) : null;
        return (
          <li
            key={node.path}
            id={anchor}
            className={isGroup ? "mb-9 scroll-mt-6" : "m-0 mb-[0.4rem] scroll-mt-6"}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => toggleDir(node.path)}
              className={
                isGroup
                  ? "flex w-full cursor-pointer items-baseline justify-between gap-4 border-b border-rule bg-transparent p-0 pb-[0.35rem] text-left hover:bg-transparent"
                  : "flex w-full cursor-pointer items-center gap-2 bg-transparent p-0 py-[0.15rem] text-left hover:bg-transparent"
              }
            >
              {isGroup ? (
                <>
                  <span className="flex items-center gap-2">
                    <Chevron open={open} />
                    <span className="text-meta font-semibold uppercase tracking-[0.1em] text-ink">
                      {folderName(node.name)}
                    </span>
                  </span>
                  <span className="text-meta tabular-nums text-muted-warm">
                    {readLabel ? (
                      <span className="text-garden" data-pagefind-ignore>
                        {readLabel}
                      </span>
                    ) : (
                      node.count
                    )}
                  </span>
                </>
              ) : (
                <>
                  <Chevron open={open} size={10} />
                  <span className="text-body text-ink">{folderName(node.name)}</span>
                  {readLabel && (
                    <span
                      className="ml-auto shrink-0 pl-2 text-micro tabular-nums text-garden"
                      data-pagefind-ignore
                    >
                      {readLabel}
                    </span>
                  )}
                </>
              )}
            </button>
            {open && (
              <div id={listId} className={isGroup ? "mt-[0.9rem]" : "mt-[0.3rem]"}>
                {node.children.length === 0 && node.count > 0 ? (
                  // Shell folder opened before /home-data.json arrived.
                  <p aria-busy="true" className="m-0 pl-[1.1rem] text-muted-warm">…</p>
                ) : (
                  renderNodes(node.children, depth + 1)
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  // --- "ask the garden": the question opens the chat (GardenChat) ---------
  const [question, setQuestion] = useState("");
  // Phones get the mockup's shorter placeholder (app.css draws the card).
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639.98px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  function ask(text: string) {
    window.dispatchEvent(new CustomEvent("gk:chat-ask", { detail: { question: text } }));
    setQuestion("");
  }

  // Full body width: <main> reserves a 26rem right gutter for note asides on
  // wide screens; reclaim it so this zone spans the whole body.
  return (
    <section className="home-content mt-12 text-ink [font-family:var(--gk-serif),Georgia,serif] [container-type:inline-size] min-[1081px]:-mr-96">
      {/* 1. search: opens the command palette (public/js/palette.js), the
          site's one search. Typing a character on the field hands it over. */}
      <div className="relative z-30 mb-10">
        <button
          type="button"
          data-palette-open
          aria-haspopup="dialog"
          aria-expanded="false"
          onKeyDown={(e) => {
            if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
            e.preventDefault();
            (window as PaletteWindow).__palette?.open(e.key);
          }}
          className="flex w-full cursor-text items-center gap-2 border-0 border-b border-solid border-ink bg-transparent px-0 pb-2 text-left text-lead text-muted-warm"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="shrink-0 text-ink">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M15.5 15.5 21 21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="min-w-0 flex-1 truncate italic">{tr("home.searchPlaceholder")}</span>
          <kbd className="palette-kbd shrink-0 not-italic">Ctrl K</kbd>
        </button>
      </div>

      {/* "Reprendre": the unfinished note read last, back at its position
          (/js/reading-state.js restores it from the #reprendre hash). */}
      {resume && (
        <a
          href={`/posts/${resume.slug}/#reprendre`}
          data-pagefind-ignore
          className="home-resume group mb-10 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-[var(--garden-wash)] px-5 py-3 text-ink no-underline"
        >
          <span className="text-micro font-semibold uppercase tracking-[0.1em] text-garden">
            {tr("reading.resumeTitle")}
          </span>
          <span className="min-w-0 flex-1 basis-48 text-body group-hover:underline">
            {resume.title}
          </span>
          <span className="flex items-center gap-2 text-meta tabular-nums text-muted-warm">
            <span aria-hidden="true" className="block h-1 w-16 overflow-hidden rounded-xs bg-rule">
              <span className="block h-full bg-garden" style={{ width: `${resume.pct}%` }} />
            </span>
            {t("reading.progress", { pct: resume.pct }, locale)}
            <span aria-hidden="true" className="text-ink">→</span>
          </span>
        </a>
      )}

      <HomeBookmarks />

      {/* 2. two columns spread across the full body width */}
      <div className="home-cols grid grid-cols-1 gap-10 min-[700px]:items-start min-[700px]:justify-between min-[700px]:gap-y-0 min-[700px]:[grid-template-columns:minmax(240px,360px)_minmax(340px,580px)]">
        {/* left — notes browse tree */}
        <div id="notes" className="scroll-mt-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className={labelCls}>{tr("home.notesLabel")}</h2>
            {hasPaths && (
              <a
                href="/parcours/"
                className={`${linkCls} mb-4 text-meta italic text-garden`}
              >
                {tr("parcours.title")} →
              </a>
            )}
          </div>
          {renderNodes(tree, 0)}
        </div>

        {/* right — map + assistant (nudged in from the right edge on wide screens) */}
        <div className="flex flex-col gap-9 min-[1081px]:mr-12">
          <section className="home-map">
            <h2 className={labelCls}>{tr("home.mapLabel")}</h2>
            <a
              href="/graph/"
              aria-label={tr("home.mapLabel")}
              className="group relative block h-[440px] w-full cursor-pointer overflow-hidden rounded-md border border-rule hover:bg-transparent max-[700px]:h-[300px]"
            >
              <LazyGraph graphData={graphData} />
              {/* Hover cue: this decorative preview opens the full, labelled graph. */}
              <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-rule bg-paper/85 text-ink opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path
                    d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </a>
            <p className="mt-[0.7rem] text-pretty text-small italic text-muted-warm">
              {tr("home.mapCaption")}
            </p>
          </section>

          <section className="home-ask rounded-md bg-wash px-6 py-5">
            <div className="home-ask-head mb-[0.6rem] flex items-center justify-between gap-2">
              <h2 className={labelCls}>{tr("home.askLabel")}</h2>
              {/* Pushpin: open the garden chat (components/chat/GardenChat.tsx) and
                  keep it open across navigation. */}
              <button
                type="button"
                className="home-ask-pin shrink-0 cursor-pointer border-0 bg-transparent p-1 text-muted-warm hover:text-garden"
                aria-label={tr("home.pinChat")}
                title={tr("home.pinChat")}
                onClick={() => {
                  try {
                    localStorage.setItem("gkChatPinned", "1");
                  } catch {
                    /* ignore */
                  }
                  window.dispatchEvent(new Event("gk:pin-chat"));
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 17v5" />
                  <path d="M9 10.76V4h6v6.76a2 2 0 0 0 .55 1.38l1.4 1.47A1 1 0 0 1 16.2 15H7.8a1 1 0 0 1-.75-1.39l1.4-1.47A2 2 0 0 0 9 10.76z" />
                </svg>
              </button>
            </div>
            <p className="home-ask-intro m-0 mb-[1.1rem] text-pretty text-body text-ink">
              {tr("home.askIntro")}
            </p>
            {/* Phones: the same card as the mockup, the note count in the intro,
                a rounded field and a few questions to start from. */}
            <p className="home-ask-intro-m">
              {tr("dash.askIntro", { n: new Intl.NumberFormat(locale).format(noteCount) })}
            </p>
            <form
              className="home-ask-form flex items-center gap-4 border-b border-ink pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                const text = question.trim();
                if (text) ask(text);
              }}
            >
              <div className="home-ask-field contents">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1000}
                autoComplete="off"
                placeholder={tr(phone ? "dash.askPlaceholder" : "home.askPlaceholder")}
                aria-label={tr("home.askAria")}
                className="w-full flex-1 appearance-none border-0 bg-transparent p-0 text-body text-ink outline-none placeholder:italic placeholder:text-muted-warm disabled:opacity-60"
              />
              <button
                type="submit"
                aria-label={tr("home.askSend")}
                className="home-ask-send shrink-0 cursor-pointer rounded-sm border-0 bg-garden px-4 py-[0.4rem] text-meta font-semibold uppercase tracking-[0.1em] text-paper transition-colors hover:bg-garden-dark focus-visible:bg-garden-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garden disabled:cursor-default disabled:bg-rule-strong disabled:text-paper"
              >
                <span className="home-ask-send-text">{tr("home.askSend")}</span>
                <svg className="home-ask-send-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M6 11l6-6 6 6" />
                </svg>
              </button>
              </div>
            </form>
            <div className="home-ask-chips">
              {tr("dash.askChips")
                .split("|")
                .map((q) => (
                  <button key={q} type="button" onClick={() => ask(q)}>
                    {q}
                  </button>
                ))}
            </div>
          </section>
        </div>
      </div>

    </section>
  );
}
