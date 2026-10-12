// Small pieces shared by the /admin cards (AdminPanel and components/admin/*).

import { useSyncExternalStore, type ReactNode } from "react";

export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-garden focus-visible:outline-offset-2";

export const INPUT_CLASS = `min-w-0 rounded border border-rule-strong bg-transparent px-2 py-1 text-small ${FOCUS_RING}`;
export const BUTTON_CLASS = `shrink-0 rounded border border-rule-strong px-2 py-1 text-small hover:bg-wash-2 disabled:opacity-40 ${FOCUS_RING}`;

/** How long an undoable action waits before it reaches the server — and how
 *  long its toast (with the "Annuler" button) stays up. */
export const UNDO_MS = 6000;

/** A button shown in the toast (e.g. "Annuler"). */
export interface ToastAction {
  label: string;
  run: () => void;
}

/** What every card in the /admin tabs receives (components/admin/AdminTabs.tsx). */
export interface AdminCardProps {
  token: string;
  /** The token stopped working: hand the session back to the panel. */
  onUnauthorized: () => void;
  onToast: (message: string, action?: ToastAction) => void;
}

/** Thrown by adminFetch on a 401, so a card can hand the session back to the
 *  panel (which disconnects) instead of showing a generic error. */
export class Unauthorized extends Error {}

/** The token's Authorization header — none when logged in by account (the
 *  session cookie goes along by itself, and an empty "Bearer " would count
 *  as a failed attempt server-side). */
export function authHeader(token: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function adminFetch<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), ...authHeader(token) },
  });
  if (r.status === 401) throw new Unauthorized();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

const DATE_TIME = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const DATE_ONLY = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export function fmtDateTime(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : DATE_TIME.format(d);
}

export function fmtDate(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : DATE_ONLY.format(d);
}

const SHORT_DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const SHORT_YEAR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "2-digit" });

/** Compact date for table cells: "12 oct.", with the year only when it isn't
 *  this one ("3 oct. 25"). The full date and time go in the cell's title. */
export function fmtShort(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return (d.getFullYear() === new Date().getFullYear() ? SHORT_DAY : SHORT_YEAR).format(d);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n > 1 ? many : one}`;
}

export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-wash-2 px-2 py-px text-micro font-semibold text-ink-2 tabular-nums">
      {children}
    </span>
  );
}

export function RefreshButton({
  busy,
  onClick,
  label,
}: {
  busy: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={`rounded text-small text-muted-warm hover:text-ink disabled:opacity-40 ${FOCUS_RING}`}
    >
      {busy ? "…" : "↻"}
    </button>
  );
}

/** Eyebrow title + optional count on the left, actions on the right. */
export function CardHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="admin-eyebrow m-0 text-small font-semibold text-muted-warm">{title}</h2>
        {count !== undefined && count !== null && <CountBadge>{count}</CountBadge>}
      </div>
      {children}
    </div>
  );
}

export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 text-small italic text-muted-warm ${className}`}>{children}</p>;
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <p className="m-0 mb-3 text-small text-danger">{children}</p>;
}

/** Status dot — colour encodes real state, not decoration. */
export function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

// --- Note titles: /notes-index.json (built with the site) maps every note's
// URL to its title, so the admin can say "LFCS — Notes de préparation" rather
// than ".../lfcs/notes". Loaded once, shared by every NoteLink.

let titles: Map<string, string> | null = null;
let titlesLoading = false;
const titleListeners = new Set<() => void>();
const NO_TITLES = new Map<string, string>();

function loadTitles() {
  if (titles || titlesLoading) return;
  titlesLoading = true;
  fetch("/notes-index.json")
    .then((r) => (r.ok ? r.json() : []))
    .then((list: { title?: string; href?: string }[]) => {
      titles = new Map();
      for (const n of Array.isArray(list) ? list : []) {
        if (typeof n?.href !== "string" || typeof n.title !== "string") continue;
        const slug = decodeURIComponent(n.href.replace(/^\/posts\//, "").replace(/\/$/, ""));
        titles.set(slug, n.title);
      }
    })
    .catch(() => {
      titles = new Map();
    })
    .finally(() => titleListeners.forEach((l) => l()));
}

export function useNoteTitles(): Map<string, string> {
  return useSyncExternalStore(
    (l) => {
      titleListeners.add(l);
      loadTitles();
      return () => {
        titleListeners.delete(l);
      };
    },
    () => titles ?? NO_TITLES,
    () => NO_TITLES,
  );
}

/** The note's last two path segments, while its title is unknown. */
export function shortSlug(slug: string): string {
  const parts = slug.split("/");
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : slug;
}

/** A link to a note, labelled with its title (full path on hover). */
export function NoteLink({ slug, children }: { slug: string; children?: ReactNode }) {
  const known = useNoteTitles();
  return (
    <a
      href={`/posts/${slug}/`}
      title={slug}
      className={`rounded text-garden underline-offset-2 hover:underline ${FOCUS_RING}`}
    >
      {children ?? known.get(slug) ?? shortSlug(slug)}
    </a>
  );
}
