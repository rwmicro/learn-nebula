import { describe, it, expect } from "vitest";
import {
  ancestorsOf,
  descendantsOf,
  hasPlacement,
  markKnown,
  nextPlacementNote,
  nextToReadIn,
  noteState,
  noteStates,
  parseKnown,
  parseTargets,
  placementBlocked,
  placementRemaining,
  progressCounts,
  resetPlacement,
  splitMinutes,
  targetPlan,
  unmarkKnown,
  type PlacementAnswer,
  type StudyNote,
} from "./path-study";
import { emptyNoteDeck, recordCorrect, type NoteDeck } from "./note-quiz";

//   a → b → d → e
//   a → c → d
//   f (alone, after a)  a → f
const notes: StudyNote[] = [
  { slug: "a", prereqs: [], minutes: 10 },
  { slug: "b", prereqs: ["a"], minutes: 20 },
  { slug: "c", prereqs: ["a"], minutes: 5, quiz: ["q1", "q2"] },
  { slug: "f", prereqs: ["a"], minutes: 3 },
  { slug: "d", prereqs: ["b", "c"], minutes: 40 },
  { slug: "e", prereqs: ["d"], minutes: 50 },
];

describe("ancestors / descendants", () => {
  it("collects every transitive prerequisite, the note excluded", () => {
    expect([...ancestorsOf("e", notes)].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...ancestorsOf("a", notes)]).toEqual([]);
    expect([...ancestorsOf("f", notes)]).toEqual(["a"]);
  });
  it("collects every transitive dependent", () => {
    expect([...descendantsOf("a", notes)].sort()).toEqual(["b", "c", "d", "e", "f"]);
    expect([...descendantsOf("c", notes)].sort()).toEqual(["d", "e"]);
    expect([...descendantsOf("e", notes)]).toEqual([]);
  });
  it("survives a cycle left in the data", () => {
    const cyc: StudyNote[] = [
      { slug: "x", prereqs: ["y"] },
      { slug: "y", prereqs: ["x"] },
    ];
    expect([...ancestorsOf("x", cyc)]).toEqual(["y"]);
  });
});

describe("states", () => {
  it("ranks maîtrisée > lue > connue > non lue", () => {
    expect(noteState({ read: true, known: true, mastered: true })).toBe("mastered");
    expect(noteState({ read: true, known: true, mastered: false })).toBe("read");
    expect(noteState({ read: false, known: true, mastered: false })).toBe("known");
    expect(noteState({ read: false, known: false, mastered: false })).toBe("unread");
  });

  it("derives mastery from the quiz answers: every question right once", () => {
    let deck: NoteDeck = recordCorrect(emptyNoteDeck(), "q1", "2026-10-01");
    const src = (d: NoteDeck) => ({
      isRead: (s: string) => s === "c" || s === "a",
      isKnown: (s: string) => s === "b",
      deckOf: (s: string) => (s === "c" ? d : null),
    });
    let st = noteStates(notes, src(deck));
    expect(st.get("c")).toBe("read"); // one of two questions
    deck = recordCorrect(deck, "q2", "2026-10-01");
    st = noteStates(notes, src(deck));
    expect(st.get("c")).toBe("mastered");
    expect(st.get("a")).toBe("read"); // no questions: lue at most
    expect(st.get("b")).toBe("known");
    expect(st.get("d")).toBe("unread");
  });

  it("counts read, known and mastered for the progress line", () => {
    const states = new Map([
      ["a", "read"],
      ["b", "known"],
      ["c", "mastered"],
    ] as const);
    expect(progressCounts(["a", "b", "c", "d"], new Map(states))).toEqual({
      read: 2,
      known: 1,
      mastered: 1,
      done: 3,
      total: 4,
    });
  });
});

describe("next to read and target", () => {
  const doneOf = (set: string[]) => (s: string) => set.includes(s);
  it("treats known notes like read ones", () => {
    expect(nextToReadIn(notes, doneOf([]))).toBe("a");
    expect(nextToReadIn(notes, doneOf(["a"]))).toBe("b");
    expect(nextToReadIn(notes, doneOf(["a", "b", "f"]))).toBe("c");
    expect(nextToReadIn(notes, doneOf(["a", "b", "c", "d", "e", "f"]))).toBeNull();
  });
  it("lists the target's unread ancestors with their reading time", () => {
    const p = targetPlan(notes, "d", doneOf(["a", "c"]));
    expect([...p.scope].sort()).toEqual(["a", "b", "c", "d"]);
    expect(p.todo).toEqual(["b", "d"]);
    expect(p.minutes).toBe(60);
    expect(targetPlan(notes, "f", doneOf(["a", "f"])).todo).toEqual([]);
  });
  it("formats minutes as hours and minutes", () => {
    expect(splitMinutes(125)).toEqual({ h: 2, m: 5 });
    expect(splitMinutes(45)).toEqual({ h: 0, m: 45 });
  });
});

describe("placement walk", () => {
  it("asks in reading order and skips what is already done", () => {
    expect(nextPlacementNote(notes, {})).toBe("a");
    expect(nextPlacementNote(notes, {}, (s) => s === "a")).toBe("b");
  });
  it("stops descending below a no", () => {
    const answers: Record<string, PlacementAnswer> = { a: "yes", b: "no" };
    expect([...placementBlocked(notes, answers)].sort()).toEqual(["d", "e"]);
    expect(nextPlacementNote(notes, answers)).toBe("c");
    answers.c = "yes";
    expect(nextPlacementNote(notes, answers)).toBe("f");
    answers.f = "unsure"; // not sure: not known, but keeps descending
    expect(nextPlacementNote(notes, answers)).toBeNull();
  });
  it("a no at the root ends the test", () => {
    expect(nextPlacementNote(notes, { a: "no" })).toBeNull();
    expect(placementRemaining(notes, {})).toBe(6);
    expect(placementRemaining(notes, { a: "yes", c: "no" })).toBe(2); // b, f
  });
});

describe("known store", () => {
  it("parses defensively", () => {
    expect(parseKnown("nope")).toEqual({});
    expect(parseKnown('{"a":{"t":1,"via":"p"},"b":{"x":1},"c":{"t":2}}')).toEqual({
      a: { t: 1, via: "p" },
      c: { t: 2 },
    });
    expect(parseTargets('{"p":"a","q":3}')).toEqual({ p: "a" });
  });
  it("resets only the marks a path's placement set", () => {
    let k = markKnown({}, "a", undefined, 1000);
    k = markKnown(k, "b", "p", 1000);
    k = markKnown(k, "c", "other", 1000);
    k = markKnown(k, "a", "p", 2000); // a hand mark stays a hand mark
    expect(hasPlacement(k, "p")).toBe(true);
    const r = resetPlacement(k, "p");
    expect(Object.keys(r).sort()).toEqual(["a", "c"]);
    expect(hasPlacement(r, "p")).toBe(false);
    expect(unmarkKnown(r, "a")).toEqual({ c: { t: 1, via: "other" } });
  });
});
