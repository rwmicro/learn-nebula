import { describe, expect, it } from "vitest";
import {
  addHighlight,
  bumpActivity,
  calendarDays,
  currentRun,
  isBookmarked,
  listBookmarks,
  listHighlights,
  mergeActivity,
  mergeBookmarks,
  mergeHighlights,
  parseActivity,
  parseBookmarks,
  parseHighlights,
  toggleBookmark,
  updateHighlight,
} from "./personal";
import { mergeValue, validateImport } from "./progress-transfer";

describe("bookmarks", () => {
  it("toggles with a tombstone, and the newest wins on merge", () => {
    let s = toggleBookmark({}, "a/b", "B", 1_000_000);
    expect(isBookmarked(s, "a/b")).toBe(true);
    const old = s;
    s = toggleBookmark(s, "a/b", "B", 2_000_000);
    expect(isBookmarked(s, "a/b")).toBe(false);
    // An older copy from another device does not bring it back.
    expect(isBookmarked(mergeBookmarks(s, old), "a/b")).toBe(false);
    expect(isBookmarked(mergeBookmarks(old, s), "a/b")).toBe(false);
    expect(listBookmarks(s)).toEqual([]);
  });
  it("drops junk", () => {
    expect(parseBookmarks({ x: { t: "no" }, y: { t: 5, title: "Y" } })).toEqual({ y: { t: 5, title: "Y" } });
  });
});

describe("highlights", () => {
  it("adds, annotates, removes, merges", () => {
    const { store, id } = addHighlight({}, "n", "Note", "  un   passage  ", 1_000_000);
    expect(store.n.items[id].q).toBe("un passage");
    const noted = updateHighlight(store, "n", id, { n: "à revoir" }, 1_000_000);
    expect(noted.n.items[id].n).toBe("à revoir");
    expect(noted.n.items[id].t).toBeGreaterThan(store.n.items[id].t);
    const gone = updateHighlight(noted, "n", id, { del: true }, 1_001_000);
    expect(listHighlights(gone)).toEqual([]);
    expect(listHighlights(mergeHighlights(gone, noted))).toEqual([]);
    expect(listHighlights(mergeHighlights(noted, {}))[0].n).toBe("à revoir");
    expect(parseHighlights(JSON.parse(JSON.stringify(noted)))).toEqual(noted);
  });
});

describe("activity", () => {
  it("counts per day and merges by the larger count", () => {
    let a = bumpActivity({}, "2026-10-01", "r");
    a = bumpActivity(a, "2026-10-01", "c", 3);
    expect(a["2026-10-01"]).toEqual({ r: 1, c: 3 });
    expect(mergeActivity(a, { "2026-10-01": { r: 2 }, "2026-10-02": { c: 1 } })).toEqual({
      "2026-10-01": { r: 2, c: 3 },
      "2026-10-02": { c: 1 },
    });
    expect(parseActivity({ bad: { r: 1 }, "2026-10-03": { r: -1, c: 2 } })).toEqual({ "2026-10-03": { c: 2 } });
  });
  it("runs of active days end today or yesterday", () => {
    const days = calendarDays({ "2026-10-05": { c: 1 }, "2026-10-06": { r: 1 } }, []);
    expect(currentRun(days, "2026-10-07")).toBe(2);
    expect(currentRun(days, "2026-10-06")).toBe(2);
    expect(currentRun(days, "2026-10-09")).toBe(0);
  });
});

describe("transfer", () => {
  it("imports and merges the new kinds", () => {
    const v = validateImport({
      format: "jardin-progression",
      version: 1,
      exportedAt: "",
      items: {
        gkBookmarks: { a: { t: 1, title: "A" } },
        gkHighlights: { a: { title: "A", items: { x: { q: "q", t: 1 } } } },
        gkActivity: { "2026-10-01": { r: 1 } },
      },
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(Object.keys(v.file.items).sort()).toEqual(["gkActivity", "gkBookmarks", "gkHighlights"]);
    expect(mergeValue("gkActivity", { "2026-10-01": { r: 3 } }, v.file.items.gkActivity)).toEqual({
      "2026-10-01": { r: 3 },
    });
  });
});
