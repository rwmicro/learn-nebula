"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HomeTreeNode, PdfRef, DomainGroup, LangGroup } from "@/lib/content";
import type { GraphData } from "@/lib/graph-data";
import { CircularGraph } from "@/components/CircularGraph";
import { t, DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n";
import { readAskStream } from "@/lib/ask-stream";
import { folderAnchor } from "@/lib/slug";

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
  /** Folder breadcrumb (group dropped) for context, e.g. "Arts · Artistes". */
  where: string;
  /** "note" = regular note, "deck" = Anki deck, "theme" = matching folder. */
  kind: "note" | "deck" | "theme";
  /** Note count, for theme results. */
  count?: number;
}

// Flatten every match. A folder whose name matches contributes a "theme" result
// AND (via ancestorMatch) all of its notes; otherwise notes match on their own
// title. Anki decks are notes tagged deck → kind "deck".
function collectMatches(
  nodes: HomeTreeNode[],
  q: string,
  ancestorMatch: boolean,
  parents: string[],
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
          where: parents.slice(1).join(" · "),
        });
      }
    } else {
      const selfMatch = fold(node.name).includes(q);
      if (selfMatch) {
        out.push({
          kind: "theme",
          title: node.name,
          path: node.path,
          count: node.count,
          where: parents.slice(1).join(" · "),
        });
      }
      out.push(
        ...collectMatches(node.children, q, ancestorMatch || selfMatch, [
          ...parents,
          node.name,
        ]),
      );
    }
  }
  return out;
}

const MAX_RESULTS = 240;

const labelCls =
  "m-0 mb-4 border-0 p-0 text-meta font-semibold uppercase tracking-[0.1em] leading-tight text-[#1a1a1a] [font-family:var(--gk-serif),Georgia,serif]";
const linkCls =
  "text-[#1a1a1a] no-underline underline-offset-[3px] hover:bg-transparent hover:underline focus-visible:underline";
