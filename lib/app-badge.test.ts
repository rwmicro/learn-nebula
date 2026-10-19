import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDueBadge, setDueBadge } from "./app-badge";

afterEach(() => {
  vi.unstubAllGlobals();
  resetDueBadge();
});

describe("setDueBadge", () => {
  it("is a no-op without the API", () => {
    vi.stubGlobal("navigator", {});
    expect(() => setDueBadge(3)).not.toThrow();
  });

  it("sets, skips repeats and clears at zero", () => {
    const setAppBadge = vi.fn(async () => {});
    const clearAppBadge = vi.fn(async () => {});
    vi.stubGlobal("navigator", { setAppBadge, clearAppBadge });
    setDueBadge(4);
    setDueBadge(4);
    expect(setAppBadge).toHaveBeenCalledTimes(1);
    expect(setAppBadge).toHaveBeenCalledWith(4);
    setDueBadge(0);
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
    setDueBadge(-2);
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected call", async () => {
    const setAppBadge = vi.fn(() => Promise.reject(new Error("no")));
    vi.stubGlobal("navigator", { setAppBadge });
    setDueBadge(2);
    await new Promise((r) => setTimeout(r, 0));
    expect(setAppBadge).toHaveBeenCalledOnce();
  });
});
