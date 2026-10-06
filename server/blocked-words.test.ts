import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldText, matchBlocked, sanitizeWords, MAX_WORDS, MAX_WORD_LEN } from "./blocked-words.ts";

describe("foldText", () => {
  it("folds case, accents and whitespace", () => {
    expect(foldText("  Écrasé\tÀ  Moitié ")).toBe("ecrase a moitie");
  });
});

describe("sanitizeWords", () => {
  it("trims, drops empties/non-strings and dedupes on the folded form", () => {
    expect(sanitizeWords(["  spam ", "", "SPAM", "Éclat", "eclat", 3, null, "deux  mots"])).toEqual([
      "spam",
      "Éclat",
      "deux mots",
    ]);
  });
  it("rejects over-long entries and caps the list", () => {
    expect(sanitizeWords(["x".repeat(MAX_WORD_LEN + 1)])).toEqual([]);
    const many = Array.from({ length: MAX_WORDS + 20 }, (_, i) => `w${i}`);
    expect(sanitizeWords(many)).toHaveLength(MAX_WORDS);
  });
  it("is empty for anything but an array", () => {
    expect(sanitizeWords("spam")).toEqual([]);
  });
});

describe("matchBlocked", () => {
  const words = ["casino", "pilule bleue", "con"];
  it("matches whole words, ignoring case and accents", () => {
    expect(matchBlocked("Meilleur CASINO en ligne !", words)).toEqual(["casino"]);
    expect(matchBlocked("la pilule  BLEUE", words)).toEqual(["pilule bleue"]);
    expect(matchBlocked("Côn !", words)).toEqual(["con"]);
  });
  it("does not match inside a longer word", () => {
    expect(matchBlocked("une section conique, des casinos", words)).toEqual([]);
  });
  it("treats regex metacharacters literally", () => {
    expect(matchBlocked("prix: 100$ (promo)", ["100$", "(promo)"])).toEqual(["100$", "(promo)"]);
    expect(matchBlocked("aaa", ["a.a"])).toEqual([]);
  });
  it("returns nothing for an empty list or text", () => {
    expect(matchBlocked("casino", [])).toEqual([]);
    expect(matchBlocked("", words)).toEqual([]);
  });
});

// Storage + routes against a throwaway SQLite file. env.ts reads process.env at
// import, so the variables are set before the dynamic imports below.
describe("blocked words storage and endpoints", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-blocked-"));
  let db: typeof import("./db.ts");
  let adminRoute: typeof import("./routes/admin.ts").adminRoute;
  let commentsRoute: typeof import("./routes/comments.ts").commentsRoute;
  const auth = { authorization: "Bearer test-token" };

  beforeAll(async () => {
    process.env.DB_PATH = path.join(dir, "comments.db");
    process.env.COMMENTS_ADMIN_TOKEN = "test-token";
    process.env.TURNSTILE_SECRET_KEY = "";
    db = await import("./db.ts");
    db.initDb();
    adminRoute = (await import("./routes/admin.ts")).adminRoute;
    commentsRoute = (await import("./routes/comments.ts")).commentsRoute;
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("starts empty with hold on", async () => {
    const r = await adminRoute.request("/blocked-words", { headers: auth });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ words: [], hold: true });
  });

  it("rejects requests without the token", async () => {
    expect((await adminRoute.request("/blocked-words")).status).toBe(401);
    const put = await adminRoute.request("/blocked-words", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ words: ["x"] }),
    });
    expect(put.status).toBe(401);
    expect(db.blockedWords()).toEqual([]);
  });

  it("replaces the list (sanitised, order kept) and the hold setting", async () => {
    const r = await adminRoute.request("/blocked-words", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ words: [" casino ", "Viagra", "CASINO", ""], hold: false }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ words: ["casino", "Viagra"], hold: false });
    expect(db.blockedWords()).toEqual(["casino", "Viagra"]);
    expect(db.holdBlocked()).toBe(false);
  });

  it("400s on a malformed body", async () => {
    const r = await adminRoute.request("/blocked-words", {
      method: "PUT",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ words: "casino" }),
    });
    expect(r.status).toBe(400);
  });

  it("flags pending comments containing a blocked word", async () => {
    db.insertComment("a/b", "Bob", "Super casino en ligne", "pending");
    db.insertComment("a/b", "Alice", "Merci pour la note", "pending");
    const r = await commentsRoute.request("/?status=pending", { headers: auth });
    const { comments } = (await r.json()) as { comments: { body: string; flagged: string[] }[] };
    const byBody = Object.fromEntries(comments.map((c) => [c.body, c.flagged]));
    expect(byBody["Super casino en ligne"]).toEqual(["casino"]);
    expect(byBody["Merci pour la note"]).toEqual([]);
  });

  it("moderates several comments at once", async () => {
    const ids = db.pending().map((c) => c.id);
    const r = await commentsRoute.request("/", {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ ids, action: "delete" }),
    });
    expect(await r.json()).toEqual({ ok: true, changed: ids.length });
    expect(db.pending()).toEqual([]);
    const bad = await commentsRoute.request("/", {
      method: "PATCH",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ ids: [1, "x"], action: "approve" }),
    });
    expect(bad.status).toBe(400);
  });
});
