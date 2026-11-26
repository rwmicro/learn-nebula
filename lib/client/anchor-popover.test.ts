import { afterEach, describe, expect, it, vi } from "vitest";
import { anchoredPopoverMode } from "./anchor-popover";

function stub({ anchor = true, popover = true, hint = true } = {}) {
  vi.stubGlobal("CSS", { supports: () => anchor });
  vi.stubGlobal("HTMLElement", { prototype: popover ? { popover: null } : {} });
  vi.stubGlobal("document", {
    createElement: () => {
      const el = {
        popover: "",
        setAttribute: (_: string, v: string) =>
          (el.popover = hint || v !== "hint" ? v : "manual"),
      };
      return el;
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("anchoredPopoverMode", () => {
  it("is null without anchor positioning or popovers", () => {
    stub({ anchor: false });
    expect(anchoredPopoverMode()).toBeNull();
    stub({ popover: false });
    expect(anchoredPopoverMode()).toBeNull();
  });
  it("prefers hint, falls back to manual", () => {
    stub();
    expect(anchoredPopoverMode()).toBe("hint");
    expect(anchoredPopoverMode("manual")).toBe("manual");
    stub({ hint: false });
    expect(anchoredPopoverMode()).toBe("manual");
  });
});
