import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Hono } from "hono";

// env.ts reads process.env once at import, and every module that imports it
// is loaded dynamically in beforeAll — so this runs first: point the DB and
// the facts file at a temp dir and set the admin token.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "admin-tools-"));
process.env.DB_PATH = path.join(tmp, "comments.db");
process.env.FACTS_TO_CHECK = path.join(tmp, "facts-to-check.json");
process.env.COMMENTS_ADMIN_TOKEN = "secret-token";
process.env.TRUST_PROXY = "true";
delete process.env.GITHUB_TOKEN;
delete process.env.PENSINE_TOKEN;
delete process.env.EMBED_BASE_URL;

let app: Hono;
let env: typeof import("./env").env;

beforeAll(async () => {
  const { Hono } = await import("hono");
  ({ env } = await import("./env"));
  const { adminRoute } = await import("./routes/admin");
  const { searchMissRoute } = await import("./routes/search-miss");
  app = new Hono();
  app.route("/api/admin", adminRoute);
  app.route("/api/search-miss", searchMissRoute);
});

afterEach(() => {
  vi.unstubAllGlobals();
  env.githubToken = "";
  env.pensineToken = "";
});

const AUTH = { authorization: "Bearer secret-token" };
const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});
const miss = (q: unknown, where: unknown, ip: string) =>
  app.request("/api/search-miss", json({ q, where }, { "x-real-ip": ip }));

describe("POST /api/search-miss", () => {
  it("rejects bad payloads", async () => {
    expect((await miss("ab", "home", "198.51.100.1")).status).toBe(400); // too short
    expect((await miss("kabyle", "elsewhere", "198.51.100.1")).status).toBe(400);
    expect((await miss(42, "home", "198.51.100.1")).status).toBe(400);
    const res = await app.request("/api/search-miss", { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
  });

  it("normalises and counts, once per reader per query", async () => {
    expect((await miss("  Tamazight   Grammaire ", "home", "198.51.100.2")).status).toBe(204);
    expect((await miss("tamazight grammaire", "home", "198.51.100.2")).status).toBe(204); // same reader
    expect((await miss("TAMAZIGHT GRAMMAIRE", "home", "198.51.100.3")).status).toBe(204);
    expect((await miss("tamazight grammaire", "note", "198.51.100.3")).status).toBe(204);
    const res = await app.request("/api/admin/search-misses", { headers: AUTH });
    const data = (await res.json()) as { top: { q: string; where: string; count: number }[]; total: number };
    const home = data.top.find((r) => r.q === "tamazight grammaire" && r.where === "home");
    expect(home?.count).toBe(2);
    expect(data.top.find((r) => r.where === "note")?.count).toBe(1);
  });

  it("caps the query length", async () => {
    await miss("x".repeat(500), "home", "198.51.100.4");
    const data = (await (await app.request("/api/admin/search-misses", { headers: AUTH })).json()) as {
      recent: { q: string }[];
    };
    expect(data.recent.some((r) => r.q === "x".repeat(100))).toBe(true);
  });

  it("bounds a flood from one IP", async () => {
    let limited = 0;
    for (let i = 0; i < 40; i++) if ((await miss(`flood ${i}`, "home", "198.51.100.9")).status === 429) limited++;
    expect(limited).toBeGreaterThan(0);
  });
});

describe("admin search misses", () => {
  it("needs the token", async () => {
    expect((await app.request("/api/admin/search-misses")).status).toBe(401);
    expect((await app.request("/api/admin/builds")).status).toBe(401);
    expect((await app.request("/api/admin/rebuild", { method: "POST" })).status).toBe(401);
    expect((await app.request("/api/admin/facts")).status).toBe(401);
  });

  it("dismisses one query", async () => {
    await miss("à supprimer", "home", "198.51.100.5");
    const del = await app.request(`/api/admin/search-misses?q=${encodeURIComponent("À supprimer")}`, {
      method: "DELETE",
      headers: AUTH,
    });
    expect(await del.json()).toEqual({ removed: 1 });
    const data = (await (await app.request("/api/admin/search-misses", { headers: AUTH })).json()) as {
      top: { q: string }[];
    };
    expect(data.top.some((r) => r.q === "à supprimer")).toBe(false);
  });
});

type Call = { url: string; method: string; body: Record<string, unknown> | null };
function mockGitHub(handler: (call: Call) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = {
        url: String(url),
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : null,
      };
      calls.push(call);
      expect(call.url.startsWith("https://api.github.com/")).toBe(true);
      expect((init.headers as Record<string, string>).authorization).toMatch(/^Bearer gh-/);
      const { status = 200, body } = handler(call);
      return new Response(status === 204 ? null : JSON.stringify(body ?? {}), { status });
    }),
  );
  return calls;
}

