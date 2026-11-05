"use client";

// "Demander au jardin": the site's single AI assistant, as a chat page in
// the manner of the ChatGPT / Claude apps — full screen on a phone, a tall
// panel on the right from 640px. Mounted site-wide in the root layout.
//
// Every answer is written on the reader's device (lib/garden-ai.ts): Chrome's
// Gemini Nano when it covers the language, else Qwen3.5-2B downloaded once
// after the reader agrees (lib/local-llm.ts). The server only retrieves the
// passages and builds the prompt (/api/ask/context). Its own LLM is not
// offered (SERVER_LLM_OFFERED); without a model the chat says so.
//
// Opened by:
//   • the note's "Demander sur cette note…" bar (phones) / sprout button;
//   • "Expliquer" and "Avec mes mots" in the selection menu (`gk:explain`,
//     `gk:explain-own`, public/js/selection-menu.js);
//   • the home page's field (`gk:chat-ask`), `gk:pin-chat`;
//   • `gk:ai-setup` (public/js/translate.js) opens only the download sheet.
// Conversations stay in this browser (lib/chat-history.ts): the home lists
// the last ones (« Reprendre »), « Tout voir » groups them by note.
//
// From 640px, desktop tools: the history as a column with a search (☰), a
// panel the reader can widen (drag its edge, or « Élargir »), « Côte à côte »
// (the page beside the chat, never under it: lib/chat-dock.ts), the ⋯ menu
// (rename, pin, Markdown export, delete), keyboard shortcuts (Ctrl/⌘ J,
// Ctrl/⌘ ⇧ O, Ctrl/⌘ \, Échap, ↑). Everywhere: formulas drawn by KaTeX
// (loaded on demand), the answer's « [n] » as source pastilles that show their
// passage and find it in the note, editing a question, follow-ups under an
// answer, and « + » to attach the section on screen, the selection or
// another note.

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { hasMath, markdownToHtml } from "@/lib/markdown-lite";
import { escapeHtml } from "@/lib/escape";
import { readAskStream } from "@/lib/ask-stream";
import {
  detectLanguage,
  nanoAvailability,
  nanoSetAsideReason,
  resetNano,
  warmNano,
  type Availability,
} from "@/lib/browser-ai";
import {
  deleteLocalModel,
  loadLocalModel,
  localModelCached,
  localModelDownloadedOn,
  localModelError,
  localModelLoaded,
  localModel,
  onLoadProgress,
  setLocalModelEnabled,
  storageFree,
  type ChatTurn,
  type LoadProgress,
} from "@/lib/local-llm";
import {
  SERVER_LLM_OFFERED,
  aiRoute,
  deviceWord,
  generateOnDevice,
  type AiRoute,
} from "@/lib/garden-ai";
import {
  SOCRATIC_RULES,
  cardSystem,
  explainSystemDevice,
  explainUser,
  parseCard,
  parseExplainFeedback,
  replyLangHint,
} from "@/lib/ask-prompts";
import {
  chatTitle,
  deleteChat,
  groupByNote,
  loadChats,
  saveChat,
  type ChatMessage,
  type ChatMode,
  type ChatNote,
  type ChatSource,
  type Conversation,
} from "@/lib/chat-history";
import {
  addQuestion,
  loadNoteDeck,
  noteSlugFromPath,
  saveNoteDeck,
} from "@/lib/note-quiz";
import {
  conversationMarkdown,
  exportFileName,
  nextSection,
  railGroups,
  searchChats,
  searchNotes,
} from "@/lib/chat-tools";
import {
  canDock,
  dock,
  flashPassage,
  headingWords,
  inDockFrame,
  isDocked,
  navigatePage,
  noteTextFromHtml,
  pageDoc,
  pageWindow,
  undock,
  visibleSection,
} from "@/lib/chat-dock";
// Type-only: erased at build, so lib/content.ts (node:fs) never reaches the bundle.
import type { ScopeOption } from "@/lib/content";

const st = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const Ic = {
  sprout: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M12 21v-7" />
      <path d="M12 14C7 14 4.5 11 4.5 6.5 9 6.5 12 9 12 14Z" />
      <path d="M12 12c0-4.5 3-7.5 7.5-7.5 0 4.5-3 7.5-7.5 7.5Z" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.2} aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M12 20h8M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  down: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.6} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  up: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.4} aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  ),
  thumb: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M7 11v9H4v-9h3Zm0 0 4-7c1.5 0 2.5 1 2.2 2.6L12.7 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7" />
    </svg>
  ),
  speak: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4ZM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  ),
  redo: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="3" y="7" width="14" height="13" rx="2" />
      <path d="M7 4h12a2 2 0 0 1 2 2v11" />
    </svg>
  ),
  chev: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.4} aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  ),
  chip: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </svg>
  ),
  dl: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  ),
  wifi: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.7 15.8a5 5 0 0 1 6.6 0" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  ),
  disk: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h.01M11 15h6" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.4} aria-hidden="true">
      <path d="m5 12 5 5 9-10" />
    </svg>
  ),
  q: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  side: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  ),
  dock: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M14 4v16M6.5 9h4M6.5 12.5h4" />
    </svg>
  ),
  expand: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </svg>
  ),
  shrink: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M20 4l-6 6M14 5v5h5M4 20l6-6M5 14h5v5" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.6} aria-hidden="true">
      <circle cx="5" cy="12" r="0.8" />
      <circle cx="12" cy="12" r="0.8" />
      <circle cx="19" cy="12" r="0.8" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.2} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M9 4h6l-1 6 4 3H6l4-3-1-6ZM12 13v7" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  ),
  kbd: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.2} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  sel: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 12h8" />
    </svg>
  ),
  sec: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <path d="M4 6h16M4 12h10M4 18h7" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" {...st} strokeWidth={2.2} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  ),
};

/** Discipline colours for the history avatars (stable per name). */
const AV = ["#6b4fbb", "#2d6cc0", "#3f6b4a", "#b8740f", "#009b8f", "#b3322f"];
const avColor = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AV[Math.abs(h) % AV.length];
};
const SRC_COLORS = ["#3f6b4a", "#6b4fbb", "#b8740f", "#2d6cc0", "#009b8f"];

const SCOPE_KEY = "gkChatScope";
const DL_LATER_KEY = "gkLocalLlmLater";
/** Desktop layout: over the page, beside it, or wide (localStorage). Unset =
 *  beside the page where there is room (from 1100px), else over it. */
const LAYOUT_KEY = "gkChatLayout";
/** The history column shown (localStorage, "1"). */
const RAIL_KEY = "gkChatRail";
/** The panel's width in px, as the reader dragged it (localStorage). */
const WIDTH_KEY = "gkChatWidth";
/** A conversation to reopen on the next page load (sessionStorage): set
 *  while « côte à côte » (a reload) and when leaving it for another page. */
const REOPEN_KEY = "gkChatReopen";
type Layout = "overlay" | "dock" | "wide";

function lsGet(k: string): string {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
}
function lsSet(k: string, v: string) {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* storage blocked */
  }
}

// KaTeX for the formulas in answers: ~270 KB, so loaded the first time an
// answer holds one, with the site's own stylesheet (public/katex/).
type Katex = { renderToString(tex: string, o: object): string };
let katexLib: Katex | null = null;
let katexLoading: Promise<void> | null = null;
function loadKatex(): Promise<void> {
  if (!katexLoading) {
    katexLoading = import("katex").then((m) => {
      katexLib = ((m as unknown as { default?: Katex }).default ?? m) as Katex;
      if (!document.querySelector('link[href="/katex/katex.min.css"]')) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = "/katex/katex.min.css";
        document.head.appendChild(l);
      }
    });
  }
  return katexLoading;
}
const katexMath = (tex: string, display: boolean) =>
  katexLib!.renderToString(tex, { displayMode: display, throwOnError: false, output: "html" });
const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

interface PageNote extends ChatNote {
  /** Folder slug of the note, the "Cette note" retrieval scope. */
  folder: string;
  /** Its section headings, for the suggestions. */
  headings: string[];
}

function readPage(): PageNote | null {
  if (typeof window === "undefined") return null;
  // Beside the chat, the page is in the frame (lib/chat-dock.ts).
  const win = pageWindow();
  const document = win.document;
  const location = win.location;
  if (!location.pathname.startsWith("/posts/")) return null;
  const title =
    document
      .querySelector("main h1")
      ?.textContent?.replace(/\s+/g, " ")
      .trim() ?? "";
  if (!title) return null;
  const slug = noteSlugFromPath(location.pathname) ?? "";
  const folder = slug.split("/").slice(0, -1).join("/");
  const discipline =
    document
      .querySelector("main .crumbs a, .note-header-crumb a")
      ?.textContent?.trim() || undefined;
  const headings = Array.from(
    document.querySelectorAll("main .article-body h2"),
  )
    .map(headingWords)
    .filter((h) => h.length > 2 && h.length < 70)
    .slice(0, 6);
  return {
    title: title.slice(0, 200),
    url: location.pathname,
    discipline,
    folder,
    headings,
  };
}

/** A heading's words, without its "#" anchor link or section number. */
const headingText = headingWords;

/** The heading of the section a passage sits in, for « Relire … ». */
function sectionOf(passage: string): { title: string; id: string } | null {
  const body = pageDoc().querySelector("main .article-body");
  const probe = passage.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!body || !probe) return null;
  let heading: Element | null = null;
  for (const el of Array.from(
    body.querySelectorAll("h2, h3, p, li, blockquote, td"),
  )) {
    if (/^H[23]$/.test(el.tagName)) heading = el;
    else if ((el.textContent ?? "").replace(/\s+/g, " ").includes(probe)) break;
  }
  if (!heading || !heading.id) return null;
  const title = headingText(heading);
  return title ? { title, id: heading.id } : null;
}

function emptyConv(
  note: PageNote | null,
  scope: string,
  mode: ChatMode,
): Conversation {
  return {
    id: newId(),
    title: "",
    note: note
      ? { title: note.title, url: note.url, discipline: note.discipline }
      : null,
    scope,
    mode,
    updated: Date.now(),
    messages: [],
  };
}

