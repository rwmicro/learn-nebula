import { describe, expect, it } from "vitest";
import { readingView, noteNodeId } from "./graph-reading";
import type { GraphData } from "./graph-data";

const note = (slug: string) => ({
  id: noteNodeId(slug),
  label: slug,
  kind: "note" as const,
  href: `/posts/${slug}/`,
  group: "g",
  theme: "t",
  depth: 3,
});
const wl = (a: string, b: string) => ({ source: noteNodeId(a), target: noteNodeId(b), kind: "wikilink" as const });
const read = (...slugs: string[]) => Object.fromEntries(slugs.map((s) => [s, { p: 0, t: 1, r: 1 }]));

const data: GraphData = {
  nodes: [
    { id: "__root__", label: "Garden", kind: "root", group: "", theme: "", depth: 0 },
    note("kant"),
    note("hegel"),
    note("platon"),
    note("marx"),
    note("seul"),
  ],
  links: [wl("hegel", "kant"), wl("marx", "hegel"), wl("platon", "kant"), wl("kant", "platon"), wl("seul", "kant")],
};

describe("readingView", () => {
  it("counts read notes only among notes", () => {
    const v = readingView(data, read("kant", "nope"));
    expect([...v.read]).toEqual([noteNodeId("kant")]);
    expect(v.total).toBe(5);
  });

  it("suggests unread neighbours of what was read, most connected first", () => {
    const v = readingView(data, read("kant"));
    expect(v.fromReading).toBe(true);
    // platon links both ways with kant (2), hegel and seul once.
    expect(v.next[0]).toBe(noteNodeId("platon"));
    expect(v.next).toContain(noteNodeId("hegel"));
    expect(v.next).not.toContain(noteNodeId("kant"));
    expect(v.next).not.toContain(noteNodeId("marx"));
  });

  it("falls back to the most cited notes with nothing read", () => {
    const v = readingView(data, {});
    expect(v.fromReading).toBe(false);
    expect(v.next[0]).toBe(noteNodeId("kant"));
  });

  it("respects the limit", () => {
    expect(readingView(data, read("kant"), 1).next).toHaveLength(1);
  });
});
