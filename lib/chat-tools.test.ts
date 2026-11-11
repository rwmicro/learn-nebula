import { describe, expect, it } from "vitest";
import type { Conversation } from "./chat-history";
import {
  conversationMarkdown,
  downloadSecondsLeft,
  exportFileName,
  nextSection,
  railGroups,
  searchChats,
  searchNotes,
  tickDownload,
} from "./chat-tools";

const NOW = new Date("2026-11-05T15:00:00").getTime();
const H = 3_600_000;
const conv = (
  id: string,
  updated: number,
  extra: Partial<Conversation> = {},
): Conversation => ({
  id,
  title: `Q ${id}`,
  note: null,
  scope: "",
  mode: "answer",
  updated,
  messages: [{ role: "user", text: "Question ?" }],
  ...extra,
});

describe("railGroups", () => {
  it("puts pinned first, then this note, then by age", () => {
    const note = { title: "Newton", url: "/posts/newton/" };
    const g = railGroups(
      [
        conv("today", NOW - H),
        conv("pin", NOW - 400 * H, { pinned: true }),
        conv("here", NOW - 300 * H, { note }),
        conv("week", NOW - 72 * H),
        conv("old", NOW - 400 * H),
      ],
      "/posts/newton/",
      NOW,
    );
    expect(g.map((x) => [x.key, x.chats.map((c) => c.id)])).toEqual([
      ["pinned", ["pin"]],
      ["note", ["here"]],
      ["today", ["today"]],
      ["week", ["week"]],
      ["earlier", ["old"]],
    ]);
  });
  it("leaves out empty groups", () => {
    expect(railGroups([conv("a", NOW)], null, NOW).map((g) => g.key)).toEqual([
      "today",
    ]);
  });
});

describe("searchChats", () => {
  const chats = [
    conv("a", 1, { title: "Différence masse et poids" }),
    conv("b", 2, {
      messages: [{ role: "assistant", text: "L'impesanteur dans l'ISS" }],
    }),
  ];
  it("matches titles and messages, without accents or case", () => {
    expect(searchChats(chats, "difference POIDS").map((c) => c.id)).toEqual([
      "a",
    ]);
    expect(searchChats(chats, "iss").map((c) => c.id)).toEqual(["b"]);
    expect(searchChats(chats, "  ").length).toBe(2);
    expect(searchChats(chats, "masse iss").length).toBe(0);
  });
});

describe("conversationMarkdown", () => {
  it("writes questions, passages, answers and numbered sources", () => {
    const md = conversationMarkdown(
      conv("a", NOW, {
        title: "Masse",
        note: { title: "Newton", url: "/posts/newton/" },
        messages: [
          {
            role: "user",
            text: "Pourquoi ?",
            passage: "P = mg",
            passageFrom: "Section : Poids",
          },
          {
            role: "assistant",
            text: "Parce que [1].",
            sources: [
              {
                title: "Newton",
                url: "/posts/newton/#poids",
                crumb: "Newton › Poids",
              },
            ],
          },
        ],
      }),
      {
        me: "Moi",
        garden: "Jardin",
        note: "Note",
        passage: "Passage",
        sources: "Sources",
      },
      "https://4d52.net",
      new Date("2026-11-05T12:00:00Z"),
    );
    expect(md).toBe(
      [
        "# Masse",
        "",
        "_Note : [Newton](https://4d52.net/posts/newton/) · 2026-11-05_",
        "",
        "**Moi** : Pourquoi ?",
        "",
        "> Passage (Section : Poids) :",
        "> P = mg",
        "",
        "**Jardin** :",
        "",
        "Parce que [1].",
        "",
        "Sources :",
        "1. [Newton › Poids](https://4d52.net/posts/newton/#poids)",
        "",
      ].join("\n"),
    );
  });
});

describe("exportFileName", () => {
  it("keeps the title's words in ASCII", () => {
    expect(exportFileName("Différence entre masse et poids ?")).toBe(
      "difference-entre-masse-et-poids.md",
    );
    expect(exportFileName("…")).toBe("conversation.md");
  });
});

describe("nextSection", () => {
  const src = [
    { title: "Newton", url: "/a", crumb: "Newton › Le poids" },
    {
      title: "Énergie",
      url: "/b",
      crumb: "Énergie et Travail › Travail du poids",
    },
  ];
  it("offers a section the question didn't name", () => {
    expect(nextSection("Parle-moi du poids", src)).toBe("Le poids");
    expect(
      nextSection("Explique le poids", [{ ...src[0], crumb: "Newton" }]),
    ).toBe("");
    expect(nextSection("Le poids ?", src)).toBe("Travail du poids");
  });
});

describe("searchNotes", () => {
  const notes = [
    { title: "Lois de Newton", href: "/n", folder: "Physique/Mécanique" },
    { title: "Énergie et Travail", href: "/e", folder: "Physique/Mécanique" },
    { title: "Cinématique", href: "/c", folder: "Physique/Mécanique" },
    { title: "Docker", href: "/d", folder: "Informatique" },
  ];
  it("finds by title words without accents, title prefix first", () => {
    expect(searchNotes(notes, "energie").map((n) => n.href)).toEqual(["/e"]);
    // Folder-only matches, shortest title first.
    expect(searchNotes(notes, "mecanique").map((n) => n.href)).toEqual([
      "/c",
      "/n",
      "/e",
    ]);
  });
  it("lists the open note's neighbours without a query, never the note itself", () => {
    expect(searchNotes(notes, "", "/n").map((n) => n.href)).toEqual([
      "/e",
      "/c",
    ]);
    expect(searchNotes(notes, "newton", "/n")).toEqual([]);
  });
});

describe("sourceSection", () => {
  it("drops the note's section numbers", () => {
    expect(
      nextSection("x", [
        { title: "N", url: "/a", crumb: "Newton › 1.1 Forces usuelles" },
      ]),
    ).toBe("Forces usuelles");
  });
});

describe("download time left", () => {
  it("waits for two seconds and some bytes", () => {
    const c = tickDownload(null, 0, 100, 0);
    expect(downloadSecondsLeft(c, 100, 1000, 1000)).toBeNull();
    expect(downloadSecondsLeft(c, 100, 1000, 3000)).toBeNull();
  });
  it("uses the average speed since the start", () => {
    const c = tickDownload(null, 0, 0, 0);
    // 200 bytes in 4 s: 50 B/s, 800 left.
    expect(downloadSecondsLeft(c, 200, 1000, 4000)).toBe(16);
  });
  it("restarts on a new download", () => {
    const c = tickDownload({ t0: 0, loaded0: 0 }, 900, 10, 5000);
    expect(c).toEqual({ t0: 5000, loaded0: 10 });
    expect(tickDownload(c, 10, 20, 6000)).toBe(c);
  });
});
