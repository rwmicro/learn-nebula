import { describe, it, expect } from "vitest";
import {
  addDays,
  buildQueue,
  cardId,
  dayKey,
  emptyProgress,
  grade,
  nextReviewDay,
  parseProgress,
  schedule,
  summarize,
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

describe("schedule (SM-2)", () => {
  it("introduces a new card at 1 day (good/hard) or 4 days (easy)", () => {
    expect(schedule(undefined, "good", T)).toEqual({
      ef: 2.5,
      iv: 1,
      reps: 1,
      due: "2026-10-01",
    });
    expect(schedule(undefined, "hard", T).iv).toBe(1);
    expect(schedule(undefined, "easy", T)).toMatchObject({
      iv: 4,
      reps: 1,
      ef: 2.6,
    });
  });

  it("follows 1 → 6 → ×EF on repeated good grades", () => {
    let s = schedule(undefined, "good", T);
    s = schedule(s, "good", s.due);
    expect(s.iv).toBe(6);
    s = schedule(s, "good", s.due);
    expect(s.iv).toBe(15); // 6 × 2.5
    expect(s.reps).toBe(3);
  });

  it("orders intervals hard < good < easy", () => {
    const base = { ef: 2.5, iv: 10, reps: 3, due: T };
    const [h, g, e] = (["hard", "good", "easy"] as const).map(
      (x) => schedule(base, x, T).iv,
    );
    expect(h).toBeLessThan(g);
    expect(g).toBeLessThan(e);
  });

  it("resets on again: due today, reps 0, ease lowered but floored at 1.3", () => {
    const s = schedule({ ef: 2.5, iv: 20, reps: 4, due: T }, "again", T);
    expect(s).toMatchObject({ iv: 0, reps: 0, due: T });
    expect(s.ef).toBeCloseTo(1.96);
    let low = s;
    for (let i = 0; i < 5; i++) low = schedule(low, "again", T);
    expect(low.ef).toBe(1.3);
  });

  it("always grows a passed interval", () => {
    const s = schedule({ ef: 1.3, iv: 2, reps: 2, due: T }, "hard", T);
    expect(s.iv).toBeGreaterThan(2);
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
        cards: { a: { ef: 2.5, iv: 1, reps: 1, due: T }, b: { ef: "x" } },
        newDay: T,
        newCount: 3,
      }),
    );
    expect(Object.keys(p.cards)).toEqual(["a"]);
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
      a: { ef: 2.5, iv: 1, reps: 1, due: T },
      b: { ef: 2.5, iv: 6, reps: 2, due: "2026-09-20" },
      c: { ef: 2.5, iv: 6, reps: 2, due: "2026-10-05" },
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