const fmtGb = (bytes: number, locale: string) =>
  (bytes / 1e9).toLocaleString(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
const fmtMb = (bytes: number, locale: string) =>
  bytes >= 1e9 ? `${fmtGb(bytes, locale)} Go` : `${Math.round(bytes / 1e6)} Mo`;

type Sheet = null | "confirm" | "sources" | "unsupported" | "card" | "keys";
type NoteRef = { title: string; href: string; folder?: string };
type DlState = "idle" | "loading" | "ready" | "failed";

export function GardenChat({ scopes = [] }: { scopes?: ScopeOption[] }) {
  const locale = useLocale();
  const tr = useCallback(
    (k: string, vars?: Record<string, string | number>) => t(k, vars, locale),
    [locale],
  );
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history" | "settings">("chat");
  const [page, setPage] = useState<PageNote | null>(null);
  const [conv, setConv] = useState<Conversation>(() =>
    emptyConv(null, "", "answer"),
  );
  const [chats, setChats] = useState<Conversation[]>([]);
  const [input, setInput] = useState("");
  // Passage waiting to be asked about (selection menu), shown above the field.
  const [passage, setPassage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [route, setRoute] = useState<AiRoute | null>(null);
  // Gemini Nano as the settings show it: Chrome's availability for the
  // reader's language, "missing" without the API, "aside" once set aside.
  const [nano, setNano] = useState<Availability | "missing" | "aside" | null>(null);
  // Whether this is a note page, decided after mount: reading `location`
  // while rendering would put the trigger in the client's first render but
  // not in the exported HTML, and that hydration mismatch makes React
  // re-render the whole page, the note's <main> included.
  const [onNote, setOnNote] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetSources, setSheetSources] = useState<ChatSource[]>([]);
  const [card, setCard] = useState<{
    front: string;
    back: string;
    writing: boolean;
    url: string;
    title: string;
  } | null>(null);
  const [dl, setDl] = useState<DlState>("idle");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [waitingModel, setWaitingModel] = useState(false);
  // The weights are already on the device: a load reads them, it doesn't
  // download them again (the progress says so).
  const [fromCache, setFromCache] = useState(false);
  const [toast, setToast] = useState("");
  const [storage, setStorage] = useState<{ free: number; used: number } | null>(
    null,
  );
  const [scopeMenu, setScopeMenu] = useState(false);
  const [dlLater, setDlLater] = useState(false);
  const [copied, setCopied] = useState(-1);
  const [canDictate, setCanDictate] = useState(false);
  const [listening, setListening] = useState(false);
  const [section, setSection] = useState<{ title: string; id: string } | null>(
    null,
  );
  const [wide, setWide] = useState(false);
  // --- desktop tools ---
  const [layout, setLayoutState] = useState<Layout>("overlay");
  const [docked, setDocked] = useState(false);
  const [dockable, setDockable] = useState(false);
  const [rail, setRail] = useState(false);
  const [railQuery, setRailQuery] = useState("");
  const [panelW, setPanelW] = useState(0);
  const [menu, setMenu] = useState<null | "more" | "attach">(null);
  const [attachNotes, setAttachNotes] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [noteIndex, setNoteIndex] = useState<NoteRef[] | null>(null);
  const [passageFrom, setPassageFrom] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [editing, setEditing] = useState(-1);
  const [editText, setEditText] = useState("");
  const [cite, setCite] = useState<{
    i: number;
    n: number;
    top: number;
    left: number;
    below: boolean;
  } | null>(null);
  const [, setMathTick] = useState(0);
  // The frame's page (« côte à côte »): its chat only forwards (lib/chat-dock.ts).
  const [passive, setPassive] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const citeTimer = useRef(0);
  /** The last text the reader selected in the page, for « + ». */
  const lastSel = useRef("");
  const layoutRef = useRef<Layout>("overlay");
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  /** A source to light up once the frame shows its note. */
  const pendingFlash = useRef<{ path: string; hash: string; excerpt?: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convRef = useRef(conv);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // A question asked before the reader agreed to the download, sent after.
  const pendingRef = useRef<(() => void) | null>(null);
  const sendRef = useRef<
    (text: string, opts?: { passage?: string; mode?: ChatMode }) => void
  >(() => {});
  const word = deviceWord();

  useEffect(() => {
    convRef.current = conv;
  }, [conv]);

  const store = () =>
    typeof localStorage === "undefined" ? null : localStorage;

  function persist(c: Conversation) {
    const s = store();
    if (!s || !c.messages.length) return;
    try {
      setChats(saveChat(s, c));
    } catch {
      /* storage blocked */
    }
  }

  function updateConv(fn: (c: Conversation) => Conversation, save = false) {
    const next = fn(convRef.current);
    convRef.current = next;
    setConv(next);
    if (save) persist(next);
  }

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast((t2) => (t2 === text ? "" : t2)), 3200);
  }

  // --- the download --------------------------------------------------------
  useEffect(() => onLoadProgress(setProgress), []);
  useEffect(() => {
    if (dl === "loading") void localModelCached().then(setFromCache);
  }, [dl]);

  /** The "couldn't answer" line, with the device model's own reason when it
   *  gave one (a load error, or the worker stopped, as for memory). */
  function noAnswer(r: AiRoute): string {
    if (r === "nano") {
      // Nano is now set aside for this tab: say why, and what comes next.
      const why = nanoSetAsideReason();
      if (!why) return tr("chat.errNoAnswer");
      return `${tr("chat.errNoAnswer")}\n\n${tr("chat.nanoFailed", {
        why: why === "echo" ? tr("chat.nanoEcho") : why,
      })}`;
    }
    const why = r === "local" ? localModelError() : "";
    return why ? `${tr("chat.errNoAnswer")}\n\n${tr("chat.errDevice", { why })}` : tr("chat.errNoAnswer");
  }

  function startDownload(then?: () => void) {
    setLocalModelEnabled(true);
    setRoute((r) => (r === "download" ? "local" : r));
    setDl("loading");
    setSheet(null);
    loadLocalModel().then((ok) => {
      setDl(ok ? "ready" : "failed");
      if (ok) {
        showToast(
          tr(word === "phone" ? "chat.dlReadyPhone" : "chat.dlReadyDevice"),
        );
        then?.();
      }
    });
  }

  async function openConfirm() {
    setStorage(await storageFree());
    setSheet("confirm");
  }

  async function refreshNano() {
    if (!("LanguageModel" in self)) return setNano("missing");
    if (nanoSetAsideReason()) return setNano("aside");
    setNano(await nanoAvailability(preferredLang()));
  }
  // --- opening -------------------------------------------------------------
  const refreshRoute = useCallback(async (questionLang = "") => {
    const r = await aiRoute(preferredLang(), questionLang);
    setRoute(r);
    if (r === "local" && localModelLoaded()) setDl("ready");
    return r;
  }, []);

  /** Open the chat; false (and the "not available here" sheet) when nothing
   *  on this device can answer. */
  async function openChat(): Promise<boolean> {
    const r = route ?? (await refreshRoute());
    if (r === "none") {
      setSheet("unsupported");
      return false;
    }
    setPage(readPage());
    setOpen(true);
    setView("chat");
    if (layoutRef.current === "dock") enterDock();
    return true;
  }

  function closeChat() {
    try {
      sessionStorage.removeItem(REOPEN_KEY);
    } catch {
      /* ignore */
    }
    setMenu(null);
    setCite(null);
    if (isDocked()) leaveDock(false);
    setOpen(false);
    setScopeMenu(false);
  }

  // --- layouts (from 640px) ------------------------------------------------
  function setLayout(l: Layout) {
    layoutRef.current = l;
    setLayoutState(l);
    lsSet(LAYOUT_KEY, l);
  }

  /** The page beside the chat, in a frame its exact width (lib/chat-dock.ts). */
  function enterDock() {
    if (isDocked() || !canDock()) return;
    dock({
      onPage: (win) => {
        const note = readPage();
        setPage(note);
        // A conversation not started yet follows the page being read.
        const c = convRef.current;
        if (!c.messages.length && c.note?.url !== note?.url) {
          updateConv((x) => ({
            ...x,
            note: note
              ? { title: note.title, url: note.url, discipline: note.discipline }
              : null,
            scope: note ? note.folder : x.scope,
          }));
        }
        win.addEventListener("keydown", (e) => onKeyRef.current(e));
        win.document.addEventListener("selectionchange", () =>
          noteSelection(win),
        );
        const f = pendingFlash.current;
        if (f && win.location.pathname === f.path) {
          pendingFlash.current = null;
          window.setTimeout(
            () => flashPassage(win.document, { hash: f.hash, excerpt: f.excerpt }),
            300,
          );
        }
      },
    });
    setDocked(true);
  }

  /** Back over the page. When the reader moved to another page meanwhile,
   *  that page is loaded up here (and the chat reopens on it if `keepOpen`). */
  function leaveDock(keepOpen: boolean) {
    if (!isDocked()) return;
    const c = convRef.current;
    const { url, moved } = undock();
    setDocked(false);
    document.documentElement.style.removeProperty("--gc-total");
    if (moved) {
      try {
        if (keepOpen) {
          persist(c);
          sessionStorage.setItem(REOPEN_KEY, c.messages.length ? c.id : "new");
        } else sessionStorage.removeItem(REOPEN_KEY);
      } catch {
        /* ignore */
      }
      location.replace(url);
      return;
    }
    setPage(readPage());
  }

  function toggleDock() {
    setMenu(null);
    if (isDocked()) {
      setLayout("overlay");
      leaveDock(true);
    } else {
      setLayout("dock");
      enterDock();
    }
  }

  function toggleWide() {
    setMenu(null);
    if (layoutRef.current === "wide") return setLayout("overlay");
    setLayout("wide");
    if (isDocked()) leaveDock(true);
  }

  function noteSelection(win: Window) {
    const sel = win.getSelection();
    const text = sel?.toString().trim() ?? "";
    const node = sel?.anchorNode;
    const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
    if (text.length > 2 && !el?.closest(".gc")) lastSel.current = text.slice(0, 4000);
  }

  function focusComposer() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function newConversation(mode: ChatMode = "answer", note = readPage()) {
    abortRef.current?.abort();
    let scope = "";
    try {
      scope = localStorage.getItem(SCOPE_KEY) ?? "";
    } catch {
      /* ignore */
    }
    const lang = scopes.find(
      (s) => note && note.url.startsWith(`/posts/${s.slug}/`),
    );
    if (lang) scope = lang.slug;
    else if (note) scope = note.folder;
    else if (!scopes.some((s) => s.slug === scope)) scope = "";
    const c = emptyConv(note, scope, mode);
    convRef.current = c;
    setConv(c);
    setPage(note);
    setInput("");
    setPassage("");
    setPassageFrom("");
    setEditing(-1);
    setRenaming(false);
    setCite(null);
    setBusy(false);
    setStatus("");
    setWaitingModel(false);
    setSection(null);
    setView("chat");
  }

  useEffect(() => {
    // In the frame beside the chat: forward everything to the chat up there.
    if (inDockFrame()) {
      setPassive(true);
      const top = window.parent as typeof window;
      const fwd = (e: Event) =>
        top.dispatchEvent(
          new top.CustomEvent(e.type, { detail: (e as CustomEvent).detail }),
        );
      const types = ["gk:pin-chat", "gk:explain", "gk:explain-own", "gk:chat-ask", "gk:ai-setup"];
      types.forEach((t2) => window.addEventListener(t2, fwd));
      setOnNote(location.pathname.startsWith("/posts/"));
      return () => types.forEach((t2) => window.removeEventListener(t2, fwd));
    }
    const s = store();
    if (s) setChats(loadChats(s));
    const l = lsGet(LAYOUT_KEY);
    layoutRef.current = l === "overlay" || l === "wide" ? l : "dock";
    setLayoutState(layoutRef.current);
    setRail(lsGet(RAIL_KEY) === "1");
    setPanelW(Number(lsGet(WIDTH_KEY)) || 0);
    setDockable(canDock());
    const onResize = () => {
      setDockable(canDock());
      if (isDocked() && !canDock()) leaveDock(true);
    };
    window.addEventListener("resize", onResize);
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener("keydown", onKey);
    const onSel = () => noteSelection(window);
    document.addEventListener("selectionchange", onSel);
    // The « Demander » bar of the page beside the chat.
    const onFocusAsk = () => {
      if (isDocked()) focusComposer();
    };
    window.addEventListener("gk:chat-focus", onFocusAsk);
    // Reopen what was open before a reload or leaving « côte à côte ».
    let reopen = "";
    try {
      reopen = sessionStorage.getItem(REOPEN_KEY) ?? "";
      sessionStorage.removeItem(REOPEN_KEY);
    } catch {
      /* ignore */
    }
    if (reopen) {
      void openChat().then((ok) => {
        if (!ok) return;
        const c = s ? loadChats(s).find((x) => x.id === reopen) : undefined;
        if (c) resume(c);
        else newConversation();
      });
    }
    try {
      setDlLater(sessionStorage.getItem(DL_LATER_KEY) === "1");
    } catch {
      /* ignore */
    }
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    setCanDictate(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    setOnNote(location.pathname.startsWith("/posts/"));
    const mq = window.matchMedia("(min-width: 640px)");
    const onMq = () => setWide(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    // No aiRoute() here: it asks for a WebGPU adapter, which can wake the GPU
    // on every page view. It runs when the chat (or its download sheet)
    // first opens; lib/local-llm.ts keeps the answer for the session.

    const passageOf = (e: Event) =>
      String((e as CustomEvent<{ text?: string }>).detail?.text ?? "")
        .trim()
        .slice(0, 4000);
    const onPin = async () => {
      if (await openChat()) newConversation();
    };
    const onExplain = async (e: Event) => {
      const text = passageOf(e);
      if (!text || !(await openChat())) return;
      newConversation("answer");
      sendRef.current("", { passage: text, mode: "answer" });
    };
    const onExplainOwn = async (e: Event) => {
      const text = passageOf(e);
      if (!text || !(await openChat())) return;
      newConversation("own");
      setPassage(text);
      setSection(sectionOf(text));
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    // detail: { question?, mode?, resume?: conversation id, view?: "history" }
    // (the desktop home's ask card: modes, "Reprendre", "Mes questions").
    const onAsk = async (e: Event) => {
      const d =
        (e as CustomEvent<{ question?: string; mode?: ChatMode; resume?: string; view?: "history" }>).detail ?? {};
      const q = String(d.question ?? "").trim();
      if (!(await openChat())) return;
      if (d.view === "history") {
        setView("history");
        return;
      }
      if (d.resume) {
        const s = store();
        const c = s ? loadChats(s).find((x) => x.id === d.resume) : undefined;
        if (c) {
          resume(c);
          return;
        }
      }
      newConversation(d.mode === "socratic" || d.mode === "own" ? d.mode : "answer", null);
      if (q) sendRef.current(q);
    };
    const onSetup = async () => {
      const r = await refreshRoute();
      if (r === "none") setSheet("unsupported");
      else if (r === "download") openConfirm();
    };
    window.addEventListener("gk:pin-chat", onPin);
    window.addEventListener("gk:explain", onExplain);
    window.addEventListener("gk:explain-own", onExplainOwn);
    window.addEventListener("gk:chat-ask", onAsk);
    window.addEventListener("gk:ai-setup", onSetup);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("selectionchange", onSel);
      window.removeEventListener("gk:chat-focus", onFocusAsk);
      mq.removeEventListener("change", onMq);
      window.removeEventListener("gk:pin-chat", onPin);
      window.removeEventListener("gk:explain", onExplain);
      window.removeEventListener("gk:explain-own", onExplainOwn);
      window.removeEventListener("gk:chat-ask", onAsk);
      window.removeEventListener("gk:ai-setup", onSetup);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Formulas: KaTeX arrives the first time an answer holds one.
  useEffect(() => {
    if (katexLib || busy) return;
    if (conv.messages.some((m) => m.role === "assistant" && hasMath(m.text)))
      void loadKatex()
        .then(() => setMathTick((n) => n + 1))
        .catch(() => {});
  }, [conv, busy]);

  // Beside the page: a reload brings the same conversation back.
  useEffect(() => {
    if (!docked || !open) return;
    try {
      sessionStorage.setItem(REOPEN_KEY, conv.messages.length ? conv.id : "new");
    } catch {
      /* ignore */
    }
  }, [docked, open, conv.id, conv.messages.length]);

  // The frame takes exactly the room the panel leaves.
  useEffect(() => {
    const el = sectionRef.current;
    if (!docked || !open || !el) return;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty(
        "--gc-total",
        `${Math.round(el.getBoundingClientRect().width)}px`,
      ),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [docked, open]);

  // A menu closes on a click elsewhere.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      const t2 = e.target as Element | null;
      if (!t2?.closest?.(".gc-menu, .gc-menu-btn")) {
        setMenu(null);
        setAttachNotes(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu]);

  // Phones: the page under the chat doesn't scroll.
  useEffect(() => {
    if (!open || wide) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open, wide]);

  // Follow the answer while it is written.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && busy) el.scrollTop = el.scrollHeight;
  }, [conv, busy, status]);

  function preferredLang(): string {
    try {
      const saved = localStorage.getItem("locale");
      if (saved) return saved.slice(0, 2);
    } catch {
      /* ignore */
    }
    return (navigator.language || "fr").slice(0, 2).toLowerCase();
  }

  // --- asking --------------------------------------------------------------
  function history(c: Conversation): ChatTurn[] {
    return c.messages
      .filter((m) => m.text.trim())
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text.slice(0, 1500) }));
  }

  async function send(
    text: string,
    opts: {
      passage?: string;
      passageFrom?: string;
      mode?: ChatMode;
      regenerate?: boolean;
    } = {},
  ) {
    const c0 = convRef.current;
    const mode = opts.mode ?? c0.mode;
    const pass = opts.passage ?? passage;
    const from = opts.passageFrom ?? (opts.passage === undefined ? passageFrom : "");
    if (busy || (!text.trim() && !pass)) return;
    // Still inside the click: Chrome only starts Gemini Nano's first
    // download from a user activation, which detection and retrieval below
    // can outlast.
    if (route === "nano") warmNano(preferredLang());
    const lang = replyLangHint(
      (await detectLanguage(text || pass, { allowDownload: true })) ?? "",
    );
    const r = await refreshRoute(lang);
    if (r === "none") {
      setSheet("unsupported");
      return;
    }
    if (r === "download") {
      // Asked before agreeing to the download: ask for it, then send.
      pendingRef.current = () => send(text, opts);
      openConfirm();
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const question = text.trim();
    const title =
      c0.title ||
      (mode === "own"
        ? tr("chat.modeOwn")
        : question
          ? chatTitle(question, tr("chat.explainTitle"))
          : tr("chat.explainTitle"));
    const prior = history(c0);
    if (!opts.regenerate) {
      updateConv((c) => ({
        ...c,
        mode,
        title,
        updated: Date.now(),
        messages: [
          ...c.messages,
          {
            role: "user",
            text: question || (mode === "own" ? "" : tr("chat.explainDefault")),
            ...(pass ? { passage: pass } : {}),
            ...(pass && from ? { passageFrom: from } : {}),
          },
        ],
      }));
    }
    setInput("");
    setPassage("");
    setPassageFrom("");
    setBusy(true);
    setStatus(mode === "own" ? tr("chat.writing") : tr("chat.searching"));
    const via: ChatMessage["via"] =
      r === "nano" ? "nano" : r === "local" ? "local" : "server";
    updateConv((c) => ({
      ...c,
      messages: [
        ...c.messages,
        {
          role: "assistant",
          text: "",
          via,
          ...(mode === "own" ? { own: true } : {}),
        },
      ],
    }));
    const setLast = (patch: Partial<ChatMessage>) =>
      updateConv((c) => {
        const msgs = [...c.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...patch };
        return { ...c, messages: msgs };
      });

    let system = "";
    let prompt = "";
    if (mode === "own") {
      system = explainSystemDevice(lang);
      prompt = explainUser(
        pass || lastPassage(c0),
        question,
        c0.note?.title ?? "",
      );
    } else {
      // Retrieval on the server, writing here.
      try {
        const resp = await fetch("/api/ask/context", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: question || tr("chat.explainDefault"),
            selection: pass || undefined,
            locale: preferredLang(),
            scope: c0.scope || undefined,
            lang: lang || undefined,
            socratic: mode === "socratic" || undefined,
          }),
          signal: ctrl.signal,
        });
        if (!resp.ok) {
          setLast({
            text: tr(resp.status === 429 ? "chat.errRate" : "chat.errContext"),
          });
          return finish(ctrl, false);
        }
        const ctx = (await resp.json()) as {
          system: string;
          user: string;
          sources: ChatSource[];
        };
        const sources = (ctx.sources ?? []).filter(
          (s) => s && s.url && /^\/(?!\/)/.test(s.url),
        );
        system = ctx.system;
        prompt = ctx.user;
        setLast({ sources });
        setStatus(
          sources.length > 1
            ? tr("chat.reading", {
                n: sources.length,
                titles: sources
                  .slice(0, 3)
                  .map((s) => s.title)
                  .join(", "),
              })
            : sources.length === 1
              ? tr("chat.readingOne", { title: sources[0].title })
              : tr("chat.writing"),
        );
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setLast({ text: tr("chat.errContext") });
        return finish(ctrl, false);
      }
    }
    if (mode === "socratic" && !system.includes("SOCRATIQUE"))
      system += `\n${SOCRATIC_RULES}`;

    if (r === "server" && SERVER_LLM_OFFERED) {
      await askServer(ctrl, question, pass, lang, mode, setLast);
      return finish(ctrl, true);
    }
    if (r === "local" && !localModelLoaded()) {
      setWaitingModel(true);
      setDl("loading");
    }
    try {
      const out = await generateOnDevice({
        route: r === "nano" ? "nano" : "local",
        system,
        prompt,
        history: prior,
        lang: lang || preferredLang(),
        fallbackLang: preferredLang(),
        signal: ctrl.signal,
        onDownload: (f) =>
          setStatus(
            f < 1
              ? tr("chat.nanoDownloading", { pct: Math.floor(f * 100) })
              : tr("chat.writing"),
          ),
        onText: (t2) => {
          setWaitingModel(false);
          setStatus("");
          setLast({ text: t2 });
        },
      });
      setWaitingModel(false);
      if (r === "local") setDl(localModelLoaded() ? "ready" : "failed");
      setLast(out ? { text: out } : { text: noAnswer(r) });
      finish(ctrl, !!out);
      // Nano may have just been set aside (it echoed its prompt): the
      // next question takes the next route, or offers the download.
      if (r === "nano") void refreshRoute();
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setWaitingModel(false);
        return finish(ctrl, true);
      }
      setLast({ text: noAnswer(r) });
      finish(ctrl, false);
    }
  }
  sendRef.current = (text, opts) => void send(text, opts);

  function lastPassage(c: Conversation): string {
    for (let i = c.messages.length - 1; i >= 0; i--)
      if (c.messages[i].passage) return c.messages[i].passage!;
    return "";
  }

  function finish(ctrl: AbortController, save: boolean) {
    setBusy(false);
    setStatus("");
    if (abortRef.current === ctrl) abortRef.current = null;
    updateConv((c) => ({ ...c, updated: Date.now() }), save);
  }

  // The server's own LLM (Claude / an OpenAI-compatible backend). Not
  // offered while SERVER_LLM_OFFERED is false; kept for when it is.
  async function askServer(
    ctrl: AbortController,
    question: string,
    pass: string,
    lang: string,
    mode: ChatMode,
    setLast: (p: Partial<ChatMessage>) => void,
  ) {
    try {
      const resp = await fetch(
        mode === "own" ? "/api/ask/explain" : "/api/ask",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            mode === "own"
              ? {
                  passage: pass,
                  explanation: question,
                  title: convRef.current.note?.title,
                  lang: lang || undefined,
                }
              : {
                  question,
                  selection: pass || undefined,
                  locale: preferredLang(),
                  scope: convRef.current.scope || undefined,
                  lang: lang || undefined,
                  socratic: mode === "socratic" || undefined,
                },
          ),
          signal: ctrl.signal,
        },
      );
      if (!resp.ok || !resp.body)
        return setLast({ text: tr("chat.errNoAnswer") });
      await readAskStream(resp.body, {
        onSources: (s) =>
          setLast({
            sources: s.filter((x) => x?.url && x.title) as ChatSource[],
          }),
        onChunk: (t2) => {
          setStatus("");
          setLast({ text: t2 });
        },
        partialError: tr("chat.errNoAnswer"),
      });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError")
        setLast({ text: tr("chat.errNoAnswer") });
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function regenerate() {
    const c = convRef.current;
    const lastUser = [...c.messages].reverse().find((m) => m.role === "user");
    if (!lastUser || busy) return;
    updateConv((x) => ({ ...x, messages: x.messages.slice(0, -1) }));
    void send(
      lastUser.text === tr("chat.explainDefault") ? "" : lastUser.text,
      {
        passage: lastUser.passage ?? "",
        regenerate: true,
      },
    );
  }

  // --- actions under an answer ---------------------------------------------
  async function copy(i: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      window.setTimeout(() => setCopied(-1), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  function rate(i: number, v: 1 | -1) {
    updateConv((c) => {
      const msgs = [...c.messages];
      msgs[i] = { ...msgs[i], rating: msgs[i].rating === v ? undefined : v };
      return { ...c, messages: msgs };
    }, true);
  }

  function speak(text: string) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>]/g, ""));
      u.lang = locale === "fr" ? "fr-FR" : locale;
      speechSynthesis.speak(u);
    } catch {
      /* no speech synthesis */
    }
  }

  async function makeCard(i: number) {
    const c = convRef.current;
    const answer = c.messages[i]?.text ?? "";
    const question = c.messages
      .slice(0, i)
      .reverse()
      .find((m) => m.role === "user");
    const target =
      c.note ??
      (c.messages[i].sources?.[0]
        ? {
            title: c.messages[i].sources![0].title,
            url: c.messages[i].sources![0].url,
          }
        : null);
    if (!answer || !target) return;
    const r = await refreshRoute();
    if (r !== "nano" && r !== "local") return;
    setCard({
      front: "",
      back: "",
      writing: true,
      url: target.url,
      title: target.title,
    });
    setSheet("card");
    try {
      const out = await generateOnDevice({
        route: r,
        system: cardSystem(replyLangHint(preferredLang())),
        prompt: `${question?.text ? `Question : ${question.text}\n\n` : ""}Explication :\n${answer}`,
        lang: preferredLang(),
        maxTokens: 300,
      });
      const parsed = out ? parseCard(out) : null;
      setCard(
        (cd) =>
          cd && {
            ...cd,
            writing: false,
            front: parsed?.front ?? question?.text ?? "",
            back: parsed?.back ?? answer.slice(0, 600),
          },
      );
    } catch {
      setCard(
        (cd) =>
          cd && {
            ...cd,
            writing: false,
            front: question?.text ?? "",
            back: answer.slice(0, 600),
          },
      );
    }
  }

  function addCard() {
    if (!card || !card.front.trim() || !card.back.trim()) return;
    const slug = noteSlugFromPath(card.url);
    if (!slug) return;
    try {
      const deck = loadNoteDeck(localStorage, slug);
      const next = addQuestion(
        deck,
        `chat-${newId()}`,
        {
          q: escapeHtml(card.front.trim()),
          a: escapeHtml(card.back.trim()),
          url: card.url,
          title: card.title,
        },
        null,
      );
      saveNoteDeck(localStorage, slug, next);
      window.dispatchEvent(
        new CustomEvent("gk:activity", { detail: { kind: "card" } }),
      );
    } catch {
      /* storage blocked */
    }
    setSheet(null);
    setCard(null);
    showToast(tr("chat.cardAdded"));
  }

  // --- dictation -----------------------------------------------------------
  function dictate() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = locale === "fr" ? "fr-FR" : locale;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const said = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput(said);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  function chooseScope(value: string) {
    updateConv((c) => ({ ...c, scope: value }));
    setScopeMenu(false);
    try {
      localStorage.setItem(SCOPE_KEY, value);
    } catch {
      /* ignore */
    }
  }

  function resume(c: Conversation) {
    abortRef.current?.abort();
    convRef.current = c;
    setConv(c);
    setBusy(false);
    setStatus("");
    setEditing(-1);
    setRenaming(false);
    setCite(null);
    setView("chat");
  }

  // --- the ⋯ menu ----------------------------------------------------------
  const exportLabels = () => ({
    me: tr("chat.exportMe"),
    garden: tr("chat.title"),
    note: tr("chat.exportNote"),
    passage: tr("chat.exportPassage"),
    sources: tr("chat.sourcesTitle"),
  });

  async function copyMarkdown() {
    setMenu(null);
    try {
      await navigator.clipboard.writeText(
        conversationMarkdown(convRef.current, exportLabels(), location.origin),
      );
      showToast(tr("chat.exportCopied"));
    } catch {
      /* clipboard blocked */
    }
  }

  function downloadMarkdown() {
    setMenu(null);
    const c = convRef.current;
    const blob = new Blob([conversationMarkdown(c, exportLabels(), location.origin)], {
      type: "text/markdown;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = exportFileName(c.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function startRename() {
    setMenu(null);
    setRenameText(convRef.current.title);
    setRenaming(true);
  }

  function commitRename() {
    const title = renameText.replace(/\s+/g, " ").trim().slice(0, 200);
    setRenaming(false);
    if (title && title !== convRef.current.title)
      updateConv((c) => ({ ...c, title }), true);
  }

  function togglePin() {
    setMenu(null);
    const pinned = !convRef.current.pinned;
    updateConv((c) => ({ ...c, pinned: pinned || undefined }), true);
    showToast(tr(pinned ? "chat.pinned" : "chat.unpinned"));
  }

  function deleteCurrent() {
    setMenu(null);
    const s2 = store();
    if (s2) setChats(deleteChat(s2, convRef.current.id));
    newConversation();
    showToast(tr("chat.convDeleted"));
  }

  // --- editing a question ----------------------------------------------------
  function startEdit(i: number) {
    const m = convRef.current.messages[i];
    if (!m || m.role !== "user" || busy) return;
    setEditing(i);
    setEditText(m.text === tr("chat.explainDefault") ? "" : m.text);
  }

  /** Send the edited question in place of the old one and what followed. */
  function submitEdit() {
    const i = editing;
    const m = convRef.current.messages[i];
    if (!m || busy) return;
    const text = editText.trim();
    if (!text && !m.passage) return;
    updateConv((c) => ({ ...c, messages: c.messages.slice(0, i) }));
    setEditing(-1);
    void send(text, { passage: m.passage ?? "", passageFrom: m.passageFrom ?? "" });
  }

  // --- « + »: attach the section on screen, the selection, a note ------------
  function attachSection() {
    setMenu(null);
    const sec = visibleSection(pageDoc(), pageWindow());
    if (!sec) return;
    setPassage(sec.text);
    setPassageFrom(tr("chat.fromSection", { title: sec.title }));
    focusComposer();
  }

  function attachSelection() {
    setMenu(null);
    if (!lastSel.current) return;
    setPassage(lastSel.current);
    setPassageFrom("");
    focusComposer();
  }

  function openNotePicker() {
    setAttachNotes(true);
    setNoteQuery("");
    if (noteIndex) return;
    const v = document
      .querySelector('meta[name="gk-notes-index"]')
      ?.getAttribute("content");
    fetch(`/notes-index.json${v ? `?v=${encodeURIComponent(v)}` : ""}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) =>
        setNoteIndex(
          Array.isArray(list)
            ? (list as NoteRef[]).filter(
                (x) =>
                  x &&
                  typeof x.title === "string" &&
                  typeof x.href === "string" &&
                  /^\/(?!\/)/.test(x.href),
              )
            : [],
        ),
      )
      .catch(() => setNoteIndex([]));
  }

  async function attachNote(n: NoteRef) {
    setMenu(null);
    setAttachNotes(false);
    try {
      const r = await fetch(n.href);
      const text = r.ok ? noteTextFromHtml(await r.text()) : "";
      if (text) {
        setPassage(text);
        setPassageFrom(tr("chat.fromNote", { title: n.title }));
      }
    } catch {
      /* offline */
    }
    focusComposer();
  }

  // --- sources in the text ----------------------------------------------------
  function citeHtml(sources: ChatSource[]) {
    return (n: number) => {
      const s2 = sources[n - 1];
      if (!s2) return null;
      return `<button type="button" class="gc-cite" data-n="${n}" style="background:${
        SRC_COLORS[(n - 1) % SRC_COLORS.length]
      }" aria-label="${escapeHtml(tr("chat.citeAria", { n, title: s2.title }))}">${n}</button>`;
    };
  }

  function openCite(b: HTMLElement) {
    const wrap = b.closest<HTMLElement>("[data-i]");
    const main = mainRef.current;
    if (!wrap || !main) return;
    window.clearTimeout(citeTimer.current);
    const r = b.getBoundingClientRect();
    const mr = main.getBoundingClientRect();
    const below = r.top - mr.top < 220;
    setCite({
      i: Number(wrap.dataset.i),
      n: Number(b.dataset.n),
      top: below ? r.bottom - mr.top + 8 : mr.bottom - r.top + 8,
      left: Math.max(12, Math.min(r.left - mr.left - 140, mr.width - 12 - 304)),
      below,
    });
  }

  function closeCiteSoon() {
    window.clearTimeout(citeTimer.current);
    citeTimer.current = window.setTimeout(() => setCite(null), 260);
  }

  /** Find a cited passage in the page: this page lights it up, another one
   *  opens beside the chat (« côte à côte ») or in place of this page. */
  function showSource(src: ChatSource) {
    setCite(null);
    let u: URL;
    try {
      u = new URL(src.url, location.origin);
    } catch {
      return;
    }
    if (u.origin !== location.origin) return;
    if (u.pathname === pageWindow().location.pathname) {
      // On a phone the chat covers the page: close it first.
      if (!wide) closeChat();
      window.setTimeout(() => {
        if (!flashPassage(pageDoc(), { hash: u.hash, excerpt: src.excerpt }) && u.hash)
          pageWindow().location.hash = u.hash;
      }, wide ? 0 : 60);
      return;
    }
    if (isDocked()) {
      pendingFlash.current = { path: u.pathname, hash: u.hash, excerpt: src.excerpt };
      navigatePage(u.pathname + u.hash);
    } else location.assign(u.pathname + u.search + u.hash);
  }

  // --- the panel's width (drag its edge) --------------------------------------
  function startResize(e: React.PointerEvent) {
    const main = mainRef.current;
    if (!main || layoutRef.current === "wide") return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = main.getBoundingClientRect().width;
    let w = w0;
    const max = () => window.innerWidth - (isDocked() ? 600 : 120);
    const move = (ev: PointerEvent) => {
      w = Math.round(Math.max(360, Math.min(max(), w0 + x0 - ev.clientX)));
      setPanelW(w);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.documentElement.classList.remove("gc-resizing");
      lsSet(WIDTH_KEY, String(w));
    };
    document.documentElement.classList.add("gc-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function toggleRail() {
    const next = !rail;
    setRail(next);
    lsSet(RAIL_KEY, next ? "1" : "");
  }

  // --- keyboard -------------------------------------------------------------
  onKeyRef.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && !e.altKey && k === "j") {
      e.preventDefault();
      if (open) closeChat();
      else void openChat().then((ok) => ok && focusComposer());
      return;
    }
    if (mod && e.shiftKey && !e.altKey && k === "o") {
      e.preventDefault();
      void (open ? Promise.resolve(true) : openChat()).then((ok) => {
        if (!ok) return;
        newConversation();
        focusComposer();
      });
      return;
    }
    if (mod && !e.altKey && (e.code === "Backslash" || e.key === "\\")) {
      if (!canDock()) return;
      e.preventDefault();
      if (open) toggleDock();
      else {
        setLayout("dock");
        void openChat();
      }
      return;
    }
    if (e.key === "Escape" && open) {
      if (cite || menu || renaming || editing >= 0 || scopeMenu || sheet) {
        e.preventDefault();
        setCite(null);
        setMenu(null);
        setRenaming(false);
        setEditing(-1);
        setScopeMenu(false);
        setSheet(null);
        return;
      }
      // Beside the page, closing would reload it: Échap only leaves the field.
      if (isDocked()) (document.activeElement as HTMLElement | null)?.blur();
      else if (wide) closeChat();
    }
  };

  // --- rendering -----------------------------------------------------------
  const model = localModel();
  const gb = model.gb.toLocaleString(locale);
  const msgs = conv.messages;
  const started = msgs.length > 0;
  const noteTitle = conv.note?.title ?? page?.title ?? "";
  const scopeLabel = (() => {
    if (!conv.scope) return tr("chat.scopeAll");
    if (page && conv.scope === page.folder) return tr("chat.scopeNote");
    return (
      scopes.find((s) => s.slug === conv.scope)?.label ?? tr("chat.scopeNote")
    );
  })();
  const hour = new Date().getHours();
  const greet = tr(
    hour >= 18 || hour < 5 ? "chat.greetEvening" : "chat.greetMorning",
  );
  const recent = chats.slice(0, 3);
  const showDlCard = route === "download" && dl === "idle" && !dlLater;
  const lastIdx = msgs.length - 1;

  const pct =
    progress && progress.total
      ? Math.min(100, Math.round((100 * progress.loaded) / progress.total))
      : 0;
  const progressCard = (
    <div className="gc-prog">
      <div className="gc-prog-r1">
        <span className="gc-prog-ic">{Ic.dl}</span>
        <b>
          {tr(
            fromCache || pct >= 100 || (progress && progress.total < model.bytes / 2)
              ? "chat.dlLoading"
              : "chat.dlProgress",
          )}
        </b>
        <span className="gc-prog-pct">{pct} %</span>
      </div>
      <div className="gc-prog-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="gc-prog-r2">
        <span>
          {progress
            ? tr("chat.dlBytes", {
                a: fmtMb(progress.loaded, locale),
                b: fmtMb(progress.total, locale),
              })
            : "…"}
        </span>
        <button
          type="button"
          onClick={() => {
            stop();
            setLocalModelEnabled(false);
            setDl("idle");
            setWaitingModel(false);
            setRoute("download");
          }}
        >
          {tr("chat.dlCancel")}
        </button>
      </div>
    </div>
  );

  const deviceBadge = (via?: ChatMessage["via"]) => (
    <span className="gc-badge">
      {Ic.chip}
      {tr(
        via === "server"
          ? "chat.byServer"
          : word === "phone"
            ? "chat.byPhone"
            : "chat.byDevice",
      )}
    </span>
  );

  /** A real answer, not one of the chat's own error lines. */
  const answered = (m: ChatMessage) =>
    !m.text.startsWith(tr("chat.errNoAnswer")) &&
    m.text !== tr("chat.errContext") &&
    m.text !== tr("chat.errRate");

  function renderAssistant(m: ChatMessage, i: number) {
    const last = i === lastIdx;
    const writing = last && busy;
    const fb = m.own && !writing ? parseExplainFeedback(m.text) : null;
    const sources = m.sources ?? [];
    return (
      <div className="gc-ai-wrap" key={i} data-i={i}>
        {writing && status && !m.text && (
          <p className="gc-status">
            <span className="gc-shine">{status}</span>
          </p>
        )}
        {writing && waitingModel && (
          <>
            {progressCard}
            <p className="gc-wait">
              <span className="gc-typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {tr("chat.dlWait")}
            </p>
            <p className="gc-fine gc-fine-left">{tr("chat.dlTab")}</p>
          </>
        )}
        {(m.text || !writing) && m.text && deviceBadge(m.via)}
        {fb ? (
          <div className="gc-fb">
            {fb.ok && (
              <div className="gc-fb-ok">
                <b>
                  {Ic.check}
                  {tr("chat.ownOk")}
                </b>
                <div
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(fb.ok) }}
                />
              </div>
            )}
            {fb.missing && (
              <div className="gc-fb-miss">
                <b>
                  {Ic.q}
                  {tr("chat.ownMissing")}
                </b>
                <div
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(fb.missing),
                  }}
                />
              </div>
            )}
            {section && last && (
              <a
                className="gc-fb-go"
                href={`#${section.id}`}
                onClick={(e) => {
                  if (!isDocked()) return closeChat();
                  e.preventDefault();
                  pageDoc()
                    .getElementById(section.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {tr("chat.ownReread", { section: section.title })}
                {Ic.chev}
              </a>
            )}
          </div>
        ) : writing ? (
          m.text ? (
            <p className="gc-ai gc-ai-live" aria-live="off">
              {m.text}
              <span className="gc-cur" aria-hidden="true" />
            </p>
          ) : null
        ) : (
          <div
            className="gc-ai"
            aria-live="polite"
            dangerouslySetInnerHTML={{
              __html: markdownToHtml(m.text, {
                math: katexLib ? katexMath : undefined,
                cite: citeHtml(sources),
              }),
            }}
          />
        )}
        {!writing && sources.length > 0 && (
          <button
            type="button"
            className="gc-srcbtn"
            onClick={() => {
              setSheetSources(sources);
              setSheet("sources");
            }}
          >
            <span className="gc-dots" aria-hidden="true">
              {sources.slice(0, 3).map((s, k) => (
                <b
                  key={s.url}
                  style={{ background: SRC_COLORS[k % SRC_COLORS.length] }}
                >
                  {k + 1}
                </b>
              ))}
            </span>
            {sources.length === 1
              ? tr("chat.sources1")
              : tr("chat.sourcesN", { n: sources.length })}
          </button>
        )}
        {!writing && m.text && !fb && (
          <div className="gc-acts">
            <button
              type="button"
              onClick={() => copy(i, m.text)}
              aria-label={tr("chat.copy")}
              title={copied === i ? tr("chat.copied") : tr("chat.copy")}
            >
              {copied === i ? Ic.check : Ic.copy}
            </button>
            <button
              type="button"
              className={m.rating === 1 ? "on" : ""}
              onClick={() => rate(i, 1)}
              aria-label={tr("chat.like")}
              aria-pressed={m.rating === 1}
            >
              {Ic.thumb}
            </button>
            <button
              type="button"
              className={`gc-down${m.rating === -1 ? " on" : ""}`}
              onClick={() => rate(i, -1)}
              aria-label={tr("chat.dislike")}
              aria-pressed={m.rating === -1}
            >
              {Ic.thumb}
            </button>
            <button
              type="button"
              onClick={() => speak(m.text)}
              aria-label={tr("chat.listen")}
            >
              {Ic.speak}
            </button>
            {last && (
              <button
                type="button"
                onClick={regenerate}
                aria-label={tr("chat.retry")}
              >
                {Ic.redo}
              </button>
            )}
            {(conv.note || sources.length > 0) && (
              <button
                type="button"
                onClick={() => makeCard(i)}
                aria-label={tr("chat.makeCard")}
                title={tr("chat.makeCard")}
              >
                {Ic.cards}
              </button>
            )}
          </div>
        )}
        {last && !busy && m.text && conv.mode === "answer" && !m.own && answered(m) && (
          <div className="gc-chips gc-next">
            <button type="button" onClick={() => send(tr("chat.nextExampleQ"))}>
              {Ic.arrow}
              {tr("chat.nextExample")}
            </button>
            {(() => {
              const q = msgs.slice(0, i).reverse().find((x) => x.role === "user");
              const sec = nextSection(q?.text ?? "", sources);
              return sec ? (
                <button
                  type="button"
                  onClick={() => send(tr("chat.nextSectionQ", { s: sec }))}
                >
                  {Ic.arrow}
                  {tr("chat.nextSection", { s: sec })}
                </button>
              ) : null;
            })()}
            <button
              type="button"
              onClick={() => {
                updateConv((c) => ({ ...c, mode: "socratic" }));
                send(tr("chat.nextQuizQ"), { mode: "socratic", passage: "" });
              }}
            >
              {Ic.arrow}
              {tr("chat.nextQuiz")}
            </button>
          </div>
        )}
        {last && !busy && m.text && conv.mode === "socratic" && (
          <div className="gc-chips">
            {["chat.socDontKnow", "chat.socHint", "chat.socAnswer"].map((k) => (
              <button key={k} type="button" onClick={() => send(tr(k))}>
                {tr(k)}
              </button>
            ))}
          </div>
        )}
        {last && !busy && m.own && m.text && (
          <div className="gc-chips">
            <button
              type="button"
              onClick={() => {
                setPassage(lastPassage(conv));
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              {tr("chat.ownRetry")}
            </button>
            <button
              type="button"
              onClick={() => {
                const p = lastPassage(conv);
                updateConv((c) => ({ ...c, mode: "socratic" }));
                send(tr("chat.socStart"), { passage: p, mode: "socratic" });
              }}
            >
              {tr("chat.ownToSocratic")}
            </button>
            {conv.note && (
              <button type="button" onClick={() => makeCard(i)}>
                {tr("chat.makeCard")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const modes = (
    <div className="gc-modes" role="tablist" aria-label={tr("chat.modesAria")}>
      {(
        [
          ["answer", "chat.modeAnswer"],
          ["socratic", "chat.modeSocratic"],
          ["own", "chat.modeOwn"],
        ] as const
      ).map(([m, k]) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={conv.mode === m}
          className={conv.mode === m ? "on" : ""}
          disabled={busy || (m === "own" && !passage && !lastPassage(conv))}
          onClick={() => updateConv((c) => ({ ...c, mode: m }))}
        >
          {tr(k)}
        </button>
      ))}
    </div>
  );

  const canSend = !!(input.trim() || (passage && conv.mode !== "own"));
  const notesFound = noteIndex
    ? searchNotes(noteIndex, noteQuery, page?.url ?? "")
    : [];
  const plusBtn = (
    <button
      type="button"
      className={menu === "attach" ? "gc-plus gc-menu-btn on" : "gc-plus gc-menu-btn"}
      aria-label={tr("chat.attach")}
      title={tr("chat.attach")}
      aria-expanded={menu === "attach"}
      // Keep the page's selection: no focus change on press.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        setAttachNotes(false);
        setMenu(menu === "attach" ? null : "attach");
      }}
    >
      {Ic.plus}
    </button>
  );
  const attachMenu = menu === "attach" && (
    <div className="gc-menu gc-attach" role="menu">
      {attachNotes ? (
        <>
          <input
            className="gc-menu-find"
            autoFocus
            value={noteQuery}
            placeholder={tr("chat.attachFind")}
            aria-label={tr("chat.attachFind")}
            onChange={(e) => setNoteQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && notesFound[0]) {
                e.preventDefault();
                void attachNote(notesFound[0]);
              }
            }}
          />
          <div className="gc-menu-list">
            {noteIndex === null ? (
              <p className="gc-menu-empty">…</p>
            ) : notesFound.length ? (
              notesFound.map((n) => (
                <button
                  key={n.href}
                  type="button"
                  role="menuitem"
                  onClick={() => void attachNote(n)}
                >
                  {Ic.doc}
                  <span>
                    {n.title}
                    {n.folder && <small>{n.folder}</small>}
                  </span>
                </button>
              ))
            ) : (
              <p className="gc-menu-empty">{tr("chat.attachNone")}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p>{tr("chat.attach")}</p>
          {page && (
            <button
              type="button"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={attachSection}
            >
              {Ic.sec}
              <span>{tr("chat.attachSection")}</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={!lastSel.current}
            onMouseDown={(e) => e.preventDefault()}
            onClick={attachSelection}
          >
            {Ic.sel}
            <span>
              {tr("chat.attachSelection")}
              {lastSel.current && (
                <small>
                  « {lastSel.current.length > 50 ? `${lastSel.current.slice(0, 50)}…` : lastSel.current} »
                </small>
              )}
            </span>
          </button>
          <button type="button" role="menuitem" onClick={openNotePicker}>
            {Ic.doc}
            <span>{tr("chat.attachNote")}</span>
            <kbd>@</kbd>
          </button>
        </>
      )}
    </div>
  );
  const composer = (
    <form
      className={started ? "gc-comp gc-comp-pill" : "gc-comp"}
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return stop();
        if (canSend) send(input);
      }}
    >
      {attachMenu}
      {passage && (
        <div className="gc-pin">
          <span>
            {passageFrom && <b className="gc-pin-from">{passageFrom}</b>}
            {passage.length > 140 ? `${passage.slice(0, 140)}…` : passage}
          </span>
          <button
            type="button"
            onClick={() => {
              setPassage("");
              setPassageFrom("");
            }}
            aria-label={tr("chat.removePassage")}
          >
            ×
          </button>
        </div>
      )}
      {started && plusBtn}
      <textarea
        ref={inputRef}
        rows={1}
        value={input}
        maxLength={1000}
        onChange={(e) => {
          // « @ » alone: pick a note to attach.
          if (e.target.value === "@" && !input) {
            setInput("");
            setMenu("attach");
            openNotePicker();
            return;
          }
          setInput(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && !input && started && !busy) {
            const last = msgs.map((m) => m.role).lastIndexOf("user");
            if (last >= 0) {
              e.preventDefault();
              startEdit(last);
            }
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={tr(
          conv.mode === "own"
            ? "chat.placeholderOwn"
            : started
              ? "chat.placeholderShort"
              : "chat.placeholder",
        )}
        aria-label={tr("chat.placeholderShort")}
      />
      <div className="gc-comp-row">
        {!started && plusBtn}
        {!started && noteTitle && conv.note && (
          <span className="gc-ctx">
            {Ic.doc}
            <span>{noteTitle}</span>
            <button
              type="button"
              aria-label={tr("chat.removeNote")}
              onClick={() =>
                updateConv((c) => ({ ...c, note: null, scope: "" }))
              }
            >
              ×
            </button>
          </span>
        )}
        <span className="gc-sp" />
        {canDictate && (
          <button
            type="button"
            className={listening ? "gc-mic on" : "gc-mic"}
            onClick={dictate}
            aria-label={tr("chat.dictate")}
          >
            {Ic.mic}
          </button>
        )}
        <button
          type="submit"
          className={busy ? "gc-stop" : canSend ? "gc-send" : "gc-send off"}
          aria-label={tr(busy ? "chat.stop" : "chat.send")}
        >
          {busy ? <i /> : Ic.up}
        </button>
      </div>
    </form>
  );

  const dlCard = (
    <div className="gc-dl">
      <div className="gc-dl-hd">
        <span className="gc-dl-ic">{Ic.chip}</span>
        <div>
          <b>
            {tr(word === "phone" ? "chat.dlTitlePhone" : "chat.dlTitleDevice")}
          </b>
          <p>{tr("chat.dlText")}</p>
        </div>
      </div>
      <div className="gc-facts">
        <div>
          {Ic.dl}
          <span>
            <strong>{gb} Go</strong> {tr("chat.dlOnce")}
          </span>
        </div>
        <div>
          {Ic.wifi}
          <span>{tr("chat.dlWifi")}</span>
        </div>
        <div>
          {Ic.disk}
          <span>{tr("chat.dlKeep")}</span>
        </div>
      </div>
      <div className="gc-btns">
        <button type="button" className="gc-btn pri" onClick={openConfirm}>
          {tr("chat.dlGo", { n: gb })}
        </button>
        <button
          type="button"
          className="gc-btn lnk"
          onClick={() => {
            setDlLater(true);
            try {
              sessionStorage.setItem(DL_LATER_KEY, "1");
            } catch {
              /* ignore */
            }
          }}
        >
          {tr("chat.dlLater")}
        </button>
      </div>
    </div>
  );

  const home = (
    <div className="gc-home">
      <div className="gc-hello">
        <span className="gc-logo">{Ic.sprout}</span>
        <h1>{greet}</h1>
        <p>
          {noteTitle && conv.note
            ? tr("chat.subNote", { note: noteTitle })
            : tr("chat.subAll")}
        </p>
      </div>
      {showDlCard ? (
        dlCard
      ) : dl === "loading" && route !== "nano" ? (
        <div className="gc-home-prog">{progressCard}</div>
      ) : (
        <>
          {recent.length > 0 && (
            <div className="gc-recents">
              <div className="gc-recents-h">
                <span>{tr("chat.resume")}</span>
                <button type="button" onClick={() => setView("history")}>
                  {tr("chat.seeAll")}
                </button>
              </div>
              {recent.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="gc-rc"
                  onClick={() => resume(c)}
                >
                  <span
                    className="gc-rc-dot"
                    style={{
                      background: avColor(
                        c.note?.discipline ?? c.note?.title ?? "",
                      ),
                    }}
                  />
                  <span className="gc-rc-tx">
                    <b>{c.title}</b>
                    <span>
                      {c.note?.title ?? tr("chat.wholeGarden")} ·{" "}
                      {relTime(c.updated, locale)}
                    </span>
                  </span>
                  {Ic.chev}
                </button>
              ))}
            </div>
          )}
          <div className="gc-sugg">
            {(page && conv.note
              ? [
                  ...page.headings
                    .slice(0, 1)
                    .map((h) => ({
                      b: tr("chat.suggestExplain"),
                      s: h,
                      q: `${tr("chat.suggestExplain")} : ${h}`,
                      mode: "answer" as ChatMode,
                    })),
                  {
                    b: tr("chat.suggestQuiz"),
                    s: tr("chat.suggestQuizSub"),
                    q: tr("chat.suggestQuizQ"),
                    mode: "socratic" as ChatMode,
                  },
                ]
              : [
                  {
                    b: tr("chat.suggestSummary"),
                    s: tr("chat.suggestSummarySub"),
                    q: tr("chat.suggestSummaryQ"),
                    mode: "answer" as ChatMode,
                  },
                ]
            ).map((x) => (
              <button
                key={x.q}
                type="button"
                onClick={() => {
                  updateConv((c) => ({ ...c, mode: x.mode }));
                  send(x.q, { mode: x.mode, passage: "" });
                }}
              >
                <b>{x.b}</b>
                <span>{x.s}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const citeTarget = (e: React.SyntheticEvent) =>
    (e.target as Element | null)?.closest?.<HTMLElement>(".gc-cite") ?? null;
  const conversation = (
    <div
      className="gc-conv"
      onClick={(e) => {
        const b = citeTarget(e);
        if (!b) return;
        if (cite && cite.n === Number(b.dataset.n) && cite.i === Number(b.closest<HTMLElement>("[data-i]")?.dataset.i))
          setCite(null);
        else openCite(b);
      }}
      onMouseOver={(e) => {
        const b = citeTarget(e);
        if (b && wide) openCite(b);
      }}
      onMouseOut={(e) => {
        if (citeTarget(e) && wide) closeCiteSoon();
      }}
    >
      {msgs.map((m, i) =>
        m.role === "user" ? (
          editing === i ? (
            <form
              className="gc-edit"
              key={i}
              onSubmit={(e) => {
                e.preventDefault();
                submitEdit();
              }}
            >
              {m.passage && (
                <div className="gc-att">
                  {Ic.doc}
                  {m.passageFrom || tr("chat.passage")}
                </div>
              )}
              <textarea
                autoFocus
                rows={2}
                value={editText}
                maxLength={1000}
                aria-label={tr("chat.editQuestion")}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitEdit();
                  }
                }}
              />
              <div className="gc-btns">
                <button type="button" className="gc-btn sec" onClick={() => setEditing(-1)}>
                  {tr("chat.cancel")}
                </button>
                <button
                  type="submit"
                  className="gc-btn pri"
                  disabled={!editText.trim() && !m.passage}
                >
                  {tr("chat.send")}
                </button>
              </div>
            </form>
          ) : (
            <div className="gc-uwrap" key={i}>
              {!busy && (
                <button
                  type="button"
                  className="gc-uedit"
                  onClick={() => startEdit(i)}
                  aria-label={tr("chat.editQuestion")}
                  title={tr("chat.editQuestion")}
                >
                  {Ic.edit}
                </button>
              )}
              <div className="gc-user">
                {(conv.note || m.passage) && (
                  <div className="gc-att">
                    {Ic.doc}
                    {m.passageFrom ||
                      `${conv.note?.title ?? tr("chat.wholeGarden")}${
                        m.passage ? ` · ${tr("chat.passage")}` : ""
                      }`}
                  </div>
                )}
                {m.passage && (
                  <div className="gc-pq">
                    {m.passage.length > 400
                      ? `${m.passage.slice(0, 400)}…`
                      : m.passage}
                  </div>
                )}
                {m.text}
              </div>
            </div>
          )
        ) : (
          renderAssistant(m, i)
        ),
      )}
    </div>
  );

  const modKey =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const topTitle =
    view === "history" ? "" : started ? conv.title : tr("chat.title");

  const showRail = wide && (rail || layout === "wide");
  const moreMenu = menu === "more" && (
    <div className="gc-menu gc-more" role="menu">
      {wide && (
        <>
          <button type="button" role="menuitem" onClick={toggleWide}>
            {layout === "wide" ? Ic.shrink : Ic.expand}
            <span>{tr(layout === "wide" ? "chat.narrow" : "chat.widen")}</span>
          </button>
          {dockable && (
            <button type="button" role="menuitem" onClick={toggleDock}>
              {Ic.dock}
              <span>{tr(docked ? "chat.undock" : "chat.dock")}</span>
              <kbd>{modKey} \</kbd>
            </button>
          )}
          <hr />
        </>
      )}
      <button type="button" role="menuitem" disabled={!started} onClick={startRename}>
        {Ic.edit}
        <span>{tr("chat.rename")}</span>
      </button>
      <button type="button" role="menuitem" disabled={!started} onClick={togglePin}>
        {Ic.pin}
        <span>{tr(conv.pinned ? "chat.unpin" : "chat.pin")}</span>
      </button>
      <hr />
      <button type="button" role="menuitem" disabled={!started} onClick={() => void copyMarkdown()}>
        {Ic.copy}
        <span>{tr("chat.exportCopy")}</span>
      </button>
      <button type="button" role="menuitem" disabled={!started} onClick={downloadMarkdown}>
        {Ic.dl}
        <span>{tr("chat.exportDownload")}</span>
      </button>
      {wide && (
        <>
          <hr />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              setSheet("keys");
            }}
          >
            {Ic.kbd}
            <span>{tr("chat.keys")}</span>
          </button>
        </>
      )}
      <hr />
      <button
        type="button"
        role="menuitem"
        className="gc-danger"
        disabled={!started}
        onClick={deleteCurrent}
      >
        {Ic.trash}
        <span>{tr("chat.deleteConv")}</span>
      </button>
    </div>
  );

  const chatView = (
    <>
      <div className="gc-top">
        <button
          type="button"
          className="gc-ib"
          onClick={closeChat}
          aria-label={tr("chat.close")}
          title={wide ? `${tr("chat.close")} (${modKey} J)` : undefined}
        >
          {wide ? Ic.x : Ic.back}
        </button>
        {wide && layout !== "wide" && (
          <button
            type="button"
            className={rail ? "gc-ib gc-ib-sm on" : "gc-ib gc-ib-sm"}
            onClick={toggleRail}
            aria-pressed={rail}
            aria-label={tr("chat.rail")}
            title={tr("chat.rail")}
          >
            {Ic.side}
          </button>
        )}
        <div className="gc-ttl">
          {renaming ? (
            <input
              className="gc-rename"
              autoFocus
              value={renameText}
              maxLength={200}
              aria-label={tr("chat.rename")}
              onChange={(e) => setRenameText(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setRenaming(false);
                }
              }}
            />
          ) : (
          <button
            type="button"
            onClick={() => setScopeMenu((v) => !v)}
            aria-expanded={scopeMenu}
            aria-haspopup="listbox"
          >
            {conv.pinned && <span className="gc-ttl-pin">{Ic.pin}</span>}
            <span className="gc-ttl-t">{topTitle}</span>
            {Ic.down}
          </button>
          )}
          {scopeMenu && (
            <div
              className="gc-scope"
              role="listbox"
              aria-label={tr("chat.scopeLabel")}
            >
              <p>{tr("chat.scopeLabel")}</p>
              {page && (
                <button
                  type="button"
                  role="option"
                  aria-selected={conv.scope === page.folder}
                  onClick={() => chooseScope(page.folder)}
                >
                  {tr("chat.scopeNote")}
                </button>
              )}
              <button
                type="button"
                role="option"
                aria-selected={!conv.scope}
                onClick={() => chooseScope("")}
              >
                {tr("chat.scopeAll")}
              </button>
              {scopes.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  role="option"
                  aria-selected={conv.scope === s.slug}
                  onClick={() => chooseScope(s.slug)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {wide && dockable && (
          <button
            type="button"
            className={docked ? "gc-ib gc-ib-sm on" : "gc-ib gc-ib-sm"}
            onClick={toggleDock}
            aria-pressed={docked}
            aria-label={tr(docked ? "chat.undock" : "chat.dock")}
            title={`${tr(docked ? "chat.undock" : "chat.dock")} (${modKey} \\)`}
          >
            {Ic.dock}
          </button>
        )}
        <button
          type="button"
          className={menu === "more" ? "gc-ib gc-ib-sm gc-menu-btn on" : "gc-ib gc-ib-sm gc-menu-btn"}
          onClick={() => setMenu(menu === "more" ? null : "more")}
          aria-expanded={menu === "more"}
          aria-haspopup="menu"
          aria-label={tr("chat.more")}
          title={tr("chat.more")}
        >
          {Ic.more}
        </button>
        {!showRail && (
          <button
            type="button"
            className="gc-ib"
            onClick={() => newConversation()}
            aria-label={tr("chat.new")}
            title={wide ? `${tr("chat.new")} (${modKey} ⇧ O)` : tr("chat.new")}
          >
            {Ic.edit}
          </button>
        )}
        {moreMenu}
      </div>
      {(started || conv.mode !== "answer" || passage) && modes}
      {!started && !passage && (
        <p className="gc-scope-hint">
          {tr("chat.searchIn", { scope: scopeLabel })}
        </p>
      )}
      <div className="gc-scroll" ref={scrollRef}>
        {started ? conversation : home}
      </div>
      {composer}
    </>
  );

  const railChats = searchChats(chats, railQuery);
  const railView = (
    <aside className="gc-rail" aria-label={tr("chat.historyTitle")}>
      <button
        type="button"
        className="gc-rail-new"
        title={`${tr("chat.new")} (${modKey} ⇧ O)`}
        onClick={() => {
          newConversation();
          focusComposer();
        }}
      >
        {Ic.edit}
        <span>{tr("chat.new")}</span>
      </button>
      <label className="gc-rail-find">
        {Ic.search}
        <input
          type="search"
          value={railQuery}
          placeholder={tr("chat.railFind")}
          aria-label={tr("chat.railFind")}
          onChange={(e) => setRailQuery(e.target.value)}
        />
      </label>
      <div className="gc-rail-list">
        {railGroups(railChats, page?.url ?? null).map((g) => (
          <div key={g.key}>
            <div className="gc-rail-h">{tr(`chat.rail_${g.key}`)}</div>
            {g.chats.map((c) => (
              <div
                key={c.id}
                className={c.id === conv.id ? "gc-rail-i on" : "gc-rail-i"}
              >
                <button type="button" onClick={() => resume(c)} title={c.title}>
                  <i
                    style={{
                      background: avColor(c.note?.discipline ?? c.note?.title ?? ""),
                    }}
                  />
                  <span>{c.title}</span>
                </button>
                <button
                  type="button"
                  className="gc-rail-del"
                  aria-label={tr("chat.delete")}
                  title={tr("chat.delete")}
                  onClick={() => {
                    const s2 = store();
                    if (s2) setChats(deleteChat(s2, c.id));
                    if (c.id === conv.id) newConversation();
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}
        {!railChats.length && (
          <p className="gc-rail-empty">
            {tr(railQuery.trim() ? "chat.railNone" : "chat.historyEmpty")}
          </p>
        )}
      </div>
      <button
        type="button"
        className="gc-rail-set"
        onClick={() => {
          setView("settings");
          void refreshNano();
        }}
      >
        {Ic.gear}
        <span>{tr("chat.settings")}</span>
      </button>
    </aside>
  );

  const citeSrc = cite ? msgs[cite.i]?.sources?.[cite.n - 1] : undefined;
  const citeHere =
    !!citeSrc &&
    (() => {
      try {
        return new URL(citeSrc.url, location.origin).pathname === pageWindow().location.pathname;
      } catch {
        return false;
      }
    })();
  const citePop = citeSrc && cite && (
    <div
      className="gc-cite-pop"
      role="dialog"
      aria-label={citeSrc.title}
      style={
        cite.below
          ? { top: cite.top, left: cite.left }
          : { bottom: cite.top, left: cite.left }
      }
      onMouseEnter={() => window.clearTimeout(citeTimer.current)}
      onMouseLeave={() => wide && closeCiteSoon()}
    >
      <small>
        {cite.n} · {citeSrc.crumb || citeSrc.title}
      </small>
      {citeSrc.excerpt && <q>{citeSrc.excerpt}</q>}
      <button type="button" onClick={() => showSource(citeSrc)}>
        {tr(citeHere ? "chat.showInNote" : docked ? "chat.openBeside" : "chat.openNote")}
        {Ic.arrow}
      </button>
    </div>
  );

  const groups = groupByNote(chats);
  const historyView = (
    <>
      <div className="gc-top">
        <button
          type="button"
          className="gc-ib"
          onClick={() => setView("chat")}
          aria-label={tr("chat.back")}
        >
          {Ic.back}
        </button>
        <div className="gc-ttl" />
        <button
          type="button"
          className="gc-ib"
          onClick={() => {
            setView("settings");
            void refreshNano();
          }}
          aria-label={tr("chat.settings")}
          title={tr("chat.settings")}
        >
          {Ic.gear}
        </button>
      </div>
      <div className="gc-scroll">
        <h2 className="gc-big">{tr("chat.historyTitle")}</h2>
        {!groups.length && (
          <p className="gc-empty">{tr("chat.historyEmpty")}</p>
        )}
        {groups.map((g) => (
          <div className="gc-nb" key={g.note?.url ?? "all"}>
            <div className="gc-nb-hd">
              <span
                className="gc-av"
                style={{
                  background: g.note
                    ? avColor(g.note.discipline ?? g.note.title)
                    : "#3f6b4a",
                }}
              >
                {(g.note?.title ?? tr("chat.wholeGarden"))
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <span className="gc-nb-t">
                <b>{g.note?.title ?? tr("chat.wholeGarden")}</b>
                <span>
                  {g.note
                    ? (g.note.discipline ?? "")
                    : tr("chat.wholeGardenSub")}
                </span>
              </span>
              {g.note && (
                <a href={g.note.url} onClick={closeChat}>
                  {tr("chat.openNote")}
                </a>
              )}
            </div>
            {g.chats.map((c) => (
              <div className="gc-nb-q" key={c.id}>
                <button type="button" onClick={() => resume(c)}>
                  {c.title}
                </button>
                <time>{relTime(c.updated, locale)}</time>
                <button
                  type="button"
                  className="gc-del"
                  aria-label={tr("chat.delete")}
                  onClick={() => {
                    const s = store();
                    if (s) setChats(deleteChat(s, c.id));
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );

  const downloadedOn = localModelDownloadedOn();
  const settingsView = (
    <>
      <div className="gc-top">
        <button
          type="button"
          className="gc-ib"
          onClick={() => setView("history")}
          aria-label={tr("chat.back")}
        >
          {Ic.back}
        </button>
        <div className="gc-ttl" />
        <span className="gc-ib" />
      </div>
      <div className="gc-scroll gc-set">
        <h2 className="gc-big">{tr("chat.setTitle")}</h2>
        {route === "nano" && (
          <p className="gc-fine gc-fine-left">{tr("chat.setNano")}</p>
        )}
        {nano && (
          <>
            <div className="gc-grp">Gemini Nano (Chrome)</div>
            <div className="gc-box">
              <div className="gc-li">
                <span className="gc-li-tx">
                  {tr(`chat.nanoState.${nano}`)}
                  {nano === "aside" && (
                    <span>
                      {nanoSetAsideReason() === "echo"
                        ? tr("chat.nanoEcho")
                        : nanoSetAsideReason()}
                    </span>
                  )}
                </span>
                {nano === "aside" && (
                  <button
                    type="button"
                    className="gc-btn sec"
                    onClick={async () => {
                      resetNano();
                      await refreshNano();
                      await refreshRoute();
                    }}
                  >
                    {tr("chat.nanoRetry")}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        <div className="gc-grp">{tr("chat.setModel")}</div>
        <div className="gc-box">
          <div className="gc-li">
            <span className="gc-li-tx">
              {tr(word === "phone" ? "chat.setUsePhone" : "chat.setUseDevice")}
              <span>
                {downloadedOn
                  ? tr("chat.setDownloaded", {
                      date: fmtDay(downloadedOn, locale),
                      name: model.name,
                    })
                  : tr("chat.setNotDownloaded", { name: model.name })}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={route === "local"}
              className={route === "local" ? "gc-tg on" : "gc-tg"}
              onClick={() => {
                if (route === "local") {
                  setLocalModelEnabled(false);
                  setRoute("download");
                  setDl("idle");
                } else if (route === "download") openConfirm();
              }}
            />
          </div>
          <div className="gc-li">
            <span className="gc-li-tx">{tr("chat.setSpace")}</span>
            <em>{downloadedOn ? `${gb} Go` : "0 Go"}</em>
          </div>
          {downloadedOn && (
            <button
              type="button"
              className="gc-li gc-red"
              onClick={async () => {
                await deleteLocalModel();
                setRoute("download");
                setDl("idle");
                showToast(tr("chat.deleted"));
              }}
            >
              {tr("chat.setDelete", { n: gb })}
            </button>
          )}
        </div>
        <div className="gc-grp">{tr("chat.setFail")}</div>
        <div className="gc-box">
          <div className="gc-li">
            <span className="gc-li-tx">
              {tr("chat.setFailA")}
              <span>{tr("chat.setFailB")}</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );

  const freeBytes = storage?.free ?? null;
  const usedBytes = storage?.used ?? 0;
  const totalBytes = freeBytes !== null ? freeBytes + usedBytes : 0;
  const noSpace = freeBytes !== null && freeBytes < model.bytes * 1.2;
  const onWifi =
    (navigatorConnection()?.type ?? "") === "wifi" ||
    (navigatorConnection()?.type ?? "") === "ethernet";

  const sheets = sheet && (
    <>
      <div
        className="gc-scrim"
        onClick={() => {
          setSheet(null);
          pendingRef.current = null;
        }}
      />
      <div className="gc-sheet" role="dialog" aria-modal="true">
        <div className="gc-grab" />
        {sheet === "confirm" && (
          <>
            <h2 className="gc-big2">{tr("chat.dlConfirmTitle")}</h2>
            <p className="gc-lead">{tr("chat.dlConfirmText", { n: gb, name: model.name })}</p>
            {freeBytes !== null && totalBytes > 0 && (
              <div className="gc-meter">
                <div className="gc-meter-lbl">
                  <span>{tr("chat.dlStorage")}</span>
                  <span>
                    {tr("chat.dlFree", { n: fmtGb(freeBytes, locale) })}
                  </span>
                </div>
                <div className="gc-meter-trk">
                  <i
                    style={{
                      width: `${Math.max(1, (100 * usedBytes) / totalBytes)}%`,
                      background: "var(--rule-strong)",
                    }}
                  />
                  <i
                    style={{
                      width: `${Math.max(2, (100 * model.bytes) / totalBytes)}%`,
                      background: noSpace ? "var(--danger)" : "var(--garden)",
                    }}
                  />
                </div>
                <div className="gc-meter-lbl gc-meter-sub">
                  <span>{tr("chat.dlUsed")}</span>
                  <span className={noSpace ? "gc-red" : "gc-green"}>
                    {tr("chat.dlPlus", { n: gb })}
                  </span>
                </div>
              </div>
            )}
            <div className="gc-cmp">
              <div className="on">
                <b>{tr("chat.dlWith")}</b>
                {tr("chat.dlWithText")}
              </div>
              <div>
                <b>{tr("chat.dlWithout")}</b>
                {tr(
                  word === "phone"
                    ? "chat.dlWithoutPhone"
                    : "chat.dlWithoutDevice",
                )}
              </div>
            </div>
            <div className="gc-btns">
              <button
                type="button"
                className="gc-btn sec"
                onClick={() => {
                  setSheet(null);
                  pendingRef.current = null;
                }}
              >
                {tr("chat.cancel")}
              </button>
              <button
                type="button"
                className="gc-btn pri"
                disabled={noSpace}
                onClick={() => {
                  const then = pendingRef.current;
                  pendingRef.current = null;
                  startDownload();
                  then?.();
                }}
              >
                {tr("chat.dlGo", { n: gb })}
              </button>
            </div>
            <p className="gc-fine">
              {noSpace
                ? tr("chat.dlNoSpace", { n: gb })
                : onWifi
                  ? tr("chat.dlOnWifi")
                  : tr("chat.dlKeepReading")}
            </p>
          </>
        )}
        {sheet === "unsupported" && (
          <>
            <h2 className="gc-big2">{tr("chat.noTitle")}</h2>
            <p className="gc-lead">{tr("chat.noText")}</p>
            <div className="gc-facts">
              <div>
                {Ic.check}
                <span>
                  <strong>{tr("chat.noIphoneA")}</strong> :{" "}
                  {tr("chat.noIphoneB")}
                </span>
              </div>
              <div>
                {Ic.check}
                <span>
                  <strong>{tr("chat.noOtherA")}</strong> : {tr("chat.noOtherB")}
                </span>
              </div>
              <div>
                {Ic.search}
                <span>{tr("chat.noMeanwhile")}</span>
              </div>
            </div>
            {nanoSetAsideReason() && (
              // Gemini Nano was there but failed in this tab: it can be
              // tried again, or this sheet would be the only way out.
              <p className="gc-fine gc-fine-left">
                {tr("chat.nanoFailed", {
                  why:
                    nanoSetAsideReason() === "echo"
                      ? tr("chat.nanoEcho")
                      : nanoSetAsideReason(),
                })}
              </p>
            )}
            <div className="gc-btns">
              {nanoSetAsideReason() && (
                <button
                  type="button"
                  className="gc-btn sec"
                  onClick={async () => {
                    resetNano();
                    setSheet(null);
                    if ((await refreshRoute()) === "none") return;
                    setPage(readPage());
                    setOpen(true);
                    setView("chat");
                  }}
                >
                  {tr("chat.nanoRetry")}
                </button>
              )}
              <button
                type="button"
                className="gc-btn pri"
                onClick={() => setSheet(null)}
              >
                {tr("chat.ok")}
              </button>
            </div>
          </>
        )}
        {sheet === "keys" && (
          <>
            <h2 className="gc-sheet-h">{tr("chat.keys")}</h2>
            <dl className="gc-keys">
              {(
                [
                  [`${modKey} J`, "chat.keyToggle"],
                  [`${modKey} ⇧ O`, "chat.keyNew"],
                  [`${modKey} \\`, "chat.keyDock"],
                  ["↑", "chat.keyEdit"],
                  ["@", "chat.keyAttach"],
                  ["⇧ ↵", "chat.keyLine"],
                  [tr("chat.escKey"), "chat.keyEsc"],
                ] as const
              ).map(([k, label]) => (
                <div key={label}>
                  <dt>{tr(label)}</dt>
                  <dd>
                    <kbd>{k}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="gc-btns">
              <button type="button" className="gc-btn pri" onClick={() => setSheet(null)}>
                {tr("chat.ok")}
              </button>
            </div>
          </>
        )}
        {sheet === "sources" && (
          <>
            <h2 className="gc-sheet-h">
              {tr("chat.sourcesTitle")}
              <span>{tr("chat.sourcesCount", { n: sheetSources.length })}</span>
            </h2>
            {sheetSources.map((s, k) => (
              <a
                className="gc-src"
                key={s.url}
                href={s.url}
                onClick={(e) => {
                  e.preventDefault();
                  setSheet(null);
                  showSource(s);
                }}
              >
                <span
                  className="gc-src-n"
                  style={{ background: SRC_COLORS[k % SRC_COLORS.length] }}
                >
                  {k + 1}
                </span>
                <span>
                  {s.crumb && s.crumb !== s.title && <small>{s.crumb}</small>}
                  <b>{s.title}</b>
                  {s.excerpt && (
                    <span className="gc-src-q">« {s.excerpt} »</span>
                  )}
                </span>
              </a>
            ))}
          </>
        )}
        {sheet === "card" && card && (
          <>
            <h2 className="gc-sheet-h">
              {tr("chat.cardTitle")}
              <span>{card.title}</span>
            </h2>
            {card.writing ? (
              <p className="gc-wait">
                <span className="gc-typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {tr("chat.cardWriting")}
              </p>
            ) : (
              <>
                <label className="gc-fld">
                  <small>{tr("chat.cardFront")}</small>
                  <textarea
                    value={card.front}
                    rows={2}
                    onChange={(e) =>
                      setCard({ ...card, front: e.target.value })
                    }
                  />
                </label>
                <label className="gc-fld">
                  <small>{tr("chat.cardBack")}</small>
                  <textarea
                    value={card.back}
                    rows={3}
                    onChange={(e) => setCard({ ...card, back: e.target.value })}
                  />
                </label>
                <p className="gc-fine gc-fine-left">
                  {tr(
                    word === "phone"
                      ? "chat.cardHintPhone"
                      : "chat.cardHintDevice",
                  )}
                </p>
              </>
            )}
            <div className="gc-btns">
              <button
                type="button"
                className="gc-btn sec"
                onClick={() => {
                  setSheet(null);
                  setCard(null);
                }}
              >
                {tr("chat.cancel")}
              </button>
              <button
                type="button"
                className="gc-btn pri"
                disabled={card.writing}
                onClick={addCard}
              >
                {tr("chat.cardAdd")}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      {!open && (onNote || !!page) && (
        <button
          type="button"
          className="gk-pinned-trigger gc-trigger"
          onClick={async () => {
            if (passive) {
              // The page beside the chat: its bar focuses the chat up there.
              const top = window.parent as typeof window;
              top.dispatchEvent(new top.CustomEvent("gk:chat-focus"));
              return;
            }
            if (await openChat()) newConversation();
          }}
        >
          <span className="gc-trigger-ic">{Ic.sprout}</span>
          <span className="gk-pinned-trigger-label">{tr("askAi.trigger")}</span>
          <span className="gc-trigger-ph">{tr("chat.placeholderNote")}</span>
          {canDictate && <span className="gc-trigger-mic">{Ic.mic}</span>}
        </button>
      )}
      {open && (
        <section
          ref={sectionRef}
          className={[
            "gc",
            wide && layout === "wide" ? "gc-l-wide" : "",
            docked ? "gc-l-dock" : "",
            showRail ? "gc-has-rail" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            wide && panelW && layout !== "wide"
              ? ({ "--gc-w": `${panelW}px` } as React.CSSProperties)
              : undefined
          }
          aria-label={tr("home.askLabel")}
        >
          {wide && layout !== "wide" && (
            <div
              className="gc-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label={tr("chat.resize")}
              onPointerDown={startResize}
              onDoubleClick={() => {
                setPanelW(0);
                lsSet(WIDTH_KEY, "");
              }}
            />
          )}
          {showRail && railView}
          <div className="gc-main" ref={mainRef}>
            {view === "chat"
              ? chatView
              : view === "history"
                ? historyView
                : settingsView}
            {cite && citePop}
          </div>
          {toast && (
            <div className="gc-toast glass" role="status">
              {Ic.check}
              {toast}
            </div>
          )}
          {sheets}
        </section>
      )}
      {!open && sheets && <div className="gc gc-sheets-only">{sheets}</div>}
      {!open && toast && (
        <div className="gc-toast gc-toast-page glass" role="status">
          {Ic.check}
          {toast}
        </div>
      )}
    </>
  );
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (e: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void;
  onend: () => void;
  start(): void;
}

function navigatorConnection(): { type?: string } | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as unknown as { connection?: { type?: string } })
    .connection;
}

function fmtDay(day: string, locale: string): string {
  try {
    return new Date(`${day}T12:00:00`).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    });
  } catch {
    return day;
  }
}

function relTime(ms: number, locale: string): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}
