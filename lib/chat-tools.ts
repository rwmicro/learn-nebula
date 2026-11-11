// Pure helpers behind the garden chat's desktop tools
// (components/chat/GardenChat.tsx): the history column (groups, search), the
// « Copier en Markdown » / « Télécharger » export, and the follow-up
// suggestions under an answer. No DOM, so they run in the unit tests.

import type { ChatSource, Conversation } from "./chat-history";

export type RailGroupKey = "pinned" | "note" | "today" | "week" | "earlier";

export interface RailGroup {
  key: RailGroupKey;
  chats: Conversation[];
}

const DAY = 86_400_000;

/** The history column: pinned first, then the open note's conversations,
 *  then by age. Each conversation appears once, newest first in its group. */
export function railGroups(
  chats: Conversation[],
  noteUrl: string | null,
  now = Date.now(),
): RailGroup[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const groups: Record<RailGroupKey, Conversation[]> = {
    pinned: [],
    note: [],
    today: [],
    week: [],
    earlier: [],
  };
  for (const c of [...chats].sort((a, b) => b.updated - a.updated)) {
    if (c.pinned) groups.pinned.push(c);
    else if (noteUrl && c.note?.url === noteUrl) groups.note.push(c);
    else if (c.updated >= today) groups.today.push(c);
    else if (c.updated >= today - 6 * DAY) groups.week.push(c);
    else groups.earlier.push(c);
  }
  return (Object.keys(groups) as RailGroupKey[])
    .filter((k) => groups[k].length)
    .map((key) => ({ key, chats: groups[key] }));
}

/** Lower-case, without accents, spaces collapsed: what the search compares. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Conversations whose title, note or messages hold every word of `query`. */
export function searchChats(
  chats: Conversation[],
  query: string,
): Conversation[] {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return chats;
  return chats.filter((c) => {
    const hay = fold(
      [c.title, c.note?.title ?? "", ...c.messages.map((m) => m.text)].join(
        " ",
      ),
    );
    return words.every((w) => hay.includes(w));
  });
}

export interface ExportLabels {
  me: string;
  garden: string;
  note: string;
  passage: string;
  sources: string;
}

/** The conversation as Markdown: what « Copier » and « Télécharger » give. */
export function conversationMarkdown(
  c: Conversation,
  labels: ExportLabels,
  siteUrl = "",
  date = new Date(c.updated),
): string {
  const abs = (u: string) =>
    u.startsWith("/") ? siteUrl.replace(/\/$/, "") + u : u;
  const out: string[] = [`# ${c.title || labels.garden}`, ""];
  const meta = [date.toISOString().slice(0, 10)];
  if (c.note)
    meta.unshift(`${labels.note} : [${c.note.title}](${abs(c.note.url)})`);
  out.push(`_${meta.join(" · ")}_`, "");
  for (const m of c.messages) {
    if (!m.text.trim() && !m.passage) continue;
    if (m.role === "user") {
      out.push(`**${labels.me}** : ${m.text.trim()}`);
      if (m.passage) {
        out.push(
          "",
          `> ${labels.passage}${m.passageFrom ? ` (${m.passageFrom})` : ""} :`,
        );
        for (const line of m.passage.trim().split("\n")) out.push(`> ${line}`);
      }
      out.push("");
    } else {
      out.push(`**${labels.garden}** :`, "", m.text.trim(), "");
      const src = m.sources ?? [];
      if (src.length) {
        out.push(`${labels.sources} :`);
        src.forEach((s, i) =>
          out.push(`${i + 1}. [${s.crumb || s.title}](${abs(s.url)})`),
        );
        out.push("");
      }
    }
  }
  return (
    out
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

/** A file name for the download: the title's words, ASCII, dashes. */
export function exportFileName(title: string): string {
  const base = fold(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${base || "conversation"}.md`;
}

/** The section part of a source's « Note › Section » breadcrumb. */
export function sourceSection(s: ChatSource): string {
  const parts = (s.crumb ?? "")
    .split("›")
    .map((p) => p.trim())
    .filter(Boolean);
  // Without the note's section numbers (« 1.1 Forces usuelles »).
  return parts.length > 1
    ? parts[parts.length - 1].replace(/^\d+(\.\d+)*\.?\s+/, "")
    : "";
}

/** A section the answer drew on that the question didn't name: the
 *  « Et « … » ? » follow-up. Empty when there is none worth offering. */
export function nextSection(question: string, sources: ChatSource[]): string {
  const q = fold(question);
  for (const s of sources) {
    const sec = sourceSection(s);
    if (sec.length > 2 && sec.length <= 60 && !q.includes(fold(sec)))
      return sec;
  }
  return "";
}

export interface NoteLink {
  title: string;
  href: string;
  folder?: string;
}

/** « Une autre note… »: notes whose title (or folder) holds every word typed,
 *  titles that start with them first; without a query, the open note's
 *  neighbours. Never the open note itself. */
export function searchNotes<T extends NoteLink>(
  notes: T[],
  query: string,
  currentUrl = "",
  max = 8,
): T[] {
  const words = fold(query).split(" ").filter(Boolean);
  const others = notes.filter((n) => n.href !== currentUrl);
  if (!words.length) {
    const here = notes.find((n) => n.href === currentUrl)?.folder;
    return (here ? others.filter((n) => n.folder === here) : others).slice(
      0,
      max,
    );
  }
  const scored: Array<[number, T]> = [];
  for (const n of others) {
    const t = fold(n.title);
    const hay = `${t} ${fold(n.folder ?? "")}`;
    if (!words.every((w) => hay.includes(w))) continue;
    scored.push([
      t.startsWith(words[0]) ? 0 : words.every((w) => t.includes(w)) ? 1 : 2,
      n,
    ]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].title.length - b[1].title.length)
    .slice(0, max)
    .map(([, n]) => n);
}

/** Where a download stands, for the time left: when it started being
 *  measured and how much had arrived then. */
export interface DownloadClock {
  t0: number;
  loaded0: number;
}

/** Restarts the clock when a new download begins (fewer bytes than the last
 *  sample), and starts it on the first sample. */
export function tickDownload(
  clock: DownloadClock | null,
  last: number,
  loaded: number,
  now: number,
): DownloadClock {
  if (!clock || loaded < last) return { t0: now, loaded0: loaded };
  return clock;
}

/** Seconds left at the average speed since the clock started, or null while
 *  there is too little to go on (under 2 s, or nothing arrived yet). */
export function downloadSecondsLeft(
  clock: DownloadClock | null,
  loaded: number,
  total: number,
  now: number,
): number | null {
  if (!clock || !total) return null;
  const dt = (now - clock.t0) / 1000;
  const got = loaded - clock.loaded0;
  if (dt < 2 || got <= 0) return null;
  return Math.max(0, Math.round((total - loaded) / (got / dt)));
}
