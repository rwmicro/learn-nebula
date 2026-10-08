import { describe, it, expect } from "vitest";
import {
  answerPart,
  canReverse,
  expectedAnswer,
  faces,
  firstLine,
  migrateDeck,
  studyCards,
  tagCounts,
  type DeckData,
} from "./deck-cards";
import { cardId, emptyProgress, schedule } from "./srs";

const card = (front: string, answer: string, extra = {}) => ({
  id: `g${front}:0`,
  front,
  back: `${front}<hr id=answer>${answer}`,
  ...extra,
});

const deck: DeckData = {
  name: "D",
  css: "",
  subs: ["Lesson 1", "Lesson 2"],
  tags: ["verbs", "basic"],
  cards: [
    card("aller", "to go<br>irregular", { sb: 0, tg: [0, 1] }),
    card("maison", "house", { sb: 1, tg: [1] }),
    card("chat", "cat", { sb: 1, typ: "cat" }),
  ],
};

describe("deck cards", () => {
  it("splits the answer at Anki's separator", () => {
    expect(answerPart("Q<hr id=answer>A")).toBe("A");
    expect(answerPart('Q<hr id="answer">A')).toBe("A");
    expect(answerPart("Q<hr>A")).toBe("A");
    expect(answerPart("just a back")).toBeNull();
    expect(firstLine("<div>to go<br>irregular</div>")).toBe("to go");
  });

  it("filters by sub-deck and tag, and adds reverse cards", () => {
    const all = { sub: "", tag: "", dir: "fwd" as const };
    expect(studyCards(deck, all).map((c) => c.key)).toEqual(["galler:0", "gmaison:0", "gchat:0"]);
    expect(studyCards(deck, { ...all, sub: "Lesson 2" }).map((c) => c.idx)).toEqual([1, 2]);
    expect(studyCards(deck, { ...all, tag: "verbs" }).map((c) => c.idx)).toEqual([0]);
    expect(studyCards(deck, { ...all, dir: "rev" }).map((c) => c.key)).toEqual(["galler:0~r", "gmaison:0~r", "gchat:0~r"]);
    expect(studyCards(deck, { ...all, dir: "both" })).toHaveLength(6);
    expect(canReverse(deck)).toBe(true);
    const plain: DeckData = { name: "P", css: "", cards: [{ front: "a", back: "b" }] };
    expect(canReverse(plain)).toBe(false);
    expect(studyCards(plain, { ...all, dir: "rev" }).map((c) => c.rev)).toEqual([false]);
  });

  it("builds the reversed faces and the typed-answer target", () => {
    const c = deck.cards[1];
    expect(faces(c, true)).toEqual({ front: "house", back: 'house<hr id="answer">maison' });
    expect(faces(c, false)).toEqual({ front: c.front, back: c.back });
    expect(expectedAnswer(deck.cards[0], false, true)).toBe("to go");
    expect(expectedAnswer(deck.cards[0], false, false)).toBeNull();
    expect(expectedAnswer(deck.cards[2], false, false)).toBe("cat"); // {{type:}} template
    expect(expectedAnswer(c, true, true)).toBe("maison");
  });

  it("moves progress from the legacy content hash to the stable id", () => {
    const c = deck.cards[0];
    const p = emptyProgress();
    p.cards[cardId(c.front, c.back)] = schedule(undefined, "good", "2026-10-01");
    p.cards.other = schedule(undefined, "good", "2026-10-01");
    const m = migrateDeck(p, deck);
    expect(Object.keys(m.cards).sort()).toEqual(["galler:0", "other"]);
    expect(migrateDeck(m, deck)).toBe(m);
  });

  it("counts tags, most used first", () => {
    expect(tagCounts(deck)).toEqual([
      ["basic", 2],
      ["verbs", 1],
    ]);
  });
});
