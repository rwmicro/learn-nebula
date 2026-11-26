// GardenChat's module-level helpers: storage keys, KaTeX on demand, reading
// the note on screen (in the « côte à côte » frame too), small formatters.
// No React here: the component (GardenChat.tsx) imports what it needs.

import type { ChatMode, ChatNote, Conversation } from "@/lib/chat-history";
import { noteSlugFromPath } from "@/lib/note-quiz";
import { headingWords, pageDoc, pageWindow } from "@/lib/client/chat-dock";

/** Discipline colours for the history avatars (stable per name). */
export const AV = [
  "#6b4fbb",
  "#2d6cc0",
  "#3f6b4a",
  "#b8740f",
  "#009b8f",
  "#b3322f",
];
export const avColor = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return AV[Math.abs(h) % AV.length];
};
export const SRC_COLORS = [
  "#3f6b4a",
  "#6b4fbb",
  "#b8740f",
  "#2d6cc0",
  "#009b8f",
];

export const SCOPE_KEY = "gkChatScope";
export const DL_LATER_KEY = "gkLocalLlmLater";
/** Desktop layout: over the page, beside it, or wide (localStorage). Unset =
 *  beside the page where there is room (from 1100px), else over it. */
export const LAYOUT_KEY = "gkChatLayout";
/** The history column shown (localStorage, "1"). */
export const RAIL_KEY = "gkChatRail";
/** The panel's width in px, as the reader dragged it (localStorage). */
export const WIDTH_KEY = "gkChatWidth";
/** A conversation to reopen on the next page load (sessionStorage): set
 *  while « côte à côte » (a reload) and when leaving it for another page. */
export const REOPEN_KEY = "gkChatReopen";
export type Layout = "overlay" | "dock" | "wide";

export function lsGet(k: string): string {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
}
export function lsSet(k: string, v: string) {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* storage blocked */
  }
}

// KaTeX for the formulas in answers: ~270 KB, so loaded the first time an
// answer holds one, with the site's own stylesheet (public/katex/).
export type Katex = { renderToString(tex: string, o: object): string };
let katexLib: Katex | null = null;
let katexLoading: Promise<void> | null = null;
export function loadKatex(): Promise<void> {
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
/** True once KaTeX has loaded: `katexMath` can then be called. */
export const katexReady = () => katexLib !== null;
export const katexMath = (tex: string, display: boolean) =>
  katexLib!.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    output: "html",
  });
export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export interface PageNote extends ChatNote {
  /** Folder slug of the note, the "Cette note" retrieval scope. */
  folder: string;
  /** Its section headings, for the suggestions. */
  headings: string[];
}

export function readPage(): PageNote | null {
  if (typeof window === "undefined") return null;
  // Beside the chat, the page is in the frame (lib/client/chat-dock.ts).
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

/** The heading of the section a passage sits in, for « Relire … ». */
export function sectionOf(
  passage: string,
): { title: string; id: string } | null {
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
  const title = headingWords(heading);
  return title ? { title, id: heading.id } : null;
}

export function emptyConv(
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

export const fmtGb = (bytes: number, locale: string) =>
  (bytes / 1e9).toLocaleString(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
export const fmtMb = (bytes: number, locale: string) =>
  bytes >= 1e9 ? `${fmtGb(bytes, locale)} Go` : `${Math.round(bytes / 1e6)} Mo`;

export type Sheet =
  null | "confirm" | "sources" | "unsupported" | "card" | "keys";
export type NoteRef = { title: string; href: string; folder?: string };
export type DlState = "idle" | "loading" | "ready" | "failed";

export interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (e: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void;
  onend: () => void;
  start(): void;
}

export function navigatorConnection(): { type?: string } | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as unknown as { connection?: { type?: string } })
    .connection;
}

export function fmtDay(day: string, locale: string): string {
  try {
    return new Date(`${day}T12:00:00`).toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    });
  } catch {
    return day;
  }
}

export function relTime(ms: number, locale: string): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

/** GardenChat's translate function, passed to its pieces. */
export type Tr = (k: string, vars?: Record<string, string | number>) => string;
