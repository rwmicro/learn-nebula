import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { staticReadable } from "./static-health.ts";

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "static-health-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("staticReadable", () => {
  it("is true when index.html can be opened", () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, "index.html"), "<!doctype html>");
    expect(staticReadable(d)).toBe(true);
  });

  it("is false for a missing export", () => {
    expect(staticReadable(tmp())).toBe(false);
    expect(staticReadable(path.join(tmp(), "nope"))).toBe(false);
  });

  // root reads a 0000 file anyway, so this case only means something unprivileged.
  it.skipIf(process.getuid?.() === 0)("is false when index.html is unreadable", () => {
    const d = tmp();
    const f = path.join(d, "index.html");
    fs.writeFileSync(f, "<!doctype html>");
    fs.chmodSync(f, 0o000);
    expect(staticReadable(d)).toBe(false);
  });
});
