/**
 * Study settings for the decks and note questions — pure apart from the small
 * storage helpers, shared by the deck page (components/Flashcards.tsx), the
 * combined session (components/TodayReview.tsx) and /cartes/.
 *
 * One localStorage entry, `srsSettings`: the target retention every review
 * schedules with (lib/srs.ts), and per-deck choices. Preferences, not
 * progress: lib/progress-transfer.ts leaves the key out (its name has no
 * "srs:" prefix on purpose — that prefix means deck progress there).
 */
import { DEFAULT_RETENTION, NEW_PER_DAY, RETENTIONS, setRetention } from "./srs";

export const SETTINGS_KEY = "srsSettings";

/** Which side of a card is asked: the deck's own, the answer side, or both
 *  (each direction scheduled on its own). */
export type Direction = "fwd" | "rev" | "both";
export const DIRECTIONS: readonly Direction[] = ["fwd", "rev", "both"];

export interface DeckSettings {
  /** New cards introduced per day (0 = only reviews). */
  newPerDay: number;
  /** Left out of "Tout réviser" and the /cartes/ totals. */
  paused: boolean;
  /** Sub-deck (Anki "Root::Sub" minus the root), "" = the whole deck. */
  sub: string;
  /** Anki tag, "" = any. */
  tag: string;
  dir: Direction;
  /** Type the answer before revealing it. */
  typed: boolean;
  /** Play the card's first audio clip when it is shown. */
  autoplay: boolean;
}

export const DECK_DEFAULTS: DeckSettings = {
  newPerDay: NEW_PER_DAY,
  paused: false,
  sub: "",
  tag: "",
  dir: "fwd",
  typed: false,
  autoplay: false,
};

export const NEW_PER_DAY_CHOICES = [0, 5, 10, 20, 30, 50] as const;

export interface SrsSettings {
  retention: number;
  decks: Record<string, Partial<DeckSettings>>;
}

export function emptySettings(): SrsSettings {
  return { retention: DEFAULT_RETENTION, decks: {} };
}

function cleanDeck(x: unknown): Partial<DeckSettings> {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const out: Partial<DeckSettings> = {};
  if (typeof o.newPerDay === "number" && Number.isInteger(o.newPerDay) && o.newPerDay >= 0 && o.newPerDay <= 999)
    out.newPerDay = o.newPerDay;
  if (typeof o.paused === "boolean") out.paused = o.paused;
  if (typeof o.sub === "string") out.sub = o.sub;
  if (typeof o.tag === "string") out.tag = o.tag;
  if (DIRECTIONS.includes(o.dir as Direction)) out.dir = o.dir as Direction;
  if (typeof o.typed === "boolean") out.typed = o.typed;
  if (typeof o.autoplay === "boolean") out.autoplay = o.autoplay;
  return out;
}

export function parseSettings(raw: string | null): SrsSettings {
  const s = emptySettings();
  if (!raw) return s;
  try {
    const o = JSON.parse(raw) as { retention?: unknown; decks?: unknown };
    if (RETENTIONS.includes(o.retention as (typeof RETENTIONS)[number])) s.retention = o.retention as number;
    if (o.decks && typeof o.decks === "object" && !Array.isArray(o.decks))
      for (const [slug, d] of Object.entries(o.decks)) {
        const c = cleanDeck(d);
        if (Object.keys(c).length) s.decks[slug] = c;
      }
  } catch {
    /* malformed: defaults */
  }
  return s;
}

export function deckSettings(s: SrsSettings, slug: string): DeckSettings {
  return { ...DECK_DEFAULTS, ...s.decks[slug] };
}

/** Change some of a deck's settings; values equal to the default are dropped. */
export function withDeck(s: SrsSettings, slug: string, patch: Partial<DeckSettings>): SrsSettings {
  const merged = { ...deckSettings(s, slug), ...patch };
  const stored: Partial<DeckSettings> = {};
  for (const k of Object.keys(merged) as (keyof DeckSettings)[])
    if (merged[k] !== DECK_DEFAULTS[k]) (stored as Record<string, unknown>)[k] = merged[k];
  const decks = { ...s.decks };
  if (Object.keys(stored).length) decks[slug] = stored;
  else delete decks[slug];
  return { ...s, decks };
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** Read the settings, and make their retention the one lib/srs.ts schedules
 *  with by default. */
export function loadSettings(store?: Store): SrsSettings {
  let s: SrsSettings;
  try {
    s = parseSettings((store ?? localStorage).getItem(SETTINGS_KEY));
  } catch {
    s = emptySettings();
  }
  setRetention(s.retention);
  return s;
}

export function saveSettings(s: SrsSettings, store?: Store): void {
  setRetention(s.retention);
  try {
    (store ?? localStorage).setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
}
