import { describe, expect, it } from "vitest";
import { HASHED_SCRIPTS, hashedScriptName } from "./hashed-scripts.js";

describe("hashedScriptName", () => {
  it("puts a 10-hex hash before .js, keeping the rest of the name", () => {
    expect(hashedScriptName("note.bundle.js", "x")).toMatch(/^note\.bundle\.[0-9a-f]{10}\.js$/);
  });

  it("changes with the bytes and only with them", () => {
    expect(hashedScriptName("a.js", "1")).toBe(hashedScriptName("a.js", "1"));
    expect(hashedScriptName("a.js", "1")).not.toBe(hashedScriptName("a.js", "2"));
  });

  it("lists each script once, all of them .js", () => {
    expect(new Set(HASHED_SCRIPTS).size).toBe(HASHED_SCRIPTS.length);
    for (const f of HASHED_SCRIPTS) expect(f).toMatch(/^[a-z0-9-]+(\.bundle)?\.js$/);
  });
});
