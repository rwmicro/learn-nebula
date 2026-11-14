import { describe, expect, it } from "vitest";
import {
  batchPrompt,
  isRtl,
  maxTokensFor,
  parseBatch,
  planBatches,
  progressOf,
  tagsBalanced,
  worthTranslating,
} from "./translate-plan";

describe("isRtl", () => {
  it("knows the right-to-left languages", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("he")).toBe(true);
    expect(isRtl("fa-IR")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isRtl("zh")).toBe(false);
  });
});

describe("worthTranslating", () => {
  it("skips single letters, sounds and symbols", () => {
    for (const t of ["b", "/p/", "→", "1958", "", " x "]) expect(worthTranslating(t)).toBe(false);
  });
  it("keeps words, accented or not", () => {
    for (const t of ["Fait", "où", "bà (papa)", "国语", "é́a"]) expect(worthTranslating(t)).toBe(true);
  });
});

describe("planBatches", () => {
  const L = { chars: 100, blocks: 3, alone: 60 };
  it("groups short blocks, in order", () => {
    expect(planBatches([10, 10, 10, 10], [], L)).toEqual([[0, 1, 2], [3]]);
  });
  it("sends a long block alone", () => {
    expect(planBatches([10, 80, 10, 10], [], L)).toEqual([[0], [1], [2, 3]]);
  });
  it("never passes the character budget", () => {
    expect(planBatches([50, 50, 50], [], L)).toEqual([[0, 1], [2]]);
  });
  it("starts a new batch at a break", () => {
    expect(planBatches([10, 10, 10], [false, false, true], L)).toEqual([[0, 1], [2]]);
    expect(planBatches([10, 10], [true, false], L)).toEqual([[0, 1]]);
  });
  it("covers every block exactly once", () => {
    const lens = Array.from({ length: 57 }, (_, i) => (i * 37) % 400);
    expect(planBatches(lens).flat()).toEqual(lens.map((_, i) => i));
  });
  it("gives nothing for nothing", () => {
    expect(planBatches([])).toEqual([]);
  });
});

describe("batchPrompt / parseBatch", () => {
  it("sends one block as it is", () => {
    expect(batchPrompt(["Bonjour"])).toBe("Bonjour");
    expect(parseBatch(" Hello ", 1)).toEqual(["Hello"]);
    expect(parseBatch("[1] Hello", 1)).toEqual(["Hello"]);
    expect(parseBatch("", 1)).toEqual([null]);
  });
  it("numbers several blocks", () => {
    expect(batchPrompt(["a", "b"])).toBe("[1] a\n[2] b");
  });
  it("reads the numbered lines back", () => {
    expect(parseBatch("[1] one\n[2] two\n[3] three", 3)).toEqual(["one", "two", "three"]);
  });
  it("tolerates a code fence, blank lines and a wrapped line", () => {
    expect(parseBatch("```\n[1] one\n\n[2] two\nmore\n```", 2)).toEqual(["one", "two more"]);
  });
  it("leaves a missing or empty line null", () => {
    expect(parseBatch("[1] one\n[3] three", 3)).toEqual(["one", null, "three"]);
    expect(parseBatch("[1]\n[2] two", 2)).toEqual([null, "two"]);
    expect(parseBatch("no marks at all", 2)).toEqual([null, null]);
  });
  it("ignores a number out of range and a repeated one", () => {
    expect(parseBatch("[1] a\n[1] again\n[7] x\n[2] b", 2)).toEqual(["a", "b"]);
  });
  it("keeps inline tags", () => {
    expect(parseBatch("[1] the <t0>cat</t0>\n[2] <k0></k0> ok", 2)).toEqual(["the <t0>cat</t0>", "<k0></k0> ok"]);
  });
});

describe("tagsBalanced", () => {
  it("accepts closed and nested tags", () => {
    expect(tagsBalanced("a <t0>b <t1>c</t1></t0> <k0></k0>")).toBe(true);
    expect(tagsBalanced("plain")).toBe(true);
  });
  it("refuses a cut or crossed answer", () => {
    expect(tagsBalanced("a <t0>b")).toBe(false);
    expect(tagsBalanced("a </t0>")).toBe(false);
    expect(tagsBalanced("<t0><t1></t0></t1>")).toBe(false);
  });
});

describe("maxTokensFor", () => {
  it("leaves room and stays under the model's cap", () => {
    expect(maxTokensFor(10)).toBeGreaterThanOrEqual(100);
    expect(maxTokensFor(100000)).toBe(2048);
  });
});

describe("progressOf", () => {
  it("gives no estimate too early", () => {
    expect(progressOf(10, 1000, 20000)).toEqual({ pct: 1, secondsLeft: null });
    expect(progressOf(500, 1000, 2000)).toEqual({ pct: 50, secondsLeft: null });
  });
  it("estimates from the pace so far", () => {
    expect(progressOf(250, 1000, 30000)).toEqual({ pct: 25, secondsLeft: 90 });
  });
  it("ends at 100 with nothing left", () => {
    expect(progressOf(1000, 1000, 30000)).toEqual({ pct: 100, secondsLeft: null });
    expect(progressOf(0, 0, 0)).toEqual({ pct: 100, secondsLeft: null });
  });
});
