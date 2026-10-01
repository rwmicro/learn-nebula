/**
 * Note questions (`> [!quiz]` callouts, lib/markdown.ts) saved for spaced
 * repetition — pure, React-free, shared by public/js/quiz.js (note pages) and
 * components/NoteReview.tsx (/cartes/revision/).
 *
 * Same scheduler and same stored shape as the Anki decks (lib/srs.ts,
 * `srs:<deck-slug>` in localStorage, read by components/Flashcards.tsx), one
 * entry per note under its own namespace — `srs:note:<note-slug>` — so a note
 * question can never collide with a deck card id. On top of the deck
 * `Progress` the entry keeps each saved question's content (`items`): the
 * review page works from storage alone, without fetching the notes.
 *
 * Only questions the reader explicitly added are stored. A card with no
 * scheduling state yet (added without a self-grade) is due right away.
 */
import {
  dayKey,
  emptyProgress,
  grade as gradeCard,
  parseProgress,
  type CardState,
  type Grade,
  type Progress,
} from "./srs";

export const NOTE_PREFIX = "srs:note:";

export interface NoteQuestion {
  /** Question and answer as rendered HTML (from the note's own page). */
  q: string;
  a: string;
  /** Note page URL (pathname) and title, for the "back to the note" link. */
  url: string;
  title: string;
  /** Day it was added, "YYYY-MM-DD". */
  added: string;
}

export interface NoteDeck extends Progress {
  items: Record<string, NoteQuestion>;
}

/** Longest stored HTML per side — a runaway answer shouldn't eat the quota. */
export const MAX_HTML = 20_000;

export const noteKey = (slug: string) => `${NOTE_PREFIX}${slug}`;

/** "/posts/a/b/" → "a/b" (decoded); null off a note page. */
export function noteSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/posts\/(.+?)\/?$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function emptyNoteDeck(): NoteDeck {
  return { ...emptyProgress(), items: {} };
}

function validItem(x: unknown): x is NoteQuestion {
  const o = x as NoteQuestion;
  return (
    !!o &&
    typeof o.q === "string" &&
    typeof o.a === "string" &&
    typeof o.url === "string" &&
    /^\/(?!\/)/.test(o.url) &&
    typeof o.title === "string"
  );
}

/** Parse a stored note entry, dropping anything malformed. Scheduling state
 *  is kept only for questions that are still saved. */
export function parseNoteDeck(raw: string | null): NoteDeck {
  const p = parseProgress(raw);
  const items: Record<string, NoteQuestion> = {};
  try {
    const obj = raw ? (JSON.parse(raw) as { items?: unknown }) : null;
    if (obj && obj.items && typeof obj.items === "object") {
      for (const [id, it] of Object.entries(obj.items as Record<string, unknown>)) {
        if (validItem(it))
          items[id] = {
            q: it.q,
            a: it.a,
            url: it.url,
            title: it.title,
            added: typeof it.added === "string" ? it.added : "",
          };
      }
    }
  } catch {
    /* parseProgress already fell back to empty */
  }
  const cards: Record<string, CardState> = {};
  for (const id of Object.keys(items)) if (p.cards[id]) cards[id] = p.cards[id];
  return { ...p, cards, items };
}

/** Save `item` as `id`; `g` (the reader's self-grade, if any) schedules it. */
export function addQuestion(
  deck: NoteDeck,
  id: string,
  item: Omit<NoteQuestion, "added">,
  g: Grade | null,
  today: string = dayKey(),
): NoteDeck {
  const clean: NoteQuestion = {
    ...item,
    q: item.q.slice(0, MAX_HTML),
    a: item.a.slice(0, MAX_HTML),
    added: deck.items[id]?.added || today,
  };
  const next: NoteDeck = { ...deck, items: { ...deck.items, [id]: clean } };
  return g ? gradeQuestion(next, id, g, today) : next;
}

export function removeQuestion(deck: NoteDeck, id: string): NoteDeck {
  const items = { ...deck.items };
  const cards = { ...deck.cards };
  delete items[id];
  delete cards[id];
  return { ...deck, items, cards };
}

/** Grade a saved question (no-op for one that isn't saved). */
export function gradeQuestion(
  deck: NoteDeck,
  id: string,
  g: Grade,
  today: string = dayKey(),
): NoteDeck {
  if (!deck.items[id]) return deck;
  return { ...gradeCard(deck, id, g, today), items: deck.items };
}

/** The note page's two self-grade buttons, on the deck's four-grade scale. */
export const SELF_GRADE: Record<"knew" | "notYet", Grade> = {
  knew: "good",
  notYet: "again",
};

export interface DueItem {
  slug: string;
  id: string;
  item: NoteQuestion;
  state: CardState | undefined;
}

/** Every saved question due on `today` (never graded, or due ≤ today),
 *  most overdue first, never-graded ones last in the order they were added. */
export function dueQuestions(
  decks: Record<string, NoteDeck>,
  today: string = dayKey(),
): DueItem[] {
  const out: DueItem[] = [];
  for (const [slug, d] of Object.entries(decks))
    for (const [id, item] of Object.entries(d.items)) {
      const state = d.cards[id];
      if (!state || state.due <= today) out.push({ slug, id, item, state });
    }
  const rank = (x: DueItem) => x.state?.due ?? `9999-${x.item.added}`;
  return out.sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
}

export function countSaved(decks: Record<string, NoteDeck>): number {
  return Object.values(decks).reduce((n, d) => n + Object.keys(d.items).length, 0);
}

/** Earliest day after `today` on which a saved question comes due, or null. */
export function nextDueDay(
  decks: Record<string, NoteDeck>,
  today: string = dayKey(),
): string | null {
  let next: string | null = null;
  for (const d of Object.values(decks))
    for (const id of Object.keys(d.items)) {
      const due = d.cards[id]?.due;
      if (due && due > today && (!next || due < next)) next = due;
    }
  return next;
}

// --- Storage (localStorage, or any Storage-like for tests) -----------------

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function loadNoteDeck(store: Store, slug: string): NoteDeck {
  return parseNoteDeck(store.getItem(noteKey(slug)));
}

/** Persist one note's entry (removed once it holds no question). */
export function saveNoteDeck(store: Store, slug: string, deck: NoteDeck): void {
  if (!Object.keys(deck.items).length) store.removeItem(noteKey(slug));
  else store.setItem(noteKey(slug), JSON.stringify(deck));
}

/** Every note entry in storage, by note slug. */
export function loadAllNoteDecks(store: Store): Record<string, NoteDeck> {
  const out: Record<string, NoteDeck> = {};
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(NOTE_PREFIX)) keys.push(k);
  }
  for (const k of keys) {
    const d = parseNoteDeck(store.getItem(k));
    if (Object.keys(d.items).length) out[k.slice(NOTE_PREFIX.length)] = d;
  }
  return out;
}
