import { describe, expect, it } from "vitest";
import {
  FORMAT,
  MAX_LINK_CHARS,
  VERSION,
  applyPlan,
  buildExport,
  collectProgress,
  decodeTransfer,
  encodeTransfer,
  exportFilename,
  fromBase64Url,
  hasChanges,
  payloadFromHash,
  planImport,
  specFor,
  summarize,
  toBase64Url,
  validateImport,
} from "./progress-transfer";

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

const card = (due: string, reps = 1) => ({ ef: 2.5, iv: 1, reps, due });
const deck = (
  cards: Record<string, ReturnType<typeof card>>,
  newDay = "2026-10-01",
  newCount = 1,
) => ({
  v: 1,
  cards,
  newDay,
  newCount,
});
const q = (title: string, added: string) => ({
  q: "<p>Q</p>",
  a: "<p>A</p>",
  url: "/posts/x/",
  title,
  added,
});

describe("key registry", () => {
  it("classifies progress keys and leaves preferences out", () => {
    expect(specFor("gkReading")?.kind).toBe("reading");
    expect(specFor("srs:note:a/b")?.kind).toBe("questions");
    expect(specFor("srs:anglais")?.kind).toBe("decks");
    expect(specFor("srs:probe")).toBeNull();
    for (const k of [
      "theme",
      "locale",
      "noteTextSize",
      "gkChatPinned",
      "flashcardSize",
      "gkAdminToken",
    ]) {
      expect(specFor(k)).toBeNull();
    }
  });
});

describe("collect / summarize / export", () => {
  const store = memStore({
    gkReading: JSON.stringify({
      "a/b": { p: 0, t: 100, r: 100 },
      "c/d": { p: 400, t: 90 },
    }),
    "srs:deck1": JSON.stringify(
      deck({ x: card("2026-10-05"), y: card("2026-10-02") }),
    ),
    "srs:note:a/b": JSON.stringify({
      ...deck({}),
      items: { q1: q("A", "2026-09-01") },
    }),
    "srs:probe": "1",
    "srs:broken": "{not json",
    theme: "dark",
  });

  it("collects only valid progress", () => {
    const items = collectProgress(store);
    expect(Object.keys(items)).toEqual([
      "gkReading",
      "srs:deck1",
      "srs:note:a/b",
    ]);
    expect(summarize(items)).toEqual({
      read: 1,
      started: 1,
      cards: 2,
      decks: 1,
      questions: 1,
      questionNotes: 1,
      known: 0,
      targets: 0,
      bookmarks: 0,
      highlights: 0,
      activeDays: 0,
    });
  });

  it("builds a versioned file with a dated name", () => {
    const f = buildExport({}, new Date("2026-10-02T10:00:00Z"));
    expect(f).toMatchObject({
      format: FORMAT,
      version: VERSION,
      exportedAt: "2026-10-02T10:00:00.000Z",
    });
    expect(exportFilename(new Date(2026, 9, 2))).toBe(
      "jardin-progression-2026-10-02.json",
    );
  });
});

