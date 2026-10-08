import { describe, it, expect } from "vitest";
import {
  addDays,
  buildQueue,
  cardId,
  dayKey,
  emptyProgress,
  forecast,
  fromSm2,
  grade,
  isLeech,
  LEECH_LAPSES,
  migrateIds,
  nextReviewDay,
  parseProgress,
  preview,
  schedule,
  setSuspended,
  summarize,
  type CardState,
  type Progress,
} from "./srs";

const T = "2026-09-30";

describe("dates", () => {
  it("adds days across month/year and DST boundaries", () => {
    expect(addDays(T, 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays(T, 0)).toBe(T);
  });
  it("formats the local calendar day", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("cardId", () => {
  it("is stable and content-sensitive", () => {
    expect(cardId("a", "b")).toBe(cardId("a", "b"));
    expect(cardId("a", "b")).not.toBe(cardId("a", "c"));
    // the separator keeps front/back boundaries distinct
    expect(cardId("ab", "")).not.toBe(cardId("a", "b"));
  });
});

const card = (o: Partial<CardState> = {}): CardState => ({
  s: 10,
  d: 5,
  iv: 10,
  reps: 3,
  lapses: 0,
  last: addDays(T, -10),
  due: T,
  ...o,
});

describe("schedule (FSRS)", () => {
  it("introduces a new card from the default initial stabilities", () => {
    expect(schedule(undefined, "again", T)).toMatchObject({ iv: 0, reps: 0, lapses: 0, due: T, last: T });
    expect(schedule(undefined, "hard", T)).toMatchObject({ iv: 1, reps: 1, due: "2026-10-01" });
    expect(schedule(undefined, "good", T)).toMatchObject({ iv: 3, reps: 1, s: 3.173, due: "2026-10-03" });
    expect(schedule(undefined, "easy", T).iv).toBe(16);
    // Difficulty: easier grades start lower.
    const d = (g: "again" | "hard" | "good" | "easy") => schedule(undefined, g, T).d;
    expect(d("again")).toBeGreaterThan(d("hard"));
    expect(d("good")).toBeGreaterThan(d("easy"));
  });

  it("grows the interval on repeated good grades, reviewed on time", () => {
    let s = schedule(undefined, "good", T);
    const ivs = [s.iv];
    for (let i = 0; i < 4; i++) {
      s = schedule(s, "good", s.due);
      ivs.push(s.iv);
    }
    for (let i = 1; i < ivs.length; i++) expect(ivs[i]).toBeGreaterThan(ivs[i - 1]);
    expect(s.reps).toBe(5);
  });

  it("orders intervals hard ≤ good < easy, and previews all four", () => {
    const p = preview(card(), T);
    expect(p.again.iv).toBe(0);
    expect(p.hard.iv).toBeLessThanOrEqual(p.good.iv);
    expect(p.good.iv).toBeLessThan(p.easy.iv);
    expect(schedule(card(), "good", T)).toEqual(p.good);
  });

  it("asks less often at a lower target retention", () => {
    expect(schedule(card(), "good", T, 0.85).iv).toBeGreaterThan(schedule(card(), "good", T, 0.9).iv);
    expect(schedule(card(), "good", T, 0.95).iv).toBeLessThan(schedule(card(), "good", T, 0.9).iv);
  });

  it("on again: due today, a lapse counted, stability cut", () => {
    const s = schedule(card(), "again", T);
    expect(s).toMatchObject({ iv: 0, reps: 0, lapses: 1, due: T });
    expect(s.s).toBeLessThan(10);
    // Failing again the same day (iv 0) is not a second lapse.
    expect(schedule(s, "again", T).lapses).toBe(1);
    expect(isLeech(card({ lapses: LEECH_LAPSES }))).toBe(true);
  });

  it("uses the short-term formula for a same-day review", () => {
    const s = schedule(card({ last: T }), "good", T);
    expect(s.s).toBeGreaterThan(10);
    expect(s.s).toBeLessThan(15);
  });

  it("keeps a suspended card suspended", () => {
    expect(schedule(card({ sus: 1 }), "good", T).sus).toBe(1);
  });
});

describe("SM-2 states", () => {
  it("convert to FSRS memory on read", () => {
    const p = parseProgress(
      JSON.stringify({ v: 1, cards: { a: { ef: 2.5, iv: 6, reps: 2, due: "2026-10-05" } }, newDay: "", newCount: 0 }),
    );
    expect(p.cards.a).toMatchObject({ s: 6, iv: 6, reps: 2, lapses: 0, due: "2026-10-05", last: "2026-09-29" });
    expect(fromSm2({ ef: 1.3, iv: 0, reps: 0, due: T }).d).toBeCloseTo(10);
    expect(fromSm2({ ef: 1.3, iv: 0, reps: 0, due: T }).s).toBeGreaterThan(0);
    expect(fromSm2({ ef: 2.5, iv: 3, reps: 1, due: T }).d).toBeCloseTo(schedule(undefined, "good", T).d, 2);
  });
});

describe("migrateIds / setSuspended", () => {
  it("moves legacy-keyed progress to stable ids, never over existing ones", () => {
    const p: Progress = { v: 1, cards: { old1: card(), old2: card({ reps: 9 }), b: card({ reps: 1 }) }, newDay: "", newCount: 0 };
    const m = migrateIds(p, [
      ["a", "old1"],
      ["b", "old2"],
      ["c", "missing"],
    ]);
    expect(Object.keys(m.cards).sort()).toEqual(["a", "b", "old2"]);
    expect(m.cards.b.reps).toBe(1);
    expect(migrateIds(m, [["a", "old1"]])).toBe(m);
  });

  it("suspends and reactivates; suspended cards leave the queue", () => {
    const p: Progress = { v: 1, cards: { a: card() }, newDay: "", newCount: 0 };
    const s = setSuspended(p, "a", true);
    expect(s.cards.a.sus).toBe(1);
    expect(buildQueue(["a"], s, T)).toEqual([]);
    expect(summarize(["a"], s, T).due).toBe(0);
    expect(setSuspended(s, "a", false).cards.a.sus).toBeUndefined();
  });
});

describe("forecast", () => {
  it("counts reviews per day, overdue on today", () => {
    const states = [card({ due: "2026-09-01" }), card({ due: T }), card({ due: addDays(T, 2) }), card({ due: addDays(T, 9) })];
    expect(forecast(states, T, 7)).toEqual([2, 0, 1, 0, 0, 0, 0]);
  });
});

describe("progress", () => {
  it("parses defensively", () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress("{nope")).toEqual(emptyProgress());
    expect(parseProgress('{"v":2,"cards":{}}')).toEqual(emptyProgress());
    const p = parseProgress(
      JSON.stringify({
        v: 1,
        cards: { a: { ef: 2.5, iv: 1, reps: 1, due: T }, b: { ef: "x" }, c: card() },
        newDay: T,
        newCount: 3,
      }),
    );
    expect(Object.keys(p.cards)).toEqual(["a", "c"]);
    expect(p.cards.c).toEqual(card());
    expect(p.newCount).toBe(3);
  });

  it("counts new cards per day, resetting on a new day", () => {
    let p = grade(emptyProgress(), "a", "good", T);
    p = grade(p, "b", "again", T);
    p = grade(p, "b", "good", T); // not new any more
    expect(p.newCount).toBe(2);
    p = grade(p, "c", "good", addDays(T, 1));
    expect(p).toMatchObject({ newDay: "2026-10-01", newCount: 1 });
  });
});

describe("queue + summary", () => {
  const ids = ["a", "b", "c", "d", "e", "a"];
  const p: Progress = {
    v: 1,
    cards: {
      a: card({ due: T }),
      b: card({ due: "2026-09-20" }),
      c: card({ due: "2026-10-05" }),
    },
    newDay: T,
    newCount: 1,
  };

  it("puts due cards first (most overdue first), then limited new cards, deduped", () => {
    expect(buildQueue(ids, p, T, 2)).toEqual([1, 0, 3]); // 1 new left today
    expect(buildQueue(ids, p, addDays(T, 1), 2)).toEqual([1, 0, 3, 4]);
  });

  it("summarizes due / new-today / learned", () => {
    expect(summarize(ids, p, T, 2)).toEqual({ due: 2, fresh: 1, learned: 3 });
    expect(summarize(ids, emptyProgress(), T)).toEqual({
      due: 0,
      fresh: 5,
      learned: 0,
    });
  });

  it("finds the next review day", () => {
    const all: Progress = {
      ...p,
      cards: { ...p.cards, a: { ...p.cards.a, due: "2026-10-08" } },
    };
    delete all.cards.b;
    expect(nextReviewDay(["a", "c"], all, T)).toBe("2026-10-05");
    expect(nextReviewDay(["a", "c", "z"], all, T)).toBe("2026-10-01"); // unseen → tomorrow
    expect(nextReviewDay([], all, T)).toBeNull();
  });
});