const catLabelCls =
  "mb-2 text-meta font-semibold uppercase tracking-[0.1em] text-[#787369]";

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
        <code key={i} className="rounded bg-[#f0eee9] px-1 py-0.5 text-[0.92em]">
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
      className={`shrink-0 text-[#787369] transition-transform duration-200 ${
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
    <p className="m-0 flex items-center gap-2 text-body italic text-[#787369]">
      {label}
      <span aria-hidden="true" className="inline-flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#787369] [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#787369] [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#787369]" />
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
function LazyGraph({ graphData }: { graphData: GraphData }) {
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
      {show ? <CircularGraph data={graphData} preview /> : null}
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
          <p className="m-0 mt-1 text-small italic text-[#787369]">…</p>
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
            const x = d as { url: string; meta?: { title?: string }; excerpt?: string };
            return { url: x.url, title: x.meta?.title || x.url, excerpt: x.excerpt || "" };
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

export function HomeContent({
  tree,
  pdfs,
  domains,
  langs,
  graphData,
}: {
  tree: HomeTreeNode[];
  pdfs: PdfRef[];
  domains: DomainGroup[];
  langs: LangGroup[];
  graphData: GraphData;
}) {
  const locale = useLocale();
  const tr = (k: string) => t(k, undefined, locale);
  // Localise only the two top-level "grands thèmes"; deeper folder names stay as
  // authored on disk. Reuses the existing nav translations.
  const themeLabel = (name: string) =>
    name === "Applied Sciences"
      ? tr("nav.appliedsciences")
      : name === "Social Sciences"
        ? tr("nav.socialsciences")
        : name;

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
    () => (searching ? collectMatches(tree, q, false, []) : []),
    [tree, q, searching],
  );
  const notes = matches.filter((m) => m.kind === "note");
  const decks = matches.filter((m) => m.kind === "deck");
  const themes = matches.filter((m) => m.kind === "theme");
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
        themes.length + domainMatches.length + langMatches.length,
    },
    { id: "notes", label: tr("home.scopeNotes"), count: notes.length + contentHits.length },
    { id: "pdf", label: tr("home.scopePdf"), count: pdfMatches.length },
    { id: "anki", label: tr("home.scopeAnki"), count: decks.length },
    { id: "themes", label: tr("home.scopeThemes"), count: themes.length },
    { id: "domaines", label: tr("home.scopeDomains"), count: domainMatches.length },
    { id: "langues", label: tr("home.scopeLangs"), count: langMatches.length },
  ];
  const showCat = (cat: Scope) => scope === "all" || scope === cat;
  const visibleCount = scopes.find((s) => s.id === scope)?.count ?? 0;
  const openPanel = advancedOpen || searching;

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
              <span aria-hidden="true" className="mr-2 select-none text-[#787369]">
                {icon}
              </span>
              <a
                href={node.href}
                {...(node.asset ? { target: "_blank", rel: "noopener" } : {})}
                className={`${linkCls} text-body`}
              >
                {node.title}
              </a>
              {node.deck && (
                <span className="ml-2 shrink-0 text-micro uppercase tracking-[0.08em] text-[#787369]">
                  cartes
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
                  ? "flex w-full cursor-pointer items-baseline justify-between gap-4 border-b border-[#e4e2dd] bg-transparent p-0 pb-[0.35rem] text-left hover:bg-transparent"
                  : "flex w-full cursor-pointer items-center gap-2 bg-transparent p-0 py-[0.15rem] text-left hover:bg-transparent"
              }
            >
              {isGroup ? (
                <>
                  <span className="flex items-center gap-2">
                    <Chevron open={open} />
                    <span className="text-meta font-semibold uppercase tracking-[0.1em] text-[#1a1a1a]">
                      {themeLabel(node.name)}
                    </span>
                  </span>
                  <span className="text-meta tabular-nums text-[#787369]">
                    {node.count}
                  </span>
                </>
              ) : (
                <>
                  <Chevron open={open} size={10} />
                  <span className="text-body text-[#1a1a1a]">{node.name}</span>
                </>
              )}
            </button>
            {open && (
              <div id={listId} className={isGroup ? "mt-[0.9rem]" : "mt-[0.3rem]"}>
                {renderNodes(node.children, depth + 1)}
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
    <section className="mt-12 text-[#1a1a1a] [font-family:var(--gk-serif),Georgia,serif] [container-type:inline-size] min-[1081px]:-mr-96">
      {/* 1. filter field + full-width results overlay */}
      <form
        ref={formRef}
        role="search"
        className="relative z-30 mb-10"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="flex items-center gap-2 border-b border-[#1a1a1a] pb-2">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            className="shrink-0 text-[#1a1a1a]"
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
            className="w-full flex-1 appearance-none border-0 bg-transparent p-0 text-lead text-[#1a1a1a] outline-none placeholder:italic placeholder:text-[#787369] [&::-webkit-search-cancel-button]:appearance-none"
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
              className="-mr-1 shrink-0 p-1 text-[#787369] transition-colors hover:text-[#1a1a1a]"
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
          <div className="absolute left-0 right-0 top-full z-40 mt-3 max-h-[70vh] overflow-y-auto border border-[#e4e2dd] bg-[#fcfcfc] px-6 py-5 shadow-[0_12px_32px_rgba(0,0,0,0.07)]">
            {/* scope filter tabs */}
            <div className="mb-4 flex flex-wrap gap-2 border-b border-[#e4e2dd] pb-3">
              {scopes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScope(s.id)}
                  aria-pressed={scope === s.id}
                  className={`rounded-full border px-3 py-1 text-meta uppercase tracking-[0.08em] transition-colors ${
                    scope === s.id
                      ? "border-[#1a1a1a] bg-[#1a1a1a] text-[#fcfcfc]"
                      : "border-[#d8d5ce] text-[#1a1a1a] hover:border-[#1a1a1a]"
                  }`}
                >
                  {s.label}
                  {searching && (
                    <span
                      className={`ml-1.5 tabular-nums ${
                        scope === s.id ? "text-[#cfcdc6]" : "text-[#787369]"
                      }`}
                    >
                      {s.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {!searching ? (
              <p className="m-0 italic text-[#787369]">{tr("home.scopeHint")}</p>
            ) : visibleCount === 0 ? (
              <p className="m-0 italic text-[#787369]">{tr("home.empty")}</p>
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
                              <span aria-hidden="true" className="mr-2 select-none text-[#787369]">—</span>
                              <a href={m.href} className={`${linkCls} text-body`}>
                                {m.title}
                                {m.where && (
                                  <span className="ml-2 text-meta italic text-[#787369]">{m.where}</span>
                                )}
                              </a>
                            </li>
                          ))}
                        </ul>
                        {notes.length > MAX_RESULTS && (
                          <p className="mt-3 text-meta italic text-[#787369]">
                            + {notes.length - MAX_RESULTS}…
                          </p>
                        )}
                      </>
                    )}
                    {contentHits.length > 0 && (
                      <div className={notes.length > 0 ? "mt-5 border-t border-[#e4e2dd] pt-4" : ""}>
                        <p className="mb-3 text-meta font-semibold uppercase tracking-[0.1em] text-[#787369]">
                          {tr("home.inContent")}
                        </p>
                        <ul className="m-0 list-none p-0">
                          {contentHits.map((h) => (
                            <li key={h.url} className="mb-3">
                              <a href={h.url} className={`${linkCls} text-body`}>{h.title}</a>
                              {h.excerpt && (
                                <p
                                  className="m-0 mt-1 text-small text-[#787369] [&_mark]:bg-[#ffe9a8] [&_mark]:text-[#1a1a1a]"
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
                          <span aria-hidden="true" className="mr-2 select-none text-[#787369]">▤</span>
                          <a
                            href={p.href}
                            target="_blank"
                            rel="noopener"
                            className={`${linkCls} text-body`}
                          >
                            {p.title}
                            {p.where && (
                              <span className="ml-2 text-meta italic text-[#787369]">{p.where}</span>
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
                          <span aria-hidden="true" className="mr-2 select-none text-[#787369]">▦</span>
                          <a href={m.href} className={`${linkCls} text-body`}>
                            {m.title}
                            {m.where && (
                              <span className="ml-2 text-meta italic text-[#787369]">{m.where}</span>
                            )}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Themes (folders) — clicking reveals the folder in the browse tree */}
                {showCat("themes") && themes.length > 0 && (
                  <div>
                    {scope === "all" && <p className={catLabelCls}>{tr("home.scopeThemes")}</p>}
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
                            <span aria-hidden="true" className="text-[#787369]">▸</span>
                            <span className={`${linkCls} text-body`}>{themeLabel(m.title)}</span>
                            <span className="text-meta tabular-nums text-[#787369]">{m.count}</span>
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
                          <p className="m-0 mb-2 text-body font-semibold text-[#1a1a1a]">
                            {d.name}
                            <span className="ml-2 text-meta tabular-nums text-[#787369]">
                              {d.notes.length}
                            </span>
                          </p>
                          <ul className="m-0 list-none p-0 [column-gap:2.5rem] min-[700px]:columns-2">
                            {d.notes.slice(0, MAX_RESULTS).map((n) => (
                              <li
                                key={n.href}
                                className="mb-[0.55rem] flex break-inside-avoid"
                              >
                                <span aria-hidden="true" className="mr-2 select-none text-[#787369]">
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
                          <p className="m-0 mb-2 text-body font-semibold text-[#1a1a1a]">
                            {l.name}
                            <span className="ml-2 text-meta tabular-nums text-[#787369]">
                              {l.notes.length}
                            </span>
                          </p>
                          <ul className="m-0 list-none p-0 [column-gap:2.5rem] min-[700px]:columns-2">
                            {l.notes.slice(0, MAX_RESULTS).map((n) => (
                              <li
                                key={n.href}
                                className="mb-[0.55rem] flex break-inside-avoid"
                              >
                                <span aria-hidden="true" className="mr-2 select-none text-[#787369]">
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

      {/* 2. two columns spread across the full body width */}
      <div className="grid grid-cols-1 gap-10 min-[700px]:items-start min-[700px]:justify-between min-[700px]:gap-y-0 min-[700px]:[grid-template-columns:minmax(240px,360px)_minmax(340px,580px)]">
        {/* left — notes browse tree */}
        <div id="notes" className="scroll-mt-6">
          <h2 className={labelCls}>{tr("home.notesLabel")}</h2>
          {renderNodes(tree, 0)}
        </div>

        {/* right — map + assistant (nudged in from the right edge on wide screens) */}
        <div className="flex flex-col gap-9 min-[1081px]:mr-12">
          <section>
            <h2 className={labelCls}>{tr("home.mapLabel")}</h2>
            <a
              href="/graph/"
              aria-label={tr("home.mapLabel")}
              className="group relative block h-[440px] w-full cursor-pointer overflow-hidden rounded-[3px] border border-[#e4e2dd] hover:bg-transparent max-[700px]:h-[300px]"
            >
              <LazyGraph graphData={graphData} />
              {/* Hover cue: this decorative preview opens the full, labelled graph. */}
              <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-[#e4e2dd] bg-[#fcfcfc]/85 text-[#1a1a1a] opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100">
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
            <p className="mt-[0.7rem] text-pretty text-small italic text-[#787369]">
              {tr("home.mapCaption")}
            </p>
          </section>

          <section className="rounded-[3px] border border-[#e4e2dd] px-6 py-5">
            <div className="mb-[0.6rem] flex items-center justify-between gap-2">
              <h2 className={labelCls}>{tr("home.askLabel")}</h2>
              {/* Pushpin: dock the assistant at the bottom-right and keep it there
                  across navigation (PinnedAssistant, mounted site-wide). */}
              <button
                type="button"
                className="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-[#787369] hover:text-garden"
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
            <p className="m-0 mb-[1.1rem] text-pretty text-body text-[#1a1a1a]">
              {tr("home.askIntro")}
            </p>
            <form
              className="flex items-center gap-4 border-b border-[#1a1a1a] pb-2"
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
                className="w-full flex-1 appearance-none border-0 bg-transparent p-0 text-body text-[#1a1a1a] outline-none placeholder:italic placeholder:text-[#787369] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy}
                className="shrink-0 cursor-pointer rounded-[3px] border-0 bg-garden px-4 py-[0.4rem] text-meta font-semibold uppercase tracking-[0.1em] text-[#fcfcfc] transition-colors hover:bg-garden-dark focus-visible:bg-garden-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garden disabled:cursor-default disabled:bg-[#c9c6bf] disabled:text-[#fcfcfc]"
              >
                {tr("home.askSend")}
              </button>
            </form>

            {asked && (
              <div
                ref={answerRef}
                aria-live={busy ? "off" : "polite"}
                aria-busy={busy}
                className="mt-[1.1rem] max-h-[22rem] overflow-y-auto text-body leading-relaxed text-[#1a1a1a]"
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
                <p className="m-0 mb-[0.3rem] text-micro font-semibold uppercase tracking-[0.1em] text-[#787369]">
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
