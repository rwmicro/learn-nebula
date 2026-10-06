import { describe, it, expect, vi, afterEach } from "vitest";
import { isSearchMissWhere, normaliseSearchMiss, reportSearchMiss } from "./search-miss";

describe("normaliseSearchMiss", () => {
  it("trims, lowercases and collapses whitespace", () => {
    expect(normaliseSearchMiss("  Tamazight\t  GRAMMAIRE \n")).toBe("tamazight grammaire");
  });

  it("drops control and zero-width characters", () => {
    expect(normaliseSearchMiss("ka​byle\u0007")).toBe("ka byle");
  });

  it("needs three characters, counting code points", () => {
    expect(normaliseSearchMiss("ab")).toBeNull();
    expect(normaliseSearchMiss("  ab  ")).toBeNull();
    expect(normaliseSearchMiss("abc")).toBe("abc");
    expect(normaliseSearchMiss("汉语言")).toBe("汉语言");
  });

  it("caps at 100 characters", () => {
    expect(normaliseSearchMiss("a".repeat(150))).toBe("a".repeat(100));
  });

  it("rejects non-strings", () => {
    for (const v of [undefined, null, 42, {}, ["abc"]]) expect(normaliseSearchMiss(v)).toBeNull();
  });
});

describe("isSearchMissWhere", () => {
  it("accepts only the two search boxes", () => {
    expect(isSearchMissWhere("home")).toBe(true);
    expect(isSearchMissWhere("note")).toBe(true);
    expect(isSearchMissWhere("admin")).toBe(false);
    expect(isSearchMissWhere(undefined)).toBe(false);
  });
});

describe("reportSearchMiss", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts once per query and place, and never throws", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("no backend")));
    vi.stubGlobal("fetch", fetchMock);
    reportSearchMiss("Grammaire Kabyle", "home");
    reportSearchMiss("grammaire   kabyle", "home");
    reportSearchMiss("grammaire kabyle", "note");
    reportSearchMiss("ab", "home");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/search-miss");
    expect(JSON.parse(String(init.body))).toEqual({ q: "grammaire kabyle", where: "home" });
    await Promise.resolve(); // the rejected POST is swallowed
  });
});
