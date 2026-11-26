import { describe, expect, it, vi } from "vitest";
import { askContext, askServerAnswer, chatHistory, lastPassage } from "./chat-ask";
import type { ChatMessage } from "../chat-history";

// No browser here: preferredLang() falls back on navigator.language.
vi.stubGlobal("navigator", { language: "fr-FR" });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const signal = new AbortController().signal;

describe("chatHistory / lastPassage", () => {
  const msgs: ChatMessage[] = [
    { role: "user", text: "q1", passage: "p1" },
    { role: "assistant", text: "" },
    ...Array.from({ length: 7 }, (_, i) => ({ role: "assistant" as const, text: `a${i}`.padEnd(2000, ".") })),
    { role: "user", text: "q2" },
  ];
  it("keeps the last six non-empty turns, trimmed", () => {
    const h = chatHistory(msgs);
    expect(h).toHaveLength(6);
    expect(h.at(-1)).toEqual({ role: "user", content: "q2" });
    expect(h[0].content).toHaveLength(1500);
  });
  it("finds the latest passage", () => {
    expect(lastPassage(msgs)).toBe("p1");
    expect(lastPassage([{ role: "user", text: "x" }])).toBe("");
  });
});

describe("askContext", () => {
  it("posts the question and keeps only site-relative sources", async () => {
    const doFetch = vi.fn(async () =>
      json({
        system: "S",
        user: "U",
        sources: [
          { url: "/posts/a/", title: "A" },
          { url: "//evil.example/", title: "B" },
          { url: "https://evil.example/", title: "C" },
        ],
      }),
    );
    const r = await askContext({ question: "Q", selection: "", socratic: true }, signal, doFetch as typeof fetch);
    expect(r).toEqual({ ok: true, system: "S", user: "U", sources: [{ url: "/posts/a/", title: "A" }] });
    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/ask/context");
    expect(JSON.parse(init.body as string)).toEqual({ question: "Q", locale: "fr", socratic: true });
  });
  it("returns the status when the server refuses", async () => {
    const r = await askContext({ question: "Q" }, signal, (async () => json({}, 429)) as typeof fetch);
    expect(r).toEqual({ ok: false, status: 429 });
  });
});

describe("askServerAnswer", () => {
  const stream = (lines: unknown[]) =>
    new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", { status: 200 });

  it("streams sources then the text", async () => {
    const seen: string[] = [];
    let sources: unknown;
    await askServerAnswer(
      { mode: "answer", question: "Q", passage: "" },
      signal,
      { sources: (s) => (sources = s), text: (t) => seen.push(t), error: () => seen.push("ERR"), partialError: "!" },
      (async () => stream([{ sources: [{ url: "/posts/a/", title: "A" }, { url: "" }] }, { chunk: "Bon" }, { chunk: "jour" }])) as typeof fetch,
    );
    expect(sources).toEqual([{ url: "/posts/a/", title: "A" }]);
    expect(seen.at(-1)).toBe("Bonjour");
  });

  it("uses /api/ask/explain for « Avec mes mots », and reports a failure but not an abort", async () => {
    const urls: string[] = [];
    const errors: string[] = [];
    const on = { sources: () => {}, text: () => {}, error: () => errors.push("e"), partialError: "!" };
    await askServerAnswer({ mode: "own", question: "Q", passage: "P" }, signal, on, (async (u: string) => {
      urls.push(u);
      return json({}, 500);
    }) as unknown as typeof fetch);
    await askServerAnswer({ mode: "answer", question: "Q", passage: "" }, signal, on, (async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }) as typeof fetch);
    expect(urls).toEqual(["/api/ask/explain"]);
    expect(errors).toEqual(["e"]);
  });
});
