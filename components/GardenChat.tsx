"use client";

// "Demander au jardin": the site's single AI assistant, as a chat page in
// the manner of the ChatGPT / Claude apps — full screen on a phone, a tall
// panel on the right from 640px. Mounted site-wide in the root layout.
//
// Every answer is written on the reader's device (lib/garden-ai.ts): Chrome's
// Gemini Nano when it covers the language, else LFM3-1.7B downloaded once
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

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { markdownToHtml } from "@/lib/markdown-lite";
import { escapeHtml } from "@/lib/escape";
import { readAskStream } from "@/lib/ask-stream";
import { detectLanguage } from "@/lib/browser-ai";
import {
  LOCAL_MODEL_BYTES,
  LOCAL_MODEL_SIZE_GB,
  deleteLocalModel,
  loadLocalModel,
  localModelCached,
  localModelDownloadedOn,
  localModelError,
  localModelLoaded,
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
const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

interface PageNote extends ChatNote {
  /** Folder slug of the note, the "Cette note" retrieval scope. */
  folder: string;
  /** Its section headings, for the suggestions. */
  headings: string[];
}

function readPage(): PageNote | null {
  if (
    typeof location === "undefined" ||
    !location.pathname.startsWith("/posts/")
  )
    return null;
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
    .map(headingText)
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

/** The heading of the section a passage sits in, for « Relire … ». */
/** A heading's words, without its "#" anchor link or section number. */
function headingText(h: Element): string {
  const c = h.cloneNode(true) as Element;
  c.querySelectorAll(".anchor, .sec-num, [aria-hidden='true']").forEach((x) =>
    x.remove(),
  );
  return (c.textContent ?? "")
    .replace(/\s+/g, " ")
    .replace(/^\d+[.\s]*/, "")
    .trim();
}

function sectionOf(passage: string): { title: string; id: string } | null {
  const body = document.querySelector("main .article-body");
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

type Sheet = null | "confirm" | "sources" | "unsupported" | "card";
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

  // --- opening -------------------------------------------------------------
  const refreshRoute = useCallback(async () => {
    const r = await aiRoute(preferredLang());
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
    return true;
  }

  function closeChat() {
    setOpen(false);
    setScopeMenu(false);
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
    setBusy(false);
    setStatus("");
    setWaitingModel(false);
    setSection(null);
    setView("chat");
  }

  useEffect(() => {
    const s = store();
    if (s) setChats(loadChats(s));
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
    const onAsk = async (e: Event) => {
      const q = String(
        (e as CustomEvent<{ question?: string }>).detail?.question ?? "",
      ).trim();
      if (!(await openChat())) return;
      newConversation("answer", null);
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
    opts: { passage?: string; mode?: ChatMode; regenerate?: boolean } = {},
  ) {
    const c0 = convRef.current;
    const mode = opts.mode ?? c0.mode;
    const pass = opts.passage ?? passage;
    if (busy || (!text.trim() && !pass)) return;
    const lang = replyLangHint(
      (await detectLanguage(text || pass, { allowDownload: true })) ?? "",
    );
    const r = await refreshRoute();
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
          },
        ],
      }));
    }
    setInput("");
    setPassage("");
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
        signal: ctrl.signal,
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
    const question = [...c.messages.slice(0, i)]
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
    setView("chat");
  }

  // --- rendering -----------------------------------------------------------
  const gb = LOCAL_MODEL_SIZE_GB.toLocaleString(locale);
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
            fromCache || pct >= 100 || (progress && progress.total < LOCAL_MODEL_BYTES / 2)
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

  function renderAssistant(m: ChatMessage, i: number) {
    const last = i === lastIdx;
    const writing = last && busy;
    const fb = m.own && !writing ? parseExplainFeedback(m.text) : null;
    const sources = m.sources ?? [];
    return (
      <div className="gc-ai-wrap" key={i}>
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
                onClick={() => closeChat()}
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
            dangerouslySetInnerHTML={{ __html: markdownToHtml(m.text) }}
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
  const composer = (
    <form
      className={started ? "gc-comp gc-comp-pill" : "gc-comp"}
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return stop();
        if (canSend) send(input);
      }}
    >
      {passage && (
        <div className="gc-pin">
          <span>
            {passage.length > 140 ? `${passage.slice(0, 140)}…` : passage}
          </span>
          <button
            type="button"
            onClick={() => setPassage("")}
            aria-label={tr("chat.removePassage")}
          >
            ×
          </button>
        </div>
      )}
      <textarea
        ref={inputRef}
        rows={1}
        value={input}
        maxLength={1000}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
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

  const conversation = (
    <div className="gc-conv">
      {msgs.map((m, i) =>
        m.role === "user" ? (
          <div className="gc-user" key={i}>
            {(conv.note || m.passage) && (
              <div className="gc-att">
                {Ic.doc}
                {conv.note?.title ?? tr("chat.wholeGarden")}
                {m.passage ? ` · ${tr("chat.passage")}` : ""}
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
        ) : (
          renderAssistant(m, i)
        ),
      )}
    </div>
  );

  const topTitle =
    view === "history" ? "" : started ? conv.title : tr("chat.title");

  const chatView = (
    <>
      <div className="gc-top">
        <button
          type="button"
          className="gc-ib"
          onClick={closeChat}
          aria-label={tr("chat.close")}
        >
          {Ic.back}
        </button>
        <div className="gc-ttl">
          <button
            type="button"
            onClick={() => setScopeMenu((v) => !v)}
            aria-expanded={scopeMenu}
            aria-haspopup="listbox"
          >
            <span className="gc-ttl-t">{topTitle}</span>
            {Ic.down}
          </button>
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
        <button
          type="button"
          className="gc-ib"
          onClick={() => newConversation()}
          aria-label={tr("chat.new")}
          title={tr("chat.new")}
        >
          {Ic.edit}
        </button>
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
          onClick={() => setView("settings")}
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
        <div className="gc-grp">{tr("chat.setModel")}</div>
        <div className="gc-box">
          <div className="gc-li">
            <span className="gc-li-tx">
              {tr(word === "phone" ? "chat.setUsePhone" : "chat.setUseDevice")}
              <span>
                {downloadedOn
                  ? tr("chat.setDownloaded", {
                      date: fmtDay(downloadedOn, locale),
                    })
                  : tr("chat.setNotDownloaded")}
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
  const noSpace = freeBytes !== null && freeBytes < LOCAL_MODEL_BYTES * 1.2;
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
            <p className="gc-lead">{tr("chat.dlConfirmText", { n: gb })}</p>
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
                      width: `${Math.max(2, (100 * LOCAL_MODEL_BYTES) / totalBytes)}%`,
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
            <div className="gc-btns">
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
                onClick={closeChat}
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
        <section className="gc" aria-label={tr("home.askLabel")}>
          {view === "chat"
            ? chatView
            : view === "history"
              ? historyView
              : settingsView}
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
