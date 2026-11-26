import { afterEach, describe, expect, it, vi } from "vitest";
import { keepAwake, wakeLockSupported } from "./wake-lock";

function setup(supported = true) {
  const listeners = new Map<string, () => void>();
  const doc = {
    visibilityState: "visible",
    addEventListener: (t: string, f: () => void) => listeners.set(t, f),
    removeEventListener: (t: string) => listeners.delete(t),
  };
  const released: number[] = [];
  let n = 0;
  const request = vi.fn(async () => {
    const id = ++n;
    return { release: async () => void released.push(id) };
  });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", supported ? { wakeLock: { request } } : {});
  return { doc, listeners, request, released };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.unstubAllGlobals());

describe("keepAwake", () => {
  it("does nothing without the API", () => {
    setup(false);
    expect(wakeLockSupported()).toBe(false);
    expect(() => keepAwake()()).not.toThrow();
  });

  it("requests on start and releases on stop", async () => {
    const s = setup();
    expect(wakeLockSupported()).toBe(true);
    const stop = keepAwake();
    await tick();
    expect(s.request).toHaveBeenCalledTimes(1);
    stop();
    expect(s.released).toEqual([1]);
    expect(s.listeners.size).toBe(0);
  });

  it("asks again when the page becomes visible", async () => {
    const s = setup();
    const stop = keepAwake();
    await tick();
    s.doc.visibilityState = "hidden";
    s.listeners.get("visibilitychange")!();
    expect(s.request).toHaveBeenCalledTimes(1);
    s.doc.visibilityState = "visible";
    s.listeners.get("visibilitychange")!();
    await tick();
    expect(s.request).toHaveBeenCalledTimes(2);
    stop();
    expect(s.released).toEqual([2]);
  });

  it("releases a lock granted after stop", async () => {
    const s = setup();
    const stop = keepAwake();
    stop();
    await tick();
    expect(s.released).toEqual([1]);
  });
});
