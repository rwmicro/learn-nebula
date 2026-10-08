import { describe, it, expect } from "vitest";
import { DECK_DEFAULTS, deckSettings, emptySettings, parseSettings, withDeck } from "./srs-settings";
import { getRetention, setRetention } from "./srs";

describe("srs settings", () => {
  it("parses defensively", () => {
    expect(parseSettings(null)).toEqual(emptySettings());
    expect(parseSettings("{x")).toEqual(emptySettings());
    const s = parseSettings(
      JSON.stringify({ retention: 0.85, decks: { a: { newPerDay: 5, dir: "both", typed: true, bogus: 1 }, b: { newPerDay: -3 } } }),
    );
    expect(s.retention).toBe(0.85);
    expect(s.decks).toEqual({ a: { newPerDay: 5, dir: "both", typed: true } });
    expect(parseSettings('{"retention":0.5}').retention).toBe(0.9);
  });

  it("stores only what differs from the defaults", () => {
    let s = withDeck(emptySettings(), "a", { paused: true, newPerDay: 20 });
    expect(s.decks).toEqual({ a: { paused: true } });
    expect(deckSettings(s, "a")).toEqual({ ...DECK_DEFAULTS, paused: true });
    s = withDeck(s, "a", { paused: false });
    expect(s.decks).toEqual({});
  });

  it("only accepts known retentions", () => {
    setRetention(0.95);
    expect(getRetention()).toBe(0.95);
    setRetention(0.42);
    expect(getRetention()).toBe(0.95);
    setRetention(0.9);
  });
});
