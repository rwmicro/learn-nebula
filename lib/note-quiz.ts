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
  /** Question id → last day it was answered correctly ("YYYY-MM-DD"): a
   *  "Je savais" on the note page, a good/easy grade in a review. Kept for
   *  every question, saved or not — it is what "maîtrisée" (lib/path-study.ts)
   *  is derived from. Optional: entries written before it existed have none,
   *  and fall back on their scheduling state (see answeredCorrectly). */
  ok?: Record<string, string>;
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
  return { ...emptyProgress(), items: {}, ok: {} };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const ok: Record<string, string> = {};
  try {
    const obj = raw ? (JSON.parse(raw) as { items?: unknown; ok?: unknown }) : null;
    if (obj && obj.ok && typeof obj.ok === "object" && !Array.isArray(obj.ok)) {
      for (const [id, day] of Object.entries(obj.ok as Record<string, unknown>))
        if (id && typeof day === "string" && DAY_RE.test(day)) ok[id] = day;
    }
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
  return { ...p, cards, items, ok };
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
  const graded = { ...gradeCard(deck, id, g, today), items: deck.items, ok: deck.ok ?? {} };
  return isCorrect(g) ? recordCorrect(graded, id, today) : graded;
}

/** A grade that counts as a correct answer for mastery: good or easy (the
 *  note page's "Je savais" is good). */
export const isCorrect = (g: Grade) => g === "good" || g === "easy";

/** Remember that question `id` was answered correctly on `today` — saved in
 *  the reviews or not. */
export function recordCorrect(deck: NoteDeck, id: string, today: string = dayKey()): NoteDeck {
  return { ...deck, ok: { ...(deck.ok ?? {}), [id]: today } };
}

/** Has question `id` ever been answered correctly? Entries from before `ok`
 *  existed: a saved card with a success streak (reps > 0) counts. */
export function answeredCorrectly(deck: NoteDeck | null | undefined, id: string): boolean {
  if (!deck) return false;
  if (deck.ok?.[id]) return true;
  return (deck.cards[id]?.reps ?? 0) > 0;
}

/** Every one of `ids` (a note's questions) answered correctly at least once;
 *  false for a note with no question. */
export function allAnsweredCorrectly(deck: NoteDeck | null | undefined, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => answeredCorrectly(deck, id));
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

/** Persist one note's entry (removed once it holds neither a saved question
 *  nor a correct-answer record). */
export function saveNoteDeck(store: Store, slug: string, deck: NoteDeck): void {
  if (!Object.keys(deck.items).length && !Object.keys(deck.ok ?? {}).length)
    store.removeItem(noteKey(slug));
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

// --- Build-time extraction (path revision, /parcours/<slug>/) --------------

/** One `[!quiz]` card as rendered in a note's HTML. */
export interface QuizItem {
  /** Question id (lib/markdown.ts quizId), the key in the note's entry. */
  id: string;
  /** DOM id of the card on the note page ("q-<id>", "-2"… for repeats). */
  domId: string;
  q: string;
  a: string;
}

/** The end of the element whose start tag ends at `from` (exclusive index of
 *  its closing `</div>`'s end), counting nested divs; -1 if unbalanced. */
function closeDiv(html: string, from: number): number {
  const re = /<div\b[^>]*>|<\/div\s*>/gi;
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0][1] === "/") depth--;
    else depth++;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? "";

/**
 * Every quiz card in a note's rendered HTML (lib/markdown.ts quizCallout), in
 * document order: question and answer HTML exactly as the note page shows
 * them, so a path's revision session works without visiting the notes. Pure
 * string scanning — the markup is our own, from a known pipeline.
 */
export function extractQuizItems(html: string): QuizItem[] {
  const out: QuizItem[] = [];
  const start = /<div\b[^>]*\bclass="callout callout-quiz"[^>]*>/g;
  for (let m = start.exec(html); m; m = start.exec(html)) {
    const tag = m[0];
    const bodyStart = m.index + tag.length;
    const end = closeDiv(html, bodyStart);
    if (end < 0) break;
    const block = html.slice(bodyStart, end);
    start.lastIndex = end;
    const id = attr(tag, "data-quiz-id");
    if (!id) continue;
    const q = block.match(/<p class="quiz-question">([\s\S]*?)<\/p>/)?.[1] ?? "";
    const aTag = block.match(/<div\b[^>]*\bclass="callout-body quiz-answer"[^>]*>/);
    let a = "";
    if (aTag && aTag.index != null) {
      const from = aTag.index + aTag[0].length;
      const aEnd = closeDiv(block, from);
      if (aEnd > 0) a = block.slice(from, aEnd).replace(/<\/div\s*>$/i, "");
    }
    out.push({
      id,
      domId: attr(tag, "id") || `q-${id}`,
      q: q.trim().slice(0, MAX_HTML),
      a: a.trim().slice(0, MAX_HTML),
    });
  }
  return out;
}
