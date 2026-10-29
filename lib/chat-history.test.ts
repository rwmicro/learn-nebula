import { describe, expect, it } from "vitest";
import {
  CHATS_KEY,
  MAX_CHATS,
  chatTitle,
  deleteChat,
  groupByNote,
  loadChats,
  saveChat,
  type Conversation,
} from "./chat-history";

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

const conv = (id: string, updated: number, url?: string): Conversation => ({
  id,
  title: `Q ${id}`,
  note: url ? { title: `Note ${url}`, url } : null,
  scope: "",
  mode: "answer",
  updated,
  messages: [{ role: "user", text: "Question ?" }],
});

describe("chat history", () => {
  it("saves newest first and replaces by id", () => {
    const s = memStore();
    saveChat(s, conv("a", 1));
    saveChat(s, conv("b", 2));
    saveChat(s, { ...conv("a", 3), title: "Nouveau" });
    const chats = loadChats(s);
    expect(chats.map((c) => c.id)).toEqual(["a", "b"]);
    expect(chats[0].title).toBe("Nouveau");
  });

  it("keeps at most MAX_CHATS", () => {
    const s = memStore();
    for (let i = 0; i < MAX_CHATS + 5; i++) saveChat(s, conv(String(i), i));
    expect(loadChats(s)).toHaveLength(MAX_CHATS);
  });

  it("drops malformed entries and unsafe note urls", () => {
    const s = memStore({
      [CHATS_KEY]: JSON.stringify([
        { id: "x" },
        { ...conv("ok", 1), note: { title: "T", url: "//evil.example/" } },
      ]),
    });
    const chats = loadChats(s);
    expect(chats).toHaveLength(1);
    expect(chats[0].note).toBeNull();
  });

  it("survives broken JSON", () => {
    expect(loadChats(memStore({ [CHATS_KEY]: "{" }))).toEqual([]);
  });

  it("deletes", () => {
    const s = memStore();
    saveChat(s, conv("a", 1));
    expect(deleteChat(s, "a")).toEqual([]);
  });

  it("groups by note, most recent first", () => {
    const groups = groupByNote([
      conv("1", 1, "/posts/a/"),
      conv("2", 5, "/posts/b/"),
      conv("3", 3, "/posts/a/"),
      conv("4", 4),
    ]);
    expect(groups.map((g) => g.note?.url ?? "")).toEqual([
      "/posts/b/",
      "",
      "/posts/a/",
    ]);
    expect(groups[2].chats.map((c) => c.id)).toEqual(["3", "1"]);
  });

  it("titles from the first question", () => {
    expect(chatTitle("  Qu'est-ce que   la dichotomie ? ", "x")).toBe(
      "Qu'est-ce que la dichotomie ?",
    );
    expect(chatTitle("", "Passage")).toBe("Passage");
    expect(chatTitle("a".repeat(80), "x")).toHaveLength(58);
  });
});
