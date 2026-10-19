import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { staticEntry, isFresh, cacheControlFor } from "./static-cache";

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "static-cache-"));
  fs.mkdirSync(path.join(root, "posts", "note"), { recursive: true });
  fs.mkdirSync(path.join(root, "vault"), { recursive: true });
  fs.writeFileSync(path.join(root, "posts", "note", "index.html"), "<p>hi</p>");
  fs.writeFileSync(path.join(root, "posts", "note", "index.html.br"), "brotli");
  fs.writeFileSync(path.join(root, "posts", "note", "index.html.gz"), "gzipped");
  fs.writeFileSync(path.join(root, "vault", "dessin été.png"), "notreallyapng");
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const entry = (p: string, enc = "") => staticEntry(root, p, enc);

describe("staticEntry", () => {
  it("resolves a trailing-slash URL to its index.html", () => {
    expect(entry("/posts/note/")?.etag).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/);
  });

  it("decodes percent-encoded paths", () => {
    expect(entry("/vault/dessin%20%C3%A9t%C3%A9.png")).not.toBeNull();
  });

  it("returns null for anything that is not a file", () => {
    expect(entry("/api/ask")).toBeNull();
    expect(entry("/does/not/exist/")).toBeNull();
    expect(entry("/%E0%A4%A")).toBeNull(); // undecodable
  });

  it("refuses traversal the way serveStatic does", () => {
    expect(entry("/posts/../posts/note/")).toBeNull();
    expect(entry("//posts/note/")).toBeNull();
  });

  // The .br and the raw bytes are two representations of one URL; a shared
  // cache keyed on the ETag alone must not be able to confuse them.
  it("gives each negotiated encoding its own validator", () => {
    const raw = entry("/posts/note/", "")!;
    const br = entry("/posts/note/", "br, gzip")!;
    const gz = entry("/posts/note/", "gzip, deflate")!;
    expect(new Set([raw.etag, br.etag, gz.etag]).size).toBe(3);
    expect(br.etag).toContain("-br");
    expect(gz.etag).toContain("-gzip");
    expect(raw.negotiated).toBe(false);
    expect(br.negotiated).toBe(true);
  });

  it("ignores a q-value when reading Accept-Encoding", () => {
    expect(entry("/posts/note/", "br;q=1.0, gzip;q=0.8")!.etag).toContain("-br");
  });

  it("does not claim an encoding with no file behind it", () => {
    expect(entry("/vault/dessin été.png", "br, gzip")!.negotiated).toBe(false);
  });
});

describe("isFresh", () => {
  const e = { etag: 'W/"a-b"', mtime: new Date("2026-01-02T03:04:05.750Z"), negotiated: false };

  it("matches If-None-Match regardless of the weak prefix", () => {
    expect(isFresh(e, 'W/"a-b"', undefined)).toBe(true);
    expect(isFresh(e, '"a-b"', undefined)).toBe(true);
    expect(isFresh(e, '"x", W/"a-b"', undefined)).toBe(true);
    expect(isFresh(e, '"other"', undefined)).toBe(false);
  });

  // RFC 9110 §13.1.3: the entity tag is the stronger validator, so a present
  // If-None-Match settles it even when If-Modified-Since would say otherwise.
  it("lets If-None-Match override If-Modified-Since", () => {
    expect(isFresh(e, '"stale"', "Sat, 03 Jan 2026 00:00:00 GMT")).toBe(false);
  });

  it("compares If-Modified-Since at whole-second granularity", () => {
    // The header can only carry 03:04:05, so a file stamped 03:04:05.750 must
    // still count as unmodified or every such file 200s forever.
    expect(isFresh(e, undefined, "Fri, 02 Jan 2026 03:04:05 GMT")).toBe(true);
    expect(isFresh(e, undefined, "Fri, 02 Jan 2026 03:04:04 GMT")).toBe(false);
  });

  it("honours the wildcard If-None-Match", () => {
    expect(isFresh(e, "*", undefined)).toBe(true);
  });

  it("is not fresh without validators, or with an unparseable date", () => {
    expect(isFresh(e, undefined, undefined)).toBe(false);
    expect(isFresh(e, undefined, "not a date")).toBe(false);
  });
});

describe("cacheControlFor", () => {
  it("caches the hashed i18n bundles for a year", () => {
    expect(cacheControlFor("/i18n/fr.0123456789.js")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("caches content-hashed build output forever", () => {
    expect(cacheControlFor("/_next/static/chunks/x.js")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("caches the font subsets for a month, but not immutably", () => {
    const cc = cacheControlFor("/fonts/alegreya-normal-latin.woff2")!;
    expect(cc).toBe("public, max-age=2592000");
    expect(cc).not.toContain("immutable");
  });

  it("leaves the API alone and revalidates everything else", () => {
    expect(cacheControlFor("/api/ask")).toBeNull();
    expect(cacheControlFor("/posts/note/")).toBe("no-cache");
    expect(cacheControlFor("/vault/x.png")).toBe("no-cache");
  });
});