describe("rebuild", () => {
  it("is disabled, naming the env var, without GITHUB_TOKEN", async () => {
    const res = await app.request("/api/admin/builds", { headers: AUTH });
    expect(await res.json()).toMatchObject({ enabled: false, envVar: "GITHUB_TOKEN", runs: [] });
    expect((await app.request("/api/admin/rebuild", { method: "POST", headers: AUTH })).status).toBe(503);
  });

  it("lists the last runs of docker.yml", async () => {
    env.githubToken = "gh-test";
    const calls = mockGitHub(() => ({
      body: {
        workflow_runs: [
          {
            id: 1,
            status: "completed",
            conclusion: "success",
            event: "workflow_dispatch",
            created_at: "2026-10-06T10:00:00Z",
            html_url: "https://github.com/rwmicro/learn-nebula/actions/runs/1",
            display_title: "Docker image (GHCR)",
          },
        ],
      },
    }));
    const data = (await (await app.request("/api/admin/builds", { headers: AUTH })).json()) as {
      enabled: boolean;
      runs: unknown[];
    };
    expect(calls[0].url).toBe(
      "https://api.github.com/repos/rwmicro/learn-nebula/actions/workflows/docker.yml/runs?per_page=5",
    );
    expect(data.enabled).toBe(true);
    expect(data.runs).toEqual([
      {
        id: 1,
        status: "completed",
        conclusion: "success",
        event: "workflow_dispatch",
        created_at: "2026-10-06T10:00:00Z",
        html_url: "https://github.com/rwmicro/learn-nebula/actions/runs/1",
        title: "Docker image (GHCR)",
      },
    ]);
  });

  it("dispatches the workflow on main, once per cooldown", async () => {
    env.githubToken = "gh-test";
    const calls = mockGitHub(() => ({ status: 204 }));
    expect((await app.request("/api/admin/rebuild", { method: "POST", headers: AUTH })).status).toBe(202);
    expect(calls).toEqual([
      {
        url: "https://api.github.com/repos/rwmicro/learn-nebula/actions/workflows/docker.yml/dispatches",
        method: "POST",
        body: { ref: "main" },
      },
    ]);
    expect((await app.request("/api/admin/rebuild", { method: "POST", headers: AUTH })).status).toBe(429);
  });

  it("the workflow really has a workflow_dispatch trigger", () => {
    const yml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "docker.yml"), "utf8");
    expect(yml).toMatch(/^\s+workflow_dispatch:/m);
  });
});

