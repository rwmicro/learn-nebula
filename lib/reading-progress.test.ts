import { describe, expect, it } from "vitest";
import type { HomeTreeNode } from "./content";
import {
  MAX_ENTRIES,
  STORAGE_KEY,
  folderReadCounts,
  isRead,
  loadStore,
  markRead,
  markUnread,
  minDwellMs,
  nextToRead,
  parseStore,
  pruneStore,
  recordProgress,
  resumeCandidate,
  saveStore,
  savedProgress,
  scrollProgress,
  scrollTopFor,
  serializeStore,
  shouldMarkRead,
  slugFromHref,
  type ReadingStore,
} from "./reading-progress";

const T0 = Date.UTC(2026, 9, 1, 12); // ms
const S0 = T0 / 1000;

describe("scrollProgress", () => {
  it("matches the progress bar: 0 before the body, 1 once its end is in view", () => {
    expect(scrollProgress(200, 3000, 800)).toBe(0);
    expect(scrollProgress(0, 3000, 800)).toBe(0);
    expect(scrollProgress(-1100, 3000, 800)).toBe(0.5);
    expect(scrollProgress(-2200, 3000, 800)).toBe(1);
    expect(scrollProgress(-5000, 3000, 800)).toBe(1);
  });
  it("treats a body shorter than the viewport as read once its top is reached", () => {
    expect(scrollProgress(10, 400, 800)).toBe(0);
    expect(scrollProgress(0, 400, 800)).toBe(1);
  });
  it("round-trips with scrollTopFor", () => {
    // body starts 300px down the document; at scrollY=y its rect top is 300-y.
    const y = scrollTopFor(0.42, 300, 3000, 800);
    expect(scrollProgress(300 - y, 3000, 800)).toBeCloseTo(0.42, 3);
  });
});

describe("parseStore", () => {
  it("drops junk without throwing", () => {
    expect(parseStore(null)).toEqual({});
    expect(parseStore("{nope")).toEqual({});
    expect(parseStore("[1,2]")).toEqual({});
    expect(
      parseStore(JSON.stringify({ a: { p: 1500, t: 1.4 }, b: "x", c: { p: "z", t: 1 }, d: { p: 10, t: 2, r: 3 } })),
    ).toEqual({ a: { p: 1000, t: 1 }, d: { p: 10, t: 2, r: 3 } });
  });
});

describe("progress / read state", () => {
  it("records progress in permille and seconds", () => {
    const s = recordProgress({}, "a/b", 0.4237, T0);
    expect(s["a/b"]).toEqual({ p: 424, t: S0 });
    expect(savedProgress(s, "a/b")).toBe(0.424);
  });

  it("does not resume a glance", () => {
    expect(savedProgress(recordProgress({}, "a", 0.01, T0), "a")).toBeNull();
  });

  it("keeps a read note read when it is visited again", () => {
    let s = markRead({}, "a", T0);
    s = recordProgress(s, "a", 0.3, T0 + 5000);
    expect(isRead(s, "a")).toBe(true);
    expect(s.a.r).toBe(S0);
    expect(savedProgress(s, "a")).toBeNull();
  });

  it("marks unread by forgetting the note", () => {
    const s = markUnread(markRead({ b: { p: 1, t: 1 } }, "a", T0), "a");
    expect(s).toEqual({ b: { p: 1, t: 1 } });
    expect(isRead(s, "a")).toBe(false);
    expect(isRead(s, null)).toBe(false);
  });

  it("needs both the end of the note and a minimum dwell", () => {
    expect(minDwellMs(1)).toBe(15_000);
    expect(minDwellMs(0.1)).toBe(10_000);
    expect(minDwellMs(60)).toBe(90_000);
    expect(minDwellMs(NaN)).toBe(15_000);
    expect(shouldMarkRead(0.95, 20_000, 1)).toBe(true);
    expect(shouldMarkRead(0.95, 5_000, 1)).toBe(false);
    expect(shouldMarkRead(0.5, 600_000, 1)).toBe(false);
  });
});

