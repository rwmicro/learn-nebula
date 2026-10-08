/**
 * What a review session (components/ReviewSession.tsx) shows: a note
 * question or one direction of an Anki deck card, and the small storage
 * helpers the deck pages and the combined session share.
 */
import type { NoteQuestion } from "./note-quiz";
import { parseProgress, type CardState, type Progress } from "./srs";
import type { DeckSettings } from "./srs-settings";
import { expectedAnswer, faces, type DeckData, type StudyCard } from "./deck-cards";

/** A note question (`> [!quiz]`, lib/note-quiz.ts). */
export interface NoteReviewItem {
  kind: "note";
  slug: string;
  id: string;
  item: NoteQuestion;
  state: CardState | undefined;
}

/** An Anki deck card (lib/deck-cards.ts), one direction of it. */
export interface DeckReviewItem {
  kind: "deck";
  /** Deck slug and the card's progress id in it. */
  slug: string;
  id: string;
  deckName: string;
  css: string;
  front: string;
  back: string;
  /** Typed-answer target, when the reader types the answer. */
  expected: string | null;
  autoplay: boolean;
  state: CardState | undefined;
}

export type ReviewItem = NoteReviewItem | DeckReviewItem;

/** What grading did: the card's new state, and how to take it back. */
export interface Graded {
  state: CardState | undefined;
  undo: () => void;
}

export function deckReviewItem(
  slug: string,
  deck: DeckData,
  sc: StudyCard,
  cfg: Pick<DeckSettings, "typed" | "autoplay">,
  state: CardState | undefined,
): DeckReviewItem {
  const card = deck.cards[sc.idx];
  const f = faces(card, sc.rev);
  return {
    kind: "deck",
    slug,
    id: sc.key,
    deckName: deck.name,
    css: deck.css,
    front: f.front,
    back: f.back,
    expected: expectedAnswer(card, sc.rev, cfg.typed),
    autoplay: cfg.autoplay,
    state,
  };
}

// --- deck progress in localStorage (`srs:<deck-slug>`) ----------------------

export const deckKey = (slug: string) => `srs:${slug}`;

/** Is localStorage usable (and writable — Safari private mode used to throw
 *  on setItem)? */
export function storageOk(): boolean {
  try {
    localStorage.setItem("srs:probe", "1");
    localStorage.removeItem("srs:probe");
    return true;
  } catch {
    return false;
  }
}

export function loadDeckProgress(slug: string): Progress {
  try {
    return parseProgress(localStorage.getItem(deckKey(slug)));
  } catch {
    return parseProgress(null);
  }
}

export function saveDeckProgress(slug: string, p: Progress | null): void {
  try {
    if (p) localStorage.setItem(deckKey(slug), JSON.stringify(p));
    else localStorage.removeItem(deckKey(slug));
  } catch {
    /* localStorage unavailable — progress lives for this visit only */
  }
}

/**
 * Today's counts for a deck from its stored progress alone, without fetching
 * the deck (the /cartes/ index, "Tout réviser"'s total): seen cards due, and
 * new cards still allowed. With a sub-deck or tag filter the new-card figure
 * is an upper bound — the deck itself is needed to know which unseen cards
 * the filter keeps.
 */
export function quickCounts(
  p: Progress,
  count: number,
  cfg: Pick<DeckSettings, "dir" | "newPerDay">,
  today: string,
): { due: number; fresh: number } {
  let due = 0;
  for (const c of Object.values(p.cards)) if (c.due <= today && !c.sus) due++;
  const total = count * (cfg.dir === "both" ? 2 : 1);
  const unseen = Math.max(0, total - Object.keys(p.cards).length);
  const room = Math.max(0, cfg.newPerDay - (p.newDay === today ? p.newCount : 0));
  return { due, fresh: Math.min(unseen, room) };
}
