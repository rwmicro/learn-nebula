import { describe, expect, it } from "vitest";
import { deckMastery, KNOWN_DAYS } from "./review-item";
import { parseProgress, type CardState } from "./srs";

const card = (iv: number): CardState => ({ s: iv, d: 5, iv, reps: 1, lapses: 0, last: "2026-10-01", due: "2026-11-01" });

describe("deckMastery", () => {
  it("splits seen cards at KNOWN_DAYS and counts the rest as unseen", () => {
    const p = parseProgress(null);
    p.cards = { a: card(KNOWN_DAYS), b: card(KNOWN_DAYS - 1), c: card(0) };
    expect(deckMastery(p, 10, { dir: "fwd" })).toEqual({ known: 1, learning: 2, unseen: 7 });
  });
  it("doubles the deck when both directions are studied", () => {
    expect(deckMastery(parseProgress(null), 10, { dir: "both" }).unseen).toBe(20);
  });
  it("never goes below zero unseen", () => {
    const p = parseProgress(null);
    p.cards = { a: card(1), b: card(1), c: card(1) };
    expect(deckMastery(p, 2, { dir: "fwd" }).unseen).toBe(0);
  });
});