describe("resumeCandidate", () => {
  const store: ReadingStore = {
    old: { p: 400, t: 10 },
    recent: { p: 300, t: 30 },
    read: { p: 0, t: 99, r: 99 },
    glance: { p: 10, t: 98 },
    almostDone: { p: 950, t: 97 },
    gone: { p: 500, t: 96 },
  };
  it("picks the most recent unfinished note that still exists", () => {
    expect(resumeCandidate(store, (s) => s !== "gone")).toEqual({ slug: "recent", progress: 0.3 });
    expect(resumeCandidate({})).toBeNull();
  });
});

describe("pruneStore", () => {
  it("evicts unfinished notes before read ones, oldest first", () => {
    const s: ReadingStore = {
      r1: { p: 0, t: 1, r: 1 },
      u1: { p: 100, t: 5 },
      u2: { p: 100, t: 9 },
      r2: { p: 0, t: 2, r: 2 },
    };
    expect(Object.keys(pruneStore(s, 3)).sort()).toEqual(["r1", "r2", "u2"]);
    expect(Object.keys(pruneStore(s, 2)).sort()).toEqual(["r1", "r2"]);
    expect(pruneStore(s, 10)).toBe(s);
  });

  it("caps the serialized store", () => {
    const big: ReadingStore = {};
    for (let i = 0; i < MAX_ENTRIES + 50; i++) big[`n${i}`] = { p: 100, t: i };
    expect(Object.keys(JSON.parse(serializeStore(big)))).toHaveLength(MAX_ENTRIES);
  });
});

describe("slugFromHref", () => {
  it("extracts note slugs only", () => {
    expect(slugFromHref("/posts/a/b-c/")).toBe("a/b-c");
    expect(slugFromHref("/posts/a/b-c/#reprendre")).toBe("a/b-c");
    expect(slugFromHref("https://4d52.net/posts/x/?q=1")).toBe("x");
    expect(slugFromHref("/themes/x/")).toBeNull();
    expect(slugFromHref("/posts/")).toBeNull();
    expect(slugFromHref(undefined)).toBeNull();
  });
});

describe("folderReadCounts", () => {
  const tree: HomeTreeNode[] = [
    {
      type: "dir",
      name: "Applied Sciences",
      path: "Applied Sciences",
      count: 4,
      children: [
        {
          type: "dir",
          name: "Maths",
          path: "Applied Sciences/Maths",
          count: 3,
          children: [
            { type: "note", title: "A", href: "/posts/as/maths/a/" },
            { type: "note", title: "B", href: "/posts/as/maths/b/" },
            { type: "note", title: "Deck", href: "/cartes/x/", deck: true },
          ],
        },
        { type: "note", title: "C", href: "/posts/as/c/" },
      ],
    },
  ];
  it("counts read notes per folder, decks and assets excluded", () => {
    const c = folderReadCounts(tree, markRead(markRead({}, "as/maths/a"), "as/c"));
    expect(c.get("Applied Sciences/Maths")).toEqual({ read: 1, total: 2 });
    expect(c.get("Applied Sciences")).toEqual({ read: 2, total: 3 });
  });
});

describe("nextToRead", () => {
  const path = [
    { slug: "f", prereqs: [] },
    { slug: "s", prereqs: [] },
    { slug: "l", prereqs: ["f", "s"] },
    { slug: "d", prereqs: ["l"] },
  ];
  it("is the first unread note whose prerequisites are all read", () => {
    expect(nextToRead(path, {})).toBe("f");
    expect(nextToRead(path, markRead({}, "f"))).toBe("s");
    expect(nextToRead(path, markRead(markRead({}, "f"), "s"))).toBe("l");
  });
  it("skips notes read out of order, and is null once all are read", () => {
    // d read early, l still blocked by s: s comes next.
    expect(nextToRead(path, markRead(markRead({}, "f"), "d"))).toBe("s");
    const all = ["f", "s", "l", "d"].reduce((st, s) => markRead(st, s), {} as ReadingStore);
    expect(nextToRead(path, all)).toBeNull();
  });
});

describe("loadStore / saveStore", () => {
  it("round-trips through a storage and survives a throwing one", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    expect(saveStore(markRead({}, "a", T0), storage)).toBe(true);
    expect(mem.has(STORAGE_KEY)).toBe(true);
    expect(isRead(loadStore(storage), "a")).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadStore(broken)).toEqual({});
    expect(saveStore({}, broken)).toBe(false);
    expect(saveStore({}, null)).toBe(false);
  });
});
