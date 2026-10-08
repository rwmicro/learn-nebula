// The account's profile picture: a small animated sprout ("le petit
// jardinier") drawn in SVG, plus the catalogue of what can be bought for it
// with coins. Shared by the server (prices, ownership checks, validation of a
// saved look — server/accounts/) and the browser (components/Avatar.tsx draws
// it). Pure, so it is unit-tested (avatar.test.ts).

export type Slot = "body" | "hat" | "accessory" | "background";

export interface Item {
  id: string;
  slot: Slot;
  /** i18n key under `avatar.items.` */
  name: string;
  /** Coins; 0 = owned by everyone from the start. */
  price: number;
}

/** Everything the shop sells, in display order within each slot. The ids are
 *  stored in the database: never rename one, only add. */
export const ITEMS: Item[] = [
  // Body colours. Three are free so a new account already has a choice.
  { id: "body-leaf", slot: "body", name: "leaf", price: 0 },
  { id: "body-sky", slot: "body", name: "sky", price: 0 },
  { id: "body-sun", slot: "body", name: "sun", price: 0 },
  { id: "body-plum", slot: "body", name: "plum", price: 60 },
  { id: "body-coral", slot: "body", name: "coral", price: 60 },
  { id: "body-ink", slot: "body", name: "ink", price: 120 },
  // Hats.
  { id: "hat-none", slot: "hat", name: "none", price: 0 },
  { id: "hat-beret", slot: "hat", name: "beret", price: 80 },
  { id: "hat-cap", slot: "hat", name: "cap", price: 150 },
  { id: "hat-wizard", slot: "hat", name: "wizard", price: 250 },
  { id: "hat-crown", slot: "hat", name: "crown", price: 500 },
  // Accessories.
  { id: "acc-none", slot: "accessory", name: "none", price: 0 },
  { id: "acc-glasses", slot: "accessory", name: "glasses", price: 60 },
  { id: "acc-scarf", slot: "accessory", name: "scarf", price: 100 },
  { id: "acc-book", slot: "accessory", name: "book", price: 150 },
  // Backgrounds.
  { id: "bg-paper", slot: "background", name: "paper", price: 0 },
  { id: "bg-garden", slot: "background", name: "garden", price: 100 },
  { id: "bg-night", slot: "background", name: "night", price: 200 },
];

/** Not an avatar part, but sold in the same shop: one missed day that does
 *  not break the streak. At most MAX_FREEZES held at once. */
export const STREAK_FREEZE = { id: "streak-freeze", name: "freeze", price: 100 };
export const MAX_FREEZES = 2;

/** Streak length → bonus, paid on the day the run reaches it. Here rather
 *  than in server/accounts.ts so the account page can show the next one. */
export const STREAK_MILESTONES: Record<number, number> = { 7: 50, 30: 200, 100: 500 };

export const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export interface Look {
  body: string;
  hat: string;
  accessory: string;
  background: string;
}

export const FREE_IDS = ITEMS.filter((i) => i.price === 0).map((i) => i.id);

/** The look a fresh account gets, picked from the free colours by a seed (the
 *  user id) so two new readers don't all look the same. */
export function defaultLook(seed = 0): Look {
  const bodies = ITEMS.filter((i) => i.slot === "body" && i.price === 0);
  return {
    body: bodies[Math.abs(Math.trunc(seed)) % bodies.length].id,
    hat: "hat-none",
    accessory: "acc-none",
    background: "bg-paper",
  };
}

/** A saved look → a valid one: every part must exist, sit in its own slot and
 *  be owned (free parts always are). Anything else falls back to the default
 *  for that slot. */
export function sanitizeLook(
  input: unknown,
  owned: Iterable<string>,
  seed = 0,
): Look {
  const have = new Set([...FREE_IDS, ...owned]);
  const base = defaultLook(seed);
  const src = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const out = { ...base };
  for (const slot of ["body", "hat", "accessory", "background"] as const) {
    const id = src[slot];
    const item = typeof id === "string" ? ITEM_BY_ID.get(id) : undefined;
    if (item && item.slot === slot && have.has(item.id)) out[slot] = item.id;
  }
  return out;
}

/** Fill colours of each body item: [body, shade, cheek]. */
export const BODY_COLORS: Record<string, [string, string, string]> = {
  "body-leaf": ["#7fb069", "#5e8f4c", "#f2a7a0"],
  "body-sky": ["#7fb3d5", "#5a8fb3", "#f2a7a0"],
  "body-sun": ["#f2c25b", "#d39f35", "#ee8f7d"],
  "body-plum": ["#a984c4", "#8562a3", "#f3a6c0"],
  "body-coral": ["#ef8e78", "#cc6a55", "#f9c0a8"],
  "body-ink": ["#4d5a73", "#343f55", "#d98c98"],
};
