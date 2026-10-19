import { describe, expect, it } from "vitest";
import { cleanPath, clientErrorKey, normaliseClientError, normaliseReport, normaliseSlug } from "./feedback";

describe("normaliseClientError", () => {
  it("keeps the message, a same-site path and the line", () => {
    const e = normaliseClientError({
      message: "TypeError: x is undefined",
      source: "https://4d52.net/js/note.bundle.js?v=1",
      line: 12.7,
      stack: "at f\n at g",
      path: "https://4d52.net/posts/a/b/?q=secret#h",
    });
    expect(e).toEqual({
      message: "TypeError: x is undefined",
      source: "/js/note.bundle.js",
      line: 12,
      stack: "at f\n at g",
      path: "/posts/a/b/",
    });
  });
  it("drops extension errors and empty messages", () => {
    expect(normaliseClientError({ message: "boom", source: "chrome-extension://abc/x.js" })).toBeNull();
    expect(normaliseClientError({ message: "   " })).toBeNull();
    expect(normaliseClientError(null)).toBeNull();
  });
  it("caps the message", () => {
    expect(normaliseClientError({ message: "x".repeat(5000) })!.message).toHaveLength(300);
  });
  it("dedupes on message and place", () => {
    const a = normaliseClientError({ message: "m", source: "/a.js", line: 1 })!;
    const b = normaliseClientError({ message: "m", source: "/a.js", line: 1, path: "/other/" })!;
    expect(clientErrorKey(a)).toBe(clientErrorKey(b));
  });
});

describe("normaliseReport", () => {
  it("accepts a passage and a remark on a note", () => {
    expect(
      normaliseReport({ slug: "/posts/history/rome/", passage: "en 1453", remark: "C'est 1453 pour Constantinople, pas Rome." }),
    ).toEqual({ slug: "history/rome", passage: "en 1453", remark: "C'est 1453 pour Constantinople, pas Rome." });
  });
  it("refuses a missing passage, a too short remark or a bad slug", () => {
    expect(normaliseReport({ slug: "a", passage: "", remark: "faux" })).toBeNull();
    expect(normaliseReport({ slug: "a", passage: "p", remark: "x" })).toBeNull();
    expect(normaliseReport({ slug: "../etc", passage: "p", remark: "faux" })).toBeNull();
  });
  it("strips bidi overrides", () => {
    expect(normaliseReport({ slug: "a", passage: "p‮", remark: "faux‮!" })!.remark).toBe("faux !");
  });
});

describe("helpers", () => {
  it("normaliseSlug accepts accents and digits", () => {
    expect(normaliseSlug("posts/histoire/1789-révolution/")).toBe("histoire/1789-révolution");
  });
  it("cleanPath never returns another origin", () => {
    expect(cleanPath("https://evil.example/x")).toBe("/x");
    expect(cleanPath(42)).toBe("");
  });
});
