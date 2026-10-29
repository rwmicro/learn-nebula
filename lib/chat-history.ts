// The garden chat's conversations (components/GardenChat.tsx), kept in this
// browser's localStorage only. Pure helpers over a Storage-like store, so the
// tests run without a browser.
//
// One entry, CHATS_KEY, holds the newest MAX_CHATS conversations. The chat's
// home lists the latest ones (« Reprendre »), and « Tout voir » groups them by
// the note they were asked from.

export const CHATS_KEY = "gkChats";
export const MAX_CHATS = 60;
const MAX_MESSAGES = 40;
const MAX_TEXT = 8000;

export type ChatMode = "answer" | "socratic" | "own";

export interface ChatSource {
  title: string;
  url: string;
  /** "Note › Section" the passage comes from, when known. */
  crumb?: string;
  excerpt?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** The note passage the question is about (user turns). */
  passage?: string;
  sources?: ChatSource[];
  /** Which model wrote it (assistant turns). */
  via?: "nano" | "local" | "server";
  /** A reply to « Avec mes mots » (drawn as « Ce qui tient / manque »). */
  own?: boolean;
  /** 👍 / 👎, kept in the browser. */
  rating?: 1 | -1;
}

export interface ChatNote {
  title: string;
  url: string;
  /** Discipline (first crumb), for the colour and the « Tout voir » filter. */
  discipline?: string;
}

export interface Conversation {
  id: string;
  title: string;
  note: ChatNote | null;
  /** Retrieval scope slug ("" = the whole garden). */
  scope: string;
  mode: ChatMode;
  updated: number;
  messages: ChatMessage[];
}

type Store = Pick<Storage, "getItem" | "setItem">;

function validMessage(m: unknown): m is ChatMessage {
  const o = m as ChatMessage;
  return (
    !!o &&
    (o.role === "user" || o.role === "assistant") &&
    typeof o.text === "string"
  );
}

function validConversation(c: unknown): c is Conversation {
  const o = c as Conversation;
  return (
    !!o &&
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.updated === "number" &&
    Array.isArray(o.messages)
  );
}

const safeUrl = (u: unknown) =>
  typeof u === "string" && /^\/(?!\/)/.test(u) ? u : "";

export function loadChats(store: Store): Conversation[] {
  let raw: unknown;
  try {
    raw = JSON.parse(store.getItem(CHATS_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(validConversation)
    .map((c) => ({
      ...c,
      note:
        c.note && typeof c.note.title === "string" && safeUrl(c.note.url)
          ? {
              title: c.note.title,
              url: c.note.url,
              discipline: c.note.discipline,
            }
          : null,
      scope: typeof c.scope === "string" ? c.scope : "",
      mode: (c.mode === "socratic" || c.mode === "own"
        ? c.mode
        : "answer") as ChatMode,
      messages: c.messages.filter(validMessage),
    }))
    .sort((a, b) => b.updated - a.updated);
}

function write(store: Store, chats: Conversation[]): void {
  try {
    store.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
  } catch {
    /* quota: keep going without history */
  }
}

/** Insert or replace `conv` (newest first), trimmed to the caps. */
export function saveChat(store: Store, conv: Conversation): Conversation[] {
  const clean: Conversation = {
    ...conv,
    title: conv.title.slice(0, 200),
    messages: conv.messages.slice(-MAX_MESSAGES).map((m) => ({
      ...m,
      text: m.text.slice(0, MAX_TEXT),
      passage: m.passage?.slice(0, 4000),
    })),
  };
  const chats = [clean, ...loadChats(store).filter((c) => c.id !== conv.id)];
  write(store, chats);
  return chats;
}

export function deleteChat(store: Store, id: string): Conversation[] {
  const chats = loadChats(store).filter((c) => c.id !== id);
  write(store, chats);
  return chats;
}

/** A conversation's title: its first question, shortened. */
export function chatTitle(question: string, fallback: string): string {
  const q = question.replace(/\s+/g, " ").trim();
  if (!q) return fallback;
  return q.length > 60 ? `${q.slice(0, 57).trimEnd()}…` : q;
}

export interface NoteGroup {
  /** null = asked about the whole garden. */
  note: ChatNote | null;
  chats: Conversation[];
}

/** « Tout voir »: conversations grouped by note, the most recent note first. */
export function groupByNote(chats: Conversation[]): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  for (const c of [...chats].sort((a, b) => b.updated - a.updated)) {
    const key = c.note?.url ?? "";
    const g = groups.get(key);
    if (g) g.chats.push(c);
    else groups.set(key, { note: c.note, chats: [c] });
  }
  return [...groups.values()];
}