describe("prereq-accept", () => {
  const NOTE_A = "Applied Sciences/Maths/Suites.md";
  const NOTE_B = "Applied Sciences/Maths/Séries.md";
  const files: Record<string, string> = {
    [NOTE_A]: '---\r\ntitle: "Suites"\r\nprerequis: ["[[Fonctions]]"]\r\n---\r\n\r\nTexte\r\n',
    [NOTE_B]: "---\ntitle: Séries\n---\nTexte\n",
  };
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

  function vault() {
    const blobs: string[] = [];
    const calls = mockGitHub((call) => {
      const u = new URL(call.url);
      const p = u.pathname.replace("/repos/rwmicro/pensine", "");
      if (p.startsWith("/contents/")) {
        const file = Object.keys(files).find((f) => p === `/contents/${enc(f)}`);
        if (!file) return { status: 404, body: { message: "Not Found" } };
        expect(u.searchParams.get("ref")).toBe("main");
        return { body: { type: "file", encoding: "base64", content: Buffer.from(files[file]).toString("base64") } };
      }
      if (p === "/git/ref/heads/main") return { body: { object: { sha: "base-sha" } } };
      if (p === "/git/commits/base-sha") return { body: { tree: { sha: "base-tree" } } };
      if (p === "/git/blobs") {
        blobs.push(Buffer.from(String(call.body!.content), "base64").toString("utf8"));
        return { status: 201, body: { sha: `blob-${blobs.length}` } };
      }
      if (p === "/git/trees") return { status: 201, body: { sha: "new-tree" } };
      if (p === "/git/commits") return { status: 201, body: { sha: "new-commit" } };
      if (p === "/git/refs") return { status: 201, body: {} };
      if (p === "/pulls") return { status: 201, body: { html_url: "https://github.com/rwmicro/pensine/pull/7" } };
      return { status: 500 };
    });
    return { calls, blobs };
  }

  it("is disabled without a token", async () => {
    expect(await (await app.request("/api/admin/prereq-accept", { headers: AUTH })).json()).toMatchObject({
      enabled: false,
    });
    const res = await app.request("/api/admin/prereq-accept", json({ items: [{ notePath: NOTE_A, link: "X" }] }, AUTH));
    expect(res.status).toBe(503);
  });

  it("validates items", async () => {
    env.pensineToken = "gh-test";
    for (const items of [
      [],
      [{ notePath: "../etc/passwd.md", link: "X" }],
      [{ notePath: "/abs.md", link: "X" }],
      [{ notePath: "a/b.txt", link: "X" }],
      [{ notePath: NOTE_A, link: "" }],
      [{ notePath: NOTE_A, link: "a]] [[b" }],
      "nope",
    ]) {
      const res = await app.request("/api/admin/prereq-accept", json({ items }, AUTH));
      expect(res.status).toBe(400);
    }
  });

  it("commits every note on one new branch and opens one PR", async () => {
    env.pensineToken = "gh-test";
    const { calls, blobs } = vault();
    const res = await app.request(
      "/api/admin/prereq-accept",
      json(
        {
          items: [
            { notePath: NOTE_A, link: "Limites" },
            { notePath: NOTE_A, link: "Fonctions" }, // already listed
            { notePath: NOTE_B, link: "Suites" },
          ],
        },
        AUTH,
      ),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { url: string; branch: string; notes: unknown[] };
    expect(data.url).toBe("https://github.com/rwmicro/pensine/pull/7");
    expect(data.branch).toMatch(/^prereq\/\d{4}-\d{2}-\d{2}-[0-9a-f]{7}$/);
    expect(data.notes).toEqual([
      { notePath: NOTE_A, added: ["[[Limites]]"], skipped: ["[[Fonctions]]"] },
      { notePath: NOTE_B, added: ["[[Suites]]"], skipped: [] },
    ]);
    // Byte-exact edits (CRLF kept).
    expect(blobs).toEqual([
      '---\r\ntitle: "Suites"\r\nprerequis: ["[[Fonctions]]", "[[Limites]]"]\r\n---\r\n\r\nTexte\r\n',
      '---\ntitle: Séries\nprerequis: ["[[Suites]]"]\n---\nTexte\n',
    ]);
    const post = (suffix: string) => calls.find((c) => c.method === "POST" && c.url.endsWith(suffix))!;
    expect(post("/git/trees").body).toEqual({
      base_tree: "base-tree",
      tree: [
        { path: NOTE_A, mode: "100644", type: "blob", sha: "blob-1" },
        { path: NOTE_B, mode: "100644", type: "blob", sha: "blob-2" },
      ],
    });
    expect(post("/git/commits").body).toMatchObject({ tree: "new-tree", parents: ["base-sha"] });
    expect(post("/git/refs").body).toEqual({ ref: `refs/heads/${data.branch}`, sha: "new-commit" });
    expect(post("/pulls").body).toMatchObject({ head: data.branch, base: "main" });
    expect(calls.filter((c) => c.url.endsWith("/pulls"))).toHaveLength(1);
  });

  it("writes nothing when every link is already listed", async () => {
    env.pensineToken = "gh-test";
    const { calls } = vault();
    const res = await app.request("/api/admin/prereq-accept", json({ items: [{ notePath: NOTE_A, link: "[[Fonctions]]" }] }, AUTH));
    expect(await res.json()).toMatchObject({ url: null, branch: null });
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("reports a GitHub failure", async () => {
    env.pensineToken = "gh-test";
    vault();
    const res = await app.request("/api/admin/prereq-accept", json({ items: [{ notePath: "missing.md", link: "X" }] }, AUTH));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/404/);
  });
});

describe("rag-debug", () => {
  it("is disabled without embeddings", async () => {
    const info = await (await app.request("/api/admin/rag-debug", { headers: AUTH })).json();
    expect(info).toMatchObject({ enabled: false, topK: 5, minScore: 0.4 });
    const res = await app.request("/api/admin/rag-debug", json({ q: "kabyle" }, AUTH));
    expect(res.status).toBe(503);
  });
});

describe("facts", () => {
  it("404s before the build wrote the list, then passes it through", async () => {
    expect((await app.request("/api/admin/facts", { headers: AUTH })).status).toBe(404);
    fs.writeFileSync(path.join(tmp, "facts-to-check.json"), JSON.stringify({ open: 1, byNote: [] }));
    const res = await app.request("/api/admin/facts", { headers: AUTH });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ open: 1, byNote: [] });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