describe("validateImport", () => {
  it("rejects what isn't a progress file", () => {
    expect(validateImport("{oops")).toEqual({ ok: false, error: "json" });
    expect(validateImport({ format: "autre", version: 1, items: {} })).toEqual({
      ok: false,
      error: "format",
    });
    expect(validateImport({ format: FORMAT, version: 1, items: [] })).toEqual({
      ok: false,
      error: "format",
    });
    expect(
      validateImport({
        format: FORMAT,
        version: VERSION + 1,
        items: { gkReading: {} },
      }),
    ).toEqual({
      ok: false,
      error: "version",
    });
    expect(
      validateImport({ format: FORMAT, version: 1, items: { theme: "dark" } }),
    ).toEqual({ ok: false, error: "empty" });
  });

  it("keeps valid keys, drops unknown and malformed ones", () => {
    const r = validateImport(
      JSON.stringify({
        format: FORMAT,
        version: 1,
        exportedAt: "2026-10-01T00:00:00Z",
        items: {
          gkReading: {
            "a/b": { p: 0, t: 5, r: 5, k: "known" },
            bad: { p: "x" },
          },
          "srs:d": deck({ c: card("2026-10-01") }),
          "srs:wrong": { v: 2, cards: {} },
          theme: "dark",
          "srs:note:n": {
            ...deck({}),
            items: { q1: q("T", "2026-01-01"), evil: { q: 1 } },
          },
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dropped).toBe(2);
    // Unknown entry fields (a newer reading state) survive validation.
    expect(r.file.items.gkReading).toEqual({
      "a/b": { p: 0, t: 5, r: 5, k: "known" },
    });
    expect(
      Object.keys((r.file.items["srs:note:n"] as { items: object }).items),
    ).toEqual(["q1"]);
  });
});

describe("planImport", () => {
  const local = {
    gkReading: { a: { p: 0, t: 100, r: 100 }, b: { p: 300, t: 50 } },
    "srs:d": deck(
      { x: card("2026-10-05", 2), y: card("2026-10-02") },
      "2026-10-01",
      3,
    ),
    "srs:note:n": { ...deck({}), items: { q1: q("old", "2026-09-01") } },
  };
  const incoming = {
    gkReading: {
      a: { p: 500, t: 90 },
      b: { p: 0, t: 80, r: 80 },
      c: { p: 0, t: 10, r: 10 },
    },
    "srs:d": deck(
      { x: card("2026-10-03", 5), z: card("2026-10-09") },
      "2026-10-02",
      1,
    ),
    "srs:other": deck({ w: card("2026-10-04") }),
  };

  it("merges, newest per item winning", () => {
    const plan = planImport(local, incoming, "merge");
    expect(plan.write.gkReading).toEqual({
      a: { p: 0, t: 100, r: 100 }, // local newer
      b: { p: 0, t: 80, r: 80 }, // incoming newer
      c: { p: 0, t: 10, r: 10 }, // only incoming
    });
    const d = plan.write["srs:d"] as {
      cards: Record<string, { due: string }>;
      newDay: string;
      newCount: number;
    };
    expect(d.cards.x.due).toBe("2026-10-05"); // later due wins
    expect(Object.keys(d.cards).sort()).toEqual(["x", "y", "z"]);
    expect([d.newDay, d.newCount]).toEqual(["2026-10-02", 1]);
    expect(plan.remove).toEqual([]);
    expect("srs:note:n" in plan.write).toBe(false); // untouched
    expect(plan.changes.reading).toEqual({
      added: 1,
      updated: 1,
      removed: 0,
      unchanged: 1,
    });
    expect(plan.changes.decks).toEqual({
      added: 2,
      updated: 0,
      removed: 0,
      unchanged: 2,
    });
    expect(plan.changes.questions).toEqual({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 1,
    });
  });

  it("merges saved questions by date added", () => {
    const plan = planImport(
      local,
      {
        "srs:note:n": {
          ...deck({}),
          items: { q1: q("new", "2026-09-10"), q2: q("x", "2026-09-02") },
        },
      },
      "merge",
    );
    const items = (
      plan.write["srs:note:n"] as { items: Record<string, { title: string }> }
    ).items;
    expect(items.q1.title).toBe("new");
    expect(plan.changes.questions).toMatchObject({ added: 1, updated: 1 });
  });

  it("replaces: the result is exactly the file", () => {
    const plan = planImport(local, incoming, "replace");
    expect(plan.remove).toEqual(["srs:note:n"]);
    expect(plan.write.gkReading).toEqual(incoming.gkReading);
    expect(plan.changes.questions.removed).toBe(1);
    expect(plan.changes.reading).toEqual({
      added: 1,
      updated: 2,
      removed: 0,
      unchanged: 0,
    });
  });

  it("detects a no-op and applies a plan to storage", () => {
    expect(hasChanges(planImport(local, local, "merge"))).toBe(false);
    const store = memStore({ "srs:note:n": "{}", theme: "dark" });
    expect(applyPlan(store, planImport(local, incoming, "replace"))).toBe(true);
    const dump = store.dump();
    expect(Object.keys(dump).sort()).toEqual([
      "gkReading",
      "srs:d",
      "srs:other",
      "theme",
    ]);
    expect(JSON.parse(dump.gkReading)).toEqual(incoming.gkReading);
  });
});

describe("path study keys", () => {
  it("merges known notes (newest t) and keeps local path targets", () => {
    const local = {
      gkKnown: { a: { t: 100, via: "test" }, b: { t: 10 } },
      gkPathTarget: { p1: "x" },
    };
    const incoming = {
      gkKnown: { a: { t: 50 }, b: { t: 20 }, c: { t: 5 } },
      gkPathTarget: { p1: "y", p2: "z" },
    };
    const merged = planImport(local, incoming, "merge");
    expect(merged.write.gkKnown).toEqual({
      a: { t: 100, via: "test" },
      b: { t: 20 },
      c: { t: 5 },
    });
    expect(merged.write.gkPathTarget).toEqual({ p1: "x", p2: "z" });
    expect(merged.changes.known).toMatchObject({ added: 1, updated: 1 });
    const replaced = planImport(local, incoming, "replace");
    expect(replaced.write.gkPathTarget).toEqual(incoming.gkPathTarget);
  });

  it("unions mastered questions, latest date winning", () => {
    const plan = planImport(
      {
        "srs:note:n": {
          ...deck({}),
          items: {},
          ok: { q1: "2026-09-01", q2: "2026-09-05" },
        },
      },
      {
        "srs:note:n": {
          ...deck({}),
          items: {},
          ok: { q1: "2026-09-03", q3: "2026-09-04" },
        },
      },
      "merge",
    );
    expect(
      (plan.write["srs:note:n"] as { ok: Record<string, string> }).ok,
    ).toEqual({
      q1: "2026-09-03",
      q2: "2026-09-05",
      q3: "2026-09-04",
    });
  });

  it("keeps an entry holding only mastered marks", () => {
    const file = buildExport({
      "srs:note:n": { ...deck({}), items: {}, ok: { q1: "2026-09-01" } },
      gkKnown: { a: { t: 1 }, bad: { t: "x" } },
      gkPathTarget: { p: "s", empty: "" },
    });
    const v = validateImport(JSON.stringify(file));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(Object.keys(v.file.items).sort()).toEqual([
      "gkKnown",
      "gkPathTarget",
      "srs:note:n",
    ]);
    expect(v.file.items.gkKnown).toEqual({ a: { t: 1 } });
    expect(v.file.items.gkPathTarget).toEqual({ p: "s" });
  });
});

describe("transfer link", () => {
  it("round-trips base64url", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
    const s = toBase64Url(bytes);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect([...fromBase64Url(s)]).toEqual([...bytes]);
    expect(() => fromBase64Url("a+b/")).toThrow();
  });

  it("compresses and restores a file, small enough for a link", async () => {
    const items: Record<string, unknown> = { gkReading: {} };
    for (let i = 0; i < 300; i++) {
      (items.gkReading as Record<string, unknown>)[
        `mathematics/lycee/note-${i}`
      ] = { p: 0, t: 1_790_000_000 + i, r: 1_790_000_000 + i };
    }
    const text = JSON.stringify(buildExport(items));
    const payload = await encodeTransfer(text);
    expect(payload.length).toBeLessThan(text.length / 3);
    expect(payload.length).toBeLessThan(MAX_LINK_CHARS);
    expect(await decodeTransfer(payload)).toBe(text);
  });

  it("reads the payload from the fragment", () => {
    expect(payloadFromHash("#import=abc_-9")).toBe("abc_-9");
    expect(payloadFromHash("#import=a b")).toBeNull();
    expect(payloadFromHash("#autre=abc")).toBeNull();
  });
});
