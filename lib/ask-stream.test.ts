import { describe, it, expect, vi } from "vitest";
import { readAskStream } from "./ask-stream";

// Build a ReadableStream from explicit byte-chunks so we can exercise the
// parser's cross-chunk line buffering (a JSON object split mid-line).
function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe("readAskStream (NDJSON assistant stream)", () => {
  it("emits sources first, then accumulates chunk deltas", async () => {
    const onSources = vi.fn();
    const onChunk = vi.fn();
    const result = await readAskStream(
      streamFrom([
        '{"sources":[{"title":"A","url":"/a/"}]}\n',
        '{"chunk":"Hello "}\n{"chunk":"world"}\n',
      ]),
      { onSources, onChunk },
    );
    expect(onSources).toHaveBeenCalledWith([{ title: "A", url: "/a/" }]);
    // onChunk always receives the FULL accumulated text so far.
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual([
      "Hello ",
      "Hello world",
    ]);
    expect(result).toBe("Hello world");
  });

  it("buffers a JSON object split across two stream chunks", async () => {
    const onChunk = vi.fn();
    const result = await readAskStream(streamFrom(['{"chunk":"Hel', 'lo"}\n']), {
      onChunk,
    });
    expect(result).toBe("Hello");
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith("Hello");
  });

  it("appends partialError when the server signals a mid-stream {error}", async () => {
    const onChunk = vi.fn();
    const result = await readAskStream(
      streamFrom(['{"chunk":"partial"}\n{"error":"stream_failed"}\n']),
      { onChunk, partialError: "[interrupted]" },
    );
    expect(result).toBe("partial\n\n[interrupted]");
  });

  it("ignores an {error} line when no partialError handler is set", async () => {
    const result = await readAskStream(
      streamFrom(['{"chunk":"x"}\n{"error":"boom"}\n']),
      {},
    );
    expect(result).toBe("x");
  });

  it("skips blank lines and unparseable JSON", async () => {
    const onSources = vi.fn();
    const result = await readAskStream(
      streamFrom(['\n{"chunk":"x"}\nnot json\n{"chunk":"y"}\n']),
      { onSources },
    );
    expect(result).toBe("xy");
    expect(onSources).not.toHaveBeenCalled();
  });

  it("returns an empty string for an empty stream", async () => {
    expect(await readAskStream(streamFrom([]), {})).toBe("");
  });
});
