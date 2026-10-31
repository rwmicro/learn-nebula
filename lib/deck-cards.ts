/**
 * An Anki deck as the site studies it — pure, shared by the deck page
 * (components/review/Flashcards.tsx) and the combined session (TodayReview.tsx).
 *
 * The JSON comes from scripts/build-anki.mjs. On top of it this file decides
 * which cards the reader's deck settings (lib/srs-settings.ts) put in play —
 * sub-deck, tag, direction — and under which id each one is scheduled.
 */
import { cardId, migrateIds, type Progress } from "./srs";
import type { DeckSettings } from "./srs-settings";

export interface DeckCard {
  /** Anki note guid + template ordinal (older builds: absent). */
  id?: string;
  front: string;
  back: string;
  /** Legacy content-hash id, when it can't be recomputed from front/back. */
  h?: string;
  /** Expected answer of a `{{type:Field}}` template. */
  typ?: string;
  /** Index into DeckData.subs. */
  sb?: number;
  /** Indices into DeckData.tags. */
  tg?: number[];
}

export interface DeckData {
  slug?: string;
  name: string;
  css: string;
  subs?: string[];
  tags?: string[];
  cards: DeckCard[];
}

/** One card in play: which deck card, which way round, under which id. */
export interface StudyCard {
  /** Progress id: the card's id, + "~r" for the reverse direction. */
  key: string;
  idx: number;
  rev: boolean;
}

const ANSWER_HR = /<hr\b[^>]*\bid\s*=\s*["']?answer["']?[^>]*>/i;
const ANY_HR = /<hr\b[^>]*>/i;

/** The part of a card's back after Anki's answer separator (`<hr id=answer>`,
 *  else the first `<hr>`), or null when there is none. */
export function answerPart(back: string): string | null {
  const m = ANSWER_HR.exec(back) ?? ANY_HR.exec(back);
  if (!m) return null;
  const rest = back.slice(m.index + m[0].length).trim();
  return rest || null;
}

export const stableId = (c: DeckCard) => c.id ?? cardId(c.front, c.back);
export const legacyId = (c: DeckCard) => c.h ?? cardId(c.front, c.back);

/** Can this deck be studied the other way round (answers as questions)? */
export function canReverse(deck: DeckData): boolean {
  const sample = deck.cards.slice(0, 50);
  return sample.length > 0 && sample.filter((c) => answerPart(c.back)).length >= sample.length * 0.8;
}

/** Plain text of some card HTML (for typed answers and the leech list). */
export function htmlText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[sound:[^\]]*\]/g, "");
}

/** First non-empty line of some HTML, as text. */
export function firstLine(html: string): string {
  return (
    htmlText(html)
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .find(Boolean) ?? ""
  );
}

/** The cards in play under `cfg`, in deck order (reverse cards right after
 *  their forward card when both directions are studied). */
export function studyCards(deck: DeckData, cfg: Pick<DeckSettings, "sub" | "tag" | "dir">): StudyCard[] {
  const sub = cfg.sub && deck.subs ? deck.subs.indexOf(cfg.sub) : -1;
  const tag = cfg.tag && deck.tags ? deck.tags.indexOf(cfg.tag) : -1;
  const dir = cfg.dir !== "fwd" && canReverse(deck) ? cfg.dir : "fwd";
  const out: StudyCard[] = [];
  deck.cards.forEach((c, idx) => {
    if (sub >= 0 && c.sb !== sub) return;
    if (tag >= 0 && !c.tg?.includes(tag)) return;
    const id = stableId(c);
    const reversible = !!answerPart(c.back);
    if (dir !== "rev" || !reversible) out.push({ key: id, idx, rev: false });
    if (dir !== "fwd" && reversible) out.push({ key: `${id}~r`, idx, rev: true });
  });
  return out;
}

/** Front and back HTML of a card in play. Reversed: the answer is asked, and
 *  the back shows it above the original question. */
export function faces(card: DeckCard, rev: boolean): { front: string; back: string } {
  if (!rev) return { front: card.front, back: card.back };
  const ans = answerPart(card.back) ?? card.back;
  return { front: ans, back: `${ans}<hr id="answer">${card.front}` };
}

/** What a typed answer is compared with, or null when the card has none. */
export function expectedAnswer(card: DeckCard, rev: boolean, typed: boolean): string | null {
  if (!rev && card.typ) return card.typ;
  if (!typed) return null;
  const text = rev ? firstLine(card.front) : firstLine(answerPart(card.back) ?? "");
  return text || null;
}

/** Progress stored under the old content-hash ids, moved to the stable ids. */
export function migrateDeck(p: Progress, deck: DeckData): Progress {
  return migrateIds(
    p,
    deck.cards.filter((c) => c.id).map((c) => [c.id!, legacyId(c)] as const),
  );
}

/** "voc-en-fr::memrise::les-pays" → "voc-en-fr › memrise › les-pays". */
export const tagLabel = (t: string) => t.split("::").join(" › ");

/** Tag → number of cards, most used first (for the tag picker). */
export function tagCounts(deck: DeckData): [string, number][] {
  const n = new Map<number, number>();
  for (const c of deck.cards) for (const t of c.tg ?? []) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()]
    .map(([i, k]) => [deck.tags?.[i] ?? "", k] as [string, number])
    .filter(([t]) => t)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
