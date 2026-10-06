import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";

// A real index over three chunks, with the embeddings and reranker endpoints
// mocked: a bag-of-words "embedding" over a tiny vocabulary is enough to make
// the cosine ranking predictable. Env first — every server module is imported
// dynamically below, after it is set.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rag-debug-"));
const CHUNKS = [
  { id: "a", title: "Verbes", url: "/posts/kabyle/verbes/", text: "Verbes › Conjugaison\nLes verbes kabyle se conjuguent au prétérit." },
  { id: "b", title: "Script", url: "/posts/hindi/script/", text: "Script › Devanagari\nLe devanagari note le hindi, pas le kabyle." },
  { id: "c", title: "Pronoms", url: "/posts/kabyle/pronoms/", text: "Pronoms › Personnels\nLes pronoms kabyle : nekk, kečč." },
];
fs.writeFileSync(path.join(tmp, "chunks.json"), JSON.stringify(CHUNKS));
process.env.RAG_CHUNKS = path.join(tmp, "chunks.json");
process.env.RAG_VECTORS = path.join(tmp, "vectors.json");
process.env.DB_PATH = path.join(tmp, "comments.db");
process.env.EMBED_BASE_URL = "http://embed.test/v1";
process.env.RERANK_URL = "http://rerank.test/rerank";
process.env.COMMENTS_ADMIN_TOKEN = "secret-token";

const VOCAB = ["kabyle", "verbes", "hindi", "devanagari", "pronoms", "conjuguent"];
const embed = (t: string) => VOCAB.map((w) => (t.toLowerCase().split(w).length - 1) + 0.01);
// The reranker likes verbs, tolerates pronouns, rejects the script chunk.
const rerankScore = (t: string) => (t.includes("Verbes") ? 0.9 : t.includes("Pronoms") ? 0.5 : 0.001);

let app: Hono;
const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
  const body = JSON.parse(String(init.body));
  if (String(url) === "http://embed.test/v1/embeddings") {
    return Response.json({ data: (body.input as string[]).map((t) => ({ embedding: embed(t) })) });
  }
  if (String(url) === "http://rerank.test/rerank") {
    return Response.json((body.texts as string[]).map((t, index) => ({ index, score: rerankScore(t) })));
  }
  return new Response("nope", { status: 500 });
});

beforeAll(async () => {
  vi.stubGlobal("fetch", fetchMock);
  const { Hono } = await import("hono");
  const rag = await import("./rag");
  const { adminRoute } = await import("./routes/admin");
  app = new Hono();
  app.route("/api/admin", adminRoute);
  rag.initRag();
  for (let i = 0; i < 100 && rag.ragState().state !== "ready"; i++) await new Promise((r) => setTimeout(r, 10));
  expect(rag.ragState()).toMatchObject({ state: "ready", chunks: 3 });
});

afterAll(() => vi.unstubAllGlobals());

const AUTH = { authorization: "Bearer secret-token", "content-type": "application/json" };
interface Row {
  url: string;
  breadcrumb: string;
  excerpt: string;
  cosine: number;
  bm25: number | null;
  rrf: number;
  rerank: number | null;
  kept: boolean;
}
const bench = async (body: unknown) => {
  const res = await app.request("/api/admin/rag-debug", { method: "POST", headers: AUTH, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json()) as { results: Row[]; reranked: boolean; kept: number; scope: string } };
};

describe("POST /api/admin/rag-debug", () => {
  it("returns every score of the hybrid pipeline, without generating", async () => {
    const { status, data } = await bench({ q: "verbes kabyle" });
    expect(status).toBe(200);
    expect(data.reranked).toBe(true);
    const [top, second] = data.results;
    expect(top.url).toBe("/posts/kabyle/verbes/");
    expect(top.breadcrumb).toBe("Verbes › Conjugaison");
    expect(top.excerpt).toBe("Les verbes kabyle se conjuguent au prétérit.");
    expect(top.cosine).toBeGreaterThan(0.4);
    expect(top.bm25).toBeGreaterThan(0);
    expect(top.rrf).toBeGreaterThan(0);
    expect(top.rerank).toBe(0.9);
    expect(top.kept).toBe(true);
    expect(second.url).toBe("/posts/kabyle/pronoms/");
    // Only the embeddings and reranker were called — no chat endpoint.
    expect(fetchMock.mock.calls.every(([u]) => /embed\.test|rerank\.test/.test(String(u)))).toBe(true);
  });

  it("marks what the reranker floor drops", async () => {
    const { data } = await bench({ q: "kabyle" });
    const script = data.results.find((r) => r.url === "/posts/hindi/script/");
    expect(script?.rerank).toBe(0.001);
    expect(script?.kept).toBe(false);
    expect(data.kept).toBe(data.results.filter((r) => r.kept).length);
  });

  it("matches what /api/ask's search() keeps", async () => {
    const rag = await import("./rag");
    const hits = await rag.search("verbes kabyle", rag.ASK_TOP_K, rag.ASK_MIN_SCORE);
    const { data } = await bench({ q: "verbes kabyle" });
    expect(data.results.filter((r) => r.kept).map((r) => r.url)).toEqual(hits.map((h) => h.url));
  });

  it("honours the scope", async () => {
    const { data } = await bench({ q: "hindi devanagari", scope: "hindi" });
    expect(data.scope).toBe("/posts/hindi/");
    expect(data.results.every((r) => r.url.startsWith("/posts/hindi/"))).toBe(true);
  });

  it("needs a question", async () => {
    expect((await bench({ q: "  " })).status).toBe(400);
  });
});
