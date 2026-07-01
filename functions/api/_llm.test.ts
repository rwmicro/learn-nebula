import { describe, it, expect, vi, afterEach } from "vitest";
import { llmConfig, openaiChatText, openaiChatDeltas } from "./_llm";

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

function mockResponse(init: {
  ok: boolean;
  status?: number;
  json?: unknown;
  body?: ReadableStream<Uint8Array>;
}): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    json: async () => init.json,
    body: init.body,
  } as unknown as Response;
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const d of gen) out.push(d);
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe("llmConfig", () => {
  it("returns null when LLM_BASE_URL is unset (prod path)", () => {
    expect(llmConfig({})).toBeNull();
    expect(llmConfig({ LLM_MODEL: "x" })).toBeNull();
  });

  it("strips trailing slashes and defaults the model", () => {
    expect(llmConfig({ LLM_BASE_URL: "http://127.0.0.1:1234/v1/" })).toEqual({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "local-model",
    });
  });

  it("uses LLM_MODEL when provided", () => {
    expect(
      llmConfig({ LLM_BASE_URL: "http://x/v1", LLM_MODEL: "qwen2.5" }),
    ).toEqual({ baseUrl: "http://x/v1", model: "qwen2.5" });
  });
});

describe("openaiChatText", () => {
  const cfg = { baseUrl: "http://x/v1", model: "m" };

  it("POSTs to /chat/completions and returns the message content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, json: { choices: [{ message: { content: "Bonjour" } }] } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const text = await openaiChatText(cfg, [{ role: "user", content: "hi" }], {
      maxTokens: 64,
    });
    expect(text).toBe("Bonjour");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://x/v1/chat/completions");
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body).toMatchObject({ model: "m", max_tokens: 64, stream: false });
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("returns an empty string when the model sends no content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ ok: true, json: { choices: [] } })),
    );
    expect(await openaiChatText(cfg, [], { maxTokens: 8 })).toBe("");
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 500 })),
    );
    await expect(openaiChatText(cfg, [], { maxTokens: 8 })).rejects.toThrow(
      /500/,
    );
  });
});

describe("openaiChatDeltas (SSE)", () => {
  const cfg = { baseUrl: "http://x/v1", model: "m" };

  it("yields content deltas and stops at [DONE]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          body: streamFrom([
            'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
        }),
      ),
    );
    expect(await collect(openaiChatDeltas(cfg, [], { maxTokens: 16 }))).toEqual([
      "Hel",
      "lo",
    ]);
  });

  it("buffers an SSE line split across stream chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          body: streamFrom([
            'data: {"choices":[{"delta":{"con',
            'tent":"chunked"}}]}\n\n',
          ]),
        }),
      ),
    );
    expect(await collect(openaiChatDeltas(cfg, [], { maxTokens: 16 }))).toEqual([
      "chunked",
    ]);
  });

  it("ignores comments, blank lines and malformed data frames", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          body: streamFrom([
            ": keep-alive\n\n",
            "\n",
            "data: not-json\n\n",
            'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
            'data: {"choices":[{"delta":{}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
        }),
      ),
    );
    expect(await collect(openaiChatDeltas(cfg, [], { maxTokens: 16 }))).toEqual([
      "ok",
    ]);
  });

  it("requests a streaming completion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ ok: true, body: streamFrom(["data: [DONE]\n\n"]) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await collect(openaiChatDeltas(cfg, [{ role: "user", content: "x" }], { maxTokens: 16 }));
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.stream).toBe(true);
  });

  it("throws when the response has no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ ok: true, body: undefined })),
    );
    await expect(
      collect(openaiChatDeltas(cfg, [], { maxTokens: 16 })),
    ).rejects.toThrow();
  });
});
