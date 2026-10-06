"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HomeTreeNode, PdfRef, LangGroup } from "@/lib/content";
import type { HomeData } from "@/lib/home-data";
import type { GraphData } from "@/lib/graph-data";
import { CircularGraph } from "@/components/CircularGraph";
import { t, folderKey, DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";
import { readAskStream } from "@/lib/ask-stream";
import { folderAnchor } from "@/lib/slug";
import {
  SEARCH_MISS_MIN_CHARS,
  SEARCH_MISS_SETTLE_MS,
  reportSearchMiss,
} from "@/lib/search-miss";
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

// Diacritic-insensitive fold so the query and the note/folder names compare
// apples to apples (matches lib/content slugging).
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

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

type Scope = "all" | "notes" | "pdf" | "anki" | "themes" | "domaines" | "langues";

interface Match {
  title: string;
  /** Navigation target for note / deck results. */
  href?: string;
  /** Browse-tree key for theme (folder) results. */
  path?: string;
  /** Folder breadcrumb (group dropped) for context, e.g. ["Arts", "Artistes"],
   *  as named on disk — translated when rendered (whereLabel). */
  where: string[];
  /** "note" = regular note, "deck" = Anki deck, "theme" = matching folder. */
  kind: "note" | "deck" | "theme";
  /** Note count, for theme results. */
  count?: number;
}

// Flatten every match. A folder whose name matches contributes a "theme" result
// AND (via ancestorMatch) all of its notes; otherwise notes match on their own
// title. Anki decks are notes tagged deck → kind "deck". A folder matches on
// its on-disk name or on its label in the reader's locale ("Philosophy" or
// "Philosophie").
function collectMatches(
  nodes: HomeTreeNode[],
  q: string,
  ancestorMatch: boolean,
  parents: string[],
  label: (name: string) => string,
): Match[] {
  const out: Match[] = [];
  for (const node of nodes) {
    if (node.type === "note") {
      if (node.asset) continue; // assets show in the browse list, not in search
      if (ancestorMatch || fold(node.title).includes(q)) {
        out.push({
          kind: node.deck ? "deck" : "note",
          title: node.title,
          href: node.href,
          where: parents.slice(1),
        });
      }
    } else {
      const selfMatch =
        fold(node.name).includes(q) || fold(label(node.name)).includes(q);
      if (selfMatch) {
        out.push({
          kind: "theme",
          title: node.name,
          path: node.path,
          count: node.count,
          where: parents.slice(1),
        });
      }
      out.push(
        ...collectMatches(
          node.children,
          q,
          ancestorMatch || selfMatch,
          [...parents, node.name],
          label,
        ),
      );
    }
  }
  return out;
}

const MAX_RESULTS = 240;

const labelCls =
  "m-0 mb-4 border-0 p-0 text-meta font-semibold uppercase tracking-[0.1em] leading-tight text-ink [font-family:var(--gk-serif),Georgia,serif]";
const linkCls =
  "text-ink no-underline underline-offset-[3px] hover:bg-transparent hover:underline focus-visible:underline";
const catLabelCls =
  "mb-2 text-meta font-semibold uppercase tracking-[0.1em] text-muted-warm";

// Light Markdown → React for the assistant's answer (the system prompt asks for
// **bold**, *italic*, `code`, [links] and "- " lists). Built as React nodes, not
// via dangerouslySetInnerHTML, so there's no injection surface from the model.
function inlineMd(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] != null) {
      out.push(<strong key={i}>{m[1]}</strong>);
    } else if (m[2] != null) {
      out.push(<em key={i}>{m[2]}</em>);
    } else if (m[3] != null) {
      out.push(
        <code key={i} className="rounded bg-wash-2 px-1 py-0.5 text-[0.92em]">
          {m[3]}
        </code>,
      );
    } else if (m[4] != null && m[5] != null) {
      // Only allow safe schemes; otherwise fall back to plain text.
      out.push(
        /^(https?:\/\/|\/)/.test(m[5]) ? (
          <a key={i} href={m[5]} className={linkCls}>
            {m[4]}
          </a>
        ) : (
          m[0]
        ),
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderAnswer(text: string): ReactNode {
  return text
    .split(/\n{2,}/)
    .filter((b) => b.trim())
    .map((block, bi) => {
      const lines = block.split("\n");
      const isUl = lines.every((l) => /^\s*[-*]\s+/.test(l));
      const isOl = lines.every((l) => /^\s*\d+\.\s+/.test(l));
      if (isUl || isOl) {
        const ListTag = isOl ? "ol" : "ul";
        const marker = isOl ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
        return (
          <ListTag
            key={bi}
            className={`m-0 mb-[0.7rem] pl-[1.2rem] last:mb-0 ${isOl ? "list-decimal" : "list-disc"}`}
          >
            {lines.map((l, li) => (
              <li key={li} className="mb-1 last:mb-0">
                {inlineMd(l.replace(marker, ""))}
              </li>
            ))}
          </ListTag>
        );
      }
      return (
        <p key={bi} className="m-0 mb-[0.7rem] text-pretty whitespace-pre-wrap last:mb-0">
          {inlineMd(block)}
        </p>
      );
    });
}

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

// Shown while the assistant works but before the first token — otherwise the
// answer panel sits blank through the embed + retrieval + first-token latency.
function Thinking({ label }: { label: string }) {
  return (
    <p className="m-0 flex items-center gap-2 text-body italic text-muted-warm">
      {label}
      <span aria-hidden="true" className="inline-flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-warm [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-warm [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-warm" />
      </span>
    </p>
  );
}

interface Source {
  title?: string;
  url?: string;
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

// KaTeX styles aren't on the home; load them lazily the first time a rich
// excerpt containing math is opened (the CSS pulls its fonts only when .katex
// nodes are present, so this stays cheap).
function ensureKatexCss() {
  if (typeof document === "undefined" || document.getElementById("katex-css")) return;
  const l = document.createElement("link");
  l.id = "katex-css";
  l.rel = "stylesheet";
  l.href = "/katex/katex.min.css";
  document.head.appendChild(l);
}

// From a note's <div class="article-body">, pull a small, self-contained HTML
// snippet — the first table (with one line of context) when there is one, else
// the first blocks up to a character budget. Keeps tables/formulas intact so the
// preview renders them rather than flattening to text.
function extractSnippet(body: Element): string {
  const kids = Array.from(body.children);
  const out: Element[] = [];
  const tableIdx = kids.findIndex(
    (k) => k.tagName === "TABLE" || !!k.querySelector?.("table"),
  );
  if (tableIdx >= 0) {
    const prev = kids[tableIdx - 1];
    if (prev && /^(P|H2|H3|H4)$/.test(prev.tagName)) out.push(prev);
    out.push(kids[tableIdx]);
  } else {
    let chars = 0;
    for (const k of kids) {
      if (!/^(P|UL|OL|BLOCKQUOTE|FIGURE|H2|H3|H4|PRE)$/.test(k.tagName)) continue;
      out.push(k);
      chars += (k.textContent || "").length;
      if (chars > 480) break;
    }
  }
  return out.map((el) => el.outerHTML).join("");
}

/** On-demand rich preview of a content hit: fetches the note's built HTML and
 *  renders a snippet so tables and KaTeX show as they do on the note page. */
function RichExcerpt({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || html !== null || loading) return;
    setLoading(true);
    try {
      const res = await fetch(url);
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const body = doc.querySelector(".article-body");
      const snippet = body ? extractSnippet(body) : "";
      if (snippet.includes("katex")) ensureKatexCss();
      setHtml(snippet);
    } catch {
      setHtml("");
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mt-1 cursor-pointer border-0 bg-transparent p-0 text-meta font-semibold uppercase tracking-[0.08em] text-garden underline-offset-[3px] hover:underline"
      >
        {open ? "− " : "+ "}
        {label}
      </button>
      {open &&
        (loading ? (
          <p className="m-0 mt-1 text-small italic text-muted-warm">…</p>
        ) : html ? (
          <div
            className="rich-excerpt"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null)}
    </>
  );
}

interface PfHit {
  url: string;
  title: string;
  excerpt: string;
  /** Where the note lives ("Philosophie › Philosophes"), its `section`
   *  Pagefind metadata (lib/html.ts noteSectionMetaHtml), built in `fr`. */
  section?: string;
  /** The discipline's i18n key, to re-translate `section`'s first part. */
  dkey?: string;
}

// Full-text search over note CONTENT via Pagefind (index built into /pagefind by
// `npx pagefind --site out`). Production only — gracefully no-ops in dev (no
// index), where the title/folder filter above still works.
function usePagefind(query: string): PfHit[] {
  const [hits, setHits] = useState<PfHit[]>([]);
  const pfRef = useRef<{
    search: (q: string) => Promise<{ results: { data: () => Promise<unknown> }[] }>;
  } | null>(null);
  const failed = useRef(false);
  useEffect(() => {
    const q = query.trim();
    // Pagefind is only built into /pagefind by `pnpm build`; skip the fetch under
    // `next dev` so it doesn't log a 404 for /pagefind/pagefind.js (the home
    // search falls back to the title/folder filter there anyway).
    if (process.env.NODE_ENV !== "production") return;
    if (q.length < 2 || failed.current) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (!pfRef.current) {
          // Variable specifier (not a literal) so the bundler/TS leave it as a
          // runtime URL import — the file only exists in the built /pagefind.
          const mod = "/pagefind/pagefind.js";
          pfRef.current = await import(
            /* webpackIgnore: true */ /* turbopackIgnore: true */ mod
          );
        }
        const res = await pfRef.current!.search(q);
        const data = await Promise.all(res.results.slice(0, 20).map((r) => r.data()));
        if (cancelled) return;
        setHits(
          data.map((d) => {
            const x = d as {
              url: string;
              meta?: { title?: string; section?: string; dkey?: string };
              excerpt?: string;
            };
            return {
              url: x.url,
              title: x.meta?.title || x.url,
              excerpt: x.excerpt || "",
              section: x.meta?.section,
              dkey: x.meta?.dkey,
            };
          }),
        );
      } catch {
        failed.current = true; // no index (dev) → stop retrying
        if (!cancelled) setHits([]);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
  return hits;
}

// Fetch /home-data.json once (lib/home-data.ts). The version is the file's
// content hash, so the URL changes with each build and the service worker's
// stale-while-revalidate can never serve last build's tree. Null until it
// lands, or for good if it fails: the shell tree and Pagefind still work.
function useHomeData(version: string): HomeData | null {
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
function useReadingStore(): ReadingStore {
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
  pdfs,
  langs,
  hasPaths = false,
}: {
  shell: HomeTreeNode[];
  dataVersion: string;
  pdfs: PdfRef[];
  langs: LangGroup[];
  /** Whether /parcours/ has reading paths to link to. */
  hasPaths?: boolean;
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
  const domains = useMemo(() => data?.domains ?? [], [data]);
  const graphData = data?.graph ?? null;
  const locale = useLocale();
  const tr = (k: string) => t(k, undefined, locale);
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
  const whereLabel = (parts: string[]) => parts.map(folderName).join(" · ");
  // A Pagefind hit's `section` is built in the default locale; swap its
  // discipline for the active locale's name.
  const sectionLabel = (h: PfHit) => {
    if (!h.section || !h.dkey || locale === DEFAULT_LOCALE) return h.section;
    const built = t(h.dkey);
    return h.section.startsWith(built)
      ? t(h.dkey, undefined, locale) + h.section.slice(built.length)
      : h.section;
  };

  // --- search + collapsible browse state ----------------------------------
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const q = fold(query.trim());
  const searching = q !== "";
  // Advanced search: scope filter (notes / pdf / anki / themes) in a panel that
  // drops down when the field gains focus.
  const [scope, setScope] = useState<Scope>("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  // Reveal a folder in the browse tree: open it and every ancestor.
  const openToPath = (path: string) =>
    setOpenDirs((prev) => {
      const segs = path.split("/");
      const next = new Set(prev);
      for (let i = 0; i < segs.length; i++) next.add(segs.slice(0, i + 1).join("/"));
      return next;
    });

  // Close the advanced panel on an outside click.
  useEffect(() => {
    if (!advancedOpen) return;
    const onDown = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setAdvancedOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [advancedOpen]);

  // Search results live in a full-width overlay, not in the browse tree.
  const matches = useMemo(
    () =>
      searching
        ? collectMatches(tree, q, false, [], (name) => {
            const key = folderKey(name);
            return key ? t(key, undefined, locale) : name;
          })
        : [],
    [tree, q, searching, locale],
  );
  const notes = matches.filter((m) => m.kind === "note");
  const decks = matches.filter((m) => m.kind === "deck");
  const themes = matches.filter((m) => m.kind === "theme");
  // Tags with a /themes/<slug>/ page (from /home-data.json) also belong to
  // the "Thèmes" scope: typing "kant" finds the Kant theme page.
  const tagMatches = useMemo(
    () =>
      searching && data?.tags
        ? data.tags.filter(([name, slug]) => fold(name).includes(q) || slug.includes(q))
        : [],
    [data, q, searching],
  );
  const pdfMatches = useMemo(
    () =>
      searching
        ? pdfs.filter(
            (p) => fold(p.title).includes(q) || fold(p.where).includes(q),
          )
        : [],
    [pdfs, q, searching],
  );
  // Domaines: match the frontmatter `domain` name; each match lists its notes.
  const domainMatches = useMemo(
    () => (searching ? domains.filter((d) => fold(d.name).includes(q)) : []),
    [domains, q, searching],
  );
  // Langues: match the frontmatter `lang` display name or its raw code (so
  // typing either "espagnol" or "es" finds the group), each listing its notes.
  const langMatches = useMemo(
    () =>
      searching
        ? langs.filter((l) => fold(l.name).includes(q) || fold(l.code).includes(q))
        : [],
    [langs, q, searching],
  );

  // Full-text content matches (Pagefind, prod only); drop notes already shown by
  // the title/folder filter above.
  const pfHits = usePagefind(query);
  const noteUrls = new Set(notes.map((m) => m.href));
  const contentHits = pfHits.filter((h) => !noteUrls.has(h.url)).slice(0, 20);

  // Per-scope counts for the filter tabs, and which scope a category shows in.
  const scopes: { id: Scope; label: string; count: number }[] = [
    {
      id: "all",
      label: tr("home.scopeAll"),
      count:
        notes.length + contentHits.length + pdfMatches.length + decks.length +
        themes.length + tagMatches.length + domainMatches.length + langMatches.length,
    },
    { id: "notes", label: tr("home.scopeNotes"), count: notes.length + contentHits.length },
    { id: "pdf", label: tr("home.scopePdf"), count: pdfMatches.length },
    { id: "anki", label: tr("home.scopeAnki"), count: decks.length },
    { id: "themes", label: tr("home.scopeThemes"), count: themes.length + tagMatches.length },
    { id: "domaines", label: tr("home.scopeDomains"), count: domainMatches.length },
    { id: "langues", label: tr("home.scopeLangs"), count: langMatches.length },
  ];
  const showCat = (cat: Scope) => scope === "all" || scope === cat;
  const visibleCount = scopes.find((s) => s.id === scope)?.count ?? 0;
  const openPanel = advancedOpen || searching;

  // "Recherches sans résultat" for /admin: a query that stays unchanged and
  // empty-handed (Pagefind included — its hits reset the timer) is reported
  // once per page view. Fire-and-forget; fails silently without a backend.
  const totalCount = scopes[0].count;
  useEffect(() => {
    const raw = query.trim();
    if (totalCount > 0 || raw.length < SEARCH_MISS_MIN_CHARS) return;
    const timer = setTimeout(() => reportSearchMiss(raw, "home"), SEARCH_MISS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [query, totalCount]);

  // restore / persist the query + open folders across back-navigation (session)
  useEffect(() => {
    // An explicit ?q= (a shared link, or Google's sitelinks search box — the
    // SearchAction in lib/jsonld.ts advertises this entry point) wins over the
    // restored session.
    const urlQ = new URLSearchParams(window.location.search).get("q");
    if (urlQ) setQuery(urlQ);
    try {
      const saved = JSON.parse(sessionStorage.getItem("gkHome") || "null");
      if (!urlQ && saved?.q) setQuery(saved.q);
      if (Array.isArray(saved?.open)) setOpenDirs(new Set(saved.open));
    } catch {
      /* sessionStorage unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "gkHome",
        JSON.stringify({ q: query, open: [...openDirs] }),
      );
    } catch {
      /* sessionStorage unavailable */
    }
  }, [query, openDirs]);

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

  // --- inline "ask the garden" --------------------------------------------
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  // Follow the streamed answer: keep the scroll pinned to the bottom while it grows.
  useEffect(() => {
    if (busy && answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
    }
  }, [answer, busy]);
  // Abort any in-flight assistant stream if the page unmounts mid-answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function ask(text: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setAsked(true);
    setAnswer("");
    setSources([]);
    setBusy(true);

    let resp: Response;
    try {
      resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, locale }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setAnswer(tr("askAi.errorReach"));
      setBusy(false);
      return;
    }
    if (!resp.ok || !resp.body) {
      setAnswer(tr(resp.status === 429 ? "askAi.errorRate" : "askAi.errorUnavailable"));
      setBusy(false);
      return;
    }

    // NDJSON stream (shared parser): {sources}, then {chunk} deltas, {error}.
    let raw = "";
    try {
      await readAskStream(resp.body, {
        onSources: (s) =>
          setSources(s.filter((x) => x && x.url && /^(https?:|\/)/.test(x.url))),
        onChunk: (t) => {
          raw = t;
          setAnswer(t);
        },
        partialError: tr("askAi.errorPartial"),
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setAnswer(raw || tr("askAi.errorUnavailable"));
    }
    setBusy(false);
    if (abortRef.current === ctrl) abortRef.current = null;
  }

  // Full body width: <main> reserves a 26rem right gutter for note asides on
  // wide screens; reclaim it so this zone spans the whole body.
  return (
    <section className="mt-12 text-ink [font-family:var(--gk-serif),Georgia,serif] [container-type:inline-size] min-[1081px]:-mr-96">
      {/* 1. filter field + full-width results overlay */}
      <form
        ref={formRef}
        role="search"
        className="relative z-30 mb-10"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="flex items-center gap-2 border-b border-ink pb-2">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            className="shrink-0 text-ink"
          >
            <circle
              cx="10.5"
              cy="10.5"
              r="6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M15.5 15.5 21 21"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <span className="sr-only">{tr("home.searchAria")}</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setAdvancedOpen(true)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              if (query) setQuery("");
              else setAdvancedOpen(false);
            }}
            autoComplete="off"
            placeholder={tr("home.searchPlaceholder")}
            aria-label={tr("home.searchAria")}
            className="w-full flex-1 appearance-none border-0 bg-transparent p-0 text-lead text-ink outline-none placeholder:italic placeholder:text-muted-warm [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              aria-label={tr("home.searchClear")}
              title={tr("home.searchClear")}
              className="-mr-1 shrink-0 p-1 text-muted-warm transition-colors hover:text-ink"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M6 6 18 18M18 6 6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </label>

        {openPanel && (
          <div className="absolute left-0 right-0 top-full z-40 mt-3 max-h-[70vh] overflow-y-auto border border-rule bg-paper px-6 py-5 shadow-[0_12px_32px_rgba(0,0,0,0.07)]">
            {/* scope filter tabs */}
            <div className="mb-4 flex flex-wrap gap-2 border-b border-rule pb-3">
              {scopes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScope(s.id)}
                  aria-pressed={scope === s.id}
                  className={`rounded-full border px-3 py-1 text-meta uppercase tracking-[0.08em] transition-colors ${
                    scope === s.id
                      ? "border-ink bg-ink text-paper"
                      : "border-rule text-ink hover:border-ink"
                  }`}
                >
                  {s.label}
                  {searching && (
                    <span
                      className={`ml-1.5 tabular-nums ${
                        scope === s.id ? "text-paper/70" : "text-muted-warm"
                      }`}
                    >
                      {s.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {!searching ? (
              <p className="m-0 italic text-muted-warm">{tr("home.scopeHint")}</p>
            ) : visibleCount === 0 ? (
              <p className="m-0 italic text-muted-warm">{tr("home.empty")}</p>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Notes (+ full-text content hits) */}
                {showCat("notes") && (notes.length > 0 || contentHits.length > 0) && (
                  <div>
                    {scope === "all" && (
                      <p className={catLabelCls}>{tr("home.scopeNotes")}</p>
                    )}
                    {notes.length > 0 && (
                      <>
                        <ul className="m-0 list-none p-0 [column-gap:2.5rem] min-[700px]:columns-2 min-[1100px]:columns-3">
                          {notes.slice(0, MAX_RESULTS).map((m) => (
                            <li key={m.href} className="mb-[0.55rem] flex break-inside-avoid">
                              <span aria-hidden="true" className="mr-2 select-none text-muted-warm">—</span>
                              <a href={m.href} className={`${linkCls} text-body`}>
                                {m.title}
                                {m.where.length > 0 && (
                                  <span className="ml-2 text-meta italic text-muted-warm">{whereLabel(m.where)}</span>
                                )}
                              </a>
                            </li>
                          ))}
                        </ul>
                        {notes.length > MAX_RESULTS && (
                          <p className="mt-3 text-meta italic text-muted-warm">
                            + {notes.length - MAX_RESULTS}…
                          </p>
                        )}
                      </>
                    )}
                    {contentHits.length > 0 && (
                      <div className={notes.length > 0 ? "mt-5 border-t border-rule pt-4" : ""}>
                        <p className="mb-3 text-meta font-semibold uppercase tracking-[0.1em] text-muted-warm">
                          {tr("home.inContent")}
                        </p>
                        <ul className="m-0 list-none p-0">
                          {contentHits.map((h) => (
                            <li key={h.url} className="mb-3">
                              <a href={h.url} className={`${linkCls} text-body`}>{h.title}</a>
                              {h.section && (
                                <span className="ml-2 text-meta italic text-muted-warm">
                                  {sectionLabel(h)}
                                </span>
                              )}
                              {h.excerpt && (
                                <p
                                  className="m-0 mt-1 text-small text-muted-warm [&_mark]:rounded-[2px] [&_mark]:bg-mark-soft [&_mark]:px-[0.1em] [&_mark]:text-ink"
                                  dangerouslySetInnerHTML={{ __html: h.excerpt }}
                                />
                              )}
                              <RichExcerpt url={h.url} label={tr("home.excerpt")} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* PDF attachments */}
                {showCat("pdf") && pdfMatches.length > 0 && (
                  <div>
                    {scope === "all" && <p className={catLabelCls}>{tr("home.scopePdf")}</p>}
                    <ul className="m-0 list-none p-0 [column-gap:2.5rem] min-[700px]:columns-2">
                      {pdfMatches.slice(0, MAX_RESULTS).map((p) => (
                        <li key={p.href} className="mb-[0.55rem] flex break-inside-avoid">
                          <span aria-hidden="true" className="mr-2 select-none text-muted-warm">▤</span>
                          <a
                            href={p.href}
                            target="_blank"
                            rel="noopener"
                            className={`${linkCls} text-body`}
                          >
                            {p.title}
                            {p.where && (
                              <span className="ml-2 text-meta italic text-muted-warm">
                                {whereLabel(p.where.split(" · "))}
                              </span>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Anki decks */}
                {showCat("anki") && decks.length > 0 && (
                  <div>
                    {scope === "all" && <p className={catLabelCls}>{tr("home.scopeAnki")}</p>}
                    <ul className="m-0 list-none p-0">
                      {decks.map((m) => (
                        <li key={m.href} className="mb-[0.55rem] flex break-inside-avoid">
                          <span aria-hidden="true" className="mr-2 select-none text-muted-warm">▦</span>
                          <a href={m.href} className={`${linkCls} text-body`}>
                            {m.title}
                            {m.where.length > 0 && (
                              <span className="ml-2 text-meta italic text-muted-warm">{whereLabel(m.where)}</span>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Themes: tags with a /themes/ page (links), then folders —
                    clicking a folder reveals it in the browse tree */}
                {showCat("themes") && (themes.length > 0 || tagMatches.length > 0) && (
                  <div>
                    {scope === "all" && <p className={catLabelCls}>{tr("home.scopeThemes")}</p>}
                    {tagMatches.length > 0 && (
                      <ul
                        className={`m-0 list-none p-0 [column-gap:2.5rem] min-[700px]:columns-2 min-[1100px]:columns-3 ${
                          themes.length > 0 ? "mb-3" : ""
                        }`}
                      >
                        {tagMatches.slice(0, MAX_RESULTS).map(([name, slug, count]) => (
                          <li key={slug} className="mb-[0.4rem] flex items-baseline gap-2 break-inside-avoid">
                            <span aria-hidden="true" className="select-none text-muted-warm">#</span>
                            <a href={`/themes/${slug}/`} className={`${linkCls} text-body`}>
                              {name}
                            </a>
                            <span className="text-meta tabular-nums text-muted-warm">
                              {t("themes.count", { n: count }, locale)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <ul className="m-0 list-none p-0">
                      {themes.map((m) => (
                        <li key={m.path} className="mb-[0.4rem]">
                          <button
                            type="button"
                            onClick={() => {
                              if (m.path) openToPath(m.path);
                              setQuery("");
                              setAdvancedOpen(false);
                              document
                                .getElementById("notes")
                                ?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="flex items-baseline gap-2 bg-transparent p-0 text-left"
                          >
                            <span aria-hidden="true" className="text-muted-warm">▸</span>
                            <span className={`${linkCls} text-body`}>{folderName(m.title)}</span>
                            <span className="text-meta tabular-nums text-muted-warm">{m.count}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Domaines (frontmatter `domain`) — each match lists its notes */}
                {showCat("domaines") && domainMatches.length > 0 && (
                  <div>
                    {scope === "all" && (
                      <p className={catLabelCls}>{tr("home.scopeDomains")}</p>
                    )}
                    <div className="flex flex-col gap-4">
                      {domainMatches.map((d) => (
                        <div key={d.name}>
                          <p className="m-0 mb-2 text-body font-semibold text-ink">
                            {d.name}
                            <span className="ml-2 text-meta tabular-nums text-muted-warm">
                              {d.notes.length}
                            </span>
                          </p>
                          <ul className="m-0 list-none p-0 [column-gap:2.5rem] min-[700px]:columns-2">
                            {d.notes.slice(0, MAX_RESULTS).map((n) => (
                              <li
                                key={n.href}
                                className="mb-[0.55rem] flex break-inside-avoid"
                              >
                                <span aria-hidden="true" className="mr-2 select-none text-muted-warm">
                                  —
                                </span>
                                <a href={n.href} className={`${linkCls} text-body`}>
                                  {n.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Langues (frontmatter `lang`) — each match lists its notes */}
                {showCat("langues") && langMatches.length > 0 && (
                  <div>
                    {scope === "all" && (
                      <p className={catLabelCls}>{tr("home.scopeLangs")}</p>
                    )}
                    <div className="flex flex-col gap-4">
                      {langMatches.map((l) => (
                        <div key={l.code}>
                          <p className="m-0 mb-2 text-body font-semibold text-ink">
                            {l.name}
                            <span className="ml-2 text-meta tabular-nums text-muted-warm">
                              {l.notes.length}
                            </span>
                          </p>
                          <ul className="m-0 list-none p-0 [column-gap:2.5rem] min-[700px]:columns-2">
                            {l.notes.slice(0, MAX_RESULTS).map((n) => (
                              <li
                                key={n.href}
                                className="mb-[0.55rem] flex break-inside-avoid"
                              >
                                <span aria-hidden="true" className="mr-2 select-none text-muted-warm">
                                  —
                                </span>
                                <a href={n.href} className={`${linkCls} text-body`}>
                                  {n.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </form>

      {/* "Reprendre": the unfinished note read last, back at its position
          (/js/reading-state.js restores it from the #reprendre hash). */}
      {resume && (
        <a
          href={`/posts/${resume.slug}/#reprendre`}
          data-pagefind-ignore
          className="group mb-10 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[3px] border border-rule border-l-[3px] border-l-garden px-5 py-3 text-ink no-underline hover:bg-wash"
        >
          <span className="text-micro font-semibold uppercase tracking-[0.1em] text-garden">
            {tr("reading.resumeTitle")}
          </span>
          <span className="min-w-0 flex-1 basis-48 text-body group-hover:underline">
            {resume.title}
          </span>
          <span className="flex items-center gap-2 text-meta tabular-nums text-muted-warm">
            <span aria-hidden="true" className="block h-1 w-16 overflow-hidden rounded-sm bg-rule">
              <span className="block h-full bg-garden" style={{ width: `${resume.pct}%` }} />
            </span>
            {t("reading.progress", { pct: resume.pct }, locale)}
            <span aria-hidden="true" className="text-ink">→</span>
          </span>
        </a>
      )}

      {/* 2. two columns spread across the full body width */}
      <div className="grid grid-cols-1 gap-10 min-[700px]:items-start min-[700px]:justify-between min-[700px]:gap-y-0 min-[700px]:[grid-template-columns:minmax(240px,360px)_minmax(340px,580px)]">
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
          <section>
            <h2 className={labelCls}>{tr("home.mapLabel")}</h2>
            <a
              href="/graph/"
              aria-label={tr("home.mapLabel")}
              className="group relative block h-[440px] w-full cursor-pointer overflow-hidden rounded-[3px] border border-rule hover:bg-transparent max-[700px]:h-[300px]"
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

          <section className="rounded-[3px] border border-rule px-6 py-5">
            <div className="mb-[0.6rem] flex items-center justify-between gap-2">
              <h2 className={labelCls}>{tr("home.askLabel")}</h2>
              {/* Pushpin: dock the assistant at the bottom-right and keep it there
                  across navigation (PinnedAssistant, mounted site-wide). */}
              <button
                type="button"
                className="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-muted-warm hover:text-garden"
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
            <p className="m-0 mb-[1.1rem] text-pretty text-body text-ink">
              {tr("home.askIntro")}
            </p>
            <form
              className="flex items-center gap-4 border-b border-ink pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                const text = question.trim();
                if (text) ask(text);
              }}
            >
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1000}
                autoComplete="off"
                disabled={busy}
                placeholder={tr("home.askPlaceholder")}
                aria-label={tr("home.askAria")}
                className="w-full flex-1 appearance-none border-0 bg-transparent p-0 text-body text-ink outline-none placeholder:italic placeholder:text-muted-warm disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy}
                className="shrink-0 cursor-pointer rounded-[3px] border-0 bg-garden px-4 py-[0.4rem] text-meta font-semibold uppercase tracking-[0.1em] text-paper transition-colors hover:bg-garden-dark focus-visible:bg-garden-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garden disabled:cursor-default disabled:bg-rule-strong disabled:text-paper"
              >
                {tr("home.askSend")}
              </button>
            </form>

            {asked && (
              <div
                ref={answerRef}
                aria-live={busy ? "off" : "polite"}
                aria-busy={busy}
                className="mt-[1.1rem] max-h-[22rem] overflow-y-auto text-body leading-relaxed text-ink"
              >
                {busy && !answer ? (
                  <Thinking label={tr("askAi.searching")} />
                ) : (
                  renderAnswer(answer)
                )}
              </div>
            )}

            {sources.length > 0 && (
              <div className="mt-3">
                <p className="m-0 mb-[0.3rem] text-micro font-semibold uppercase tracking-[0.1em] text-muted-warm">
                  {tr("askAi.sourcesTitle")}
                </p>
                <ul className="m-0 list-disc pl-[1.1rem]">
                  {sources.map((s, i) => (
                    <li key={i}>
                      <a href={s.url} className={linkCls}>
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>

    </section>
  );
}
