import { describe, it, expect } from "vitest";
import { logReview, mergeLogs, parseLog, successRate, LOG_DAYS } from "./srs-log";
import { addDays } from "./srs";

const T = "2026-10-08";

describe("review log", () => {
  it("counts reviews and failures per day, and takes them back", () => {
    let log = logReview({}, T, "good");
    log = logReview(log, T, "again");
    expect(log[T]).toEqual([2, 1]);
    log = logReview(log, T, "again", true);
    expect(log[T]).toEqual([1, 0]);
    log = logReview(log, T, "good", true);
    expect(log[T]).toBeUndefined();
  });

  it("drops days past the window", () => {
    const log = logReview({ [addDays(T, -LOG_DAYS - 1)]: [3, 0], [addDays(T, -2)]: [1, 0] }, T, "good");
    expect(Object.keys(log).sort()).toEqual([addDays(T, -2), T]);
  });

  it("computes the success rate over the last days", () => {
    const log = { [T]: [4, 1], [addDays(T, -29)]: [6, 2], [addDays(T, -30)]: [10, 10] } as Record<string, [number, number]>;
    expect(successRate(log, T)).toEqual({ reviews: 10, ok: 7 });
  });

  it("parses defensively and merges", () => {
    expect(parseLog('{"2026-10-08":[2,1],"x":[1,0],"2026-10-07":[1,5]}')).toEqual({ [T]: [2, 1] });
    expect(parseLog("nope")).toEqual({});
    expect(mergeLogs({ [T]: [2, 0] }, { [T]: [5, 1], "2026-10-01": [1, 0] })).toEqual({ [T]: [5, 1], "2026-10-01": [1, 0] });
  });
});
