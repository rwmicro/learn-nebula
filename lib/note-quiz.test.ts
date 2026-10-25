import { describe, it, expect } from "vitest";
import {
  NOTE_PREFIX,
  addQuestion,
  countSaved,
  dueQuestions,
  emptyNoteDeck,
  fadingBySlug,
  retentionBySlug,
  daysAgo,
  gradeQuestion,
  loadAllNoteDecks,
  loadNoteDeck,
  nextDueDay,
  noteKey,
  noteSlugFromPath,
  parseNoteDeck,
  removeQuestion,
  saveNoteDeck,
  allAnsweredCorrectly,
  answeredCorrectly,
  extractQuizItems,
  recordCorrect,
} from "./note-quiz";
import { renderMarkdown, quizId } from "./markdown";

const T = "2026-09-30";
const item = (q: string) => ({ q, a: `<p>${q}?</p>`, url: "/posts/n/", title: "N" });

class MemStore {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe("keys", () => {
  it("namespaces note questions apart from deck slugs", () => {
    expect(noteKey("maths/integration")).toBe("srs:note:maths/integration");
    expect(NOTE_PREFIX.startsWith("srs:")).toBe(true);
  });
  it("reads the note slug off a /posts/ path", () => {
    expect(noteSlugFromPath("/posts/a/b%C3%A9/")).toBe("a/bé");
    expect(noteSlugFromPath("/cartes/")).toBeNull();
  });
});

describe("add / grade / remove", () => {
  it("adds without a grade as a new (immediately due) card", () => {
    const d = addQuestion(emptyNoteDeck(), "q1", item("Q1"), null, T);
    expect(d.items.q1.added).toBe(T);
    expect(d.cards.q1).toBeUndefined();
    expect(dueQuestions({ n: d }, T).map((x) => x.id)).toEqual(["q1"]);
  });
  it("schedules with the self-grade given before adding", () => {
    const knew = addQuestion(emptyNoteDeck(), "q1", item("Q1"), "good", T);
    expect(knew.cards.q1.due).toBe("2026-10-03");
    expect(dueQuestions({ n: knew }, T)).toEqual([]);
    expect(nextDueDay({ n: knew }, T)).toBe("2026-10-03");
    const notYet = addQuestion(emptyNoteDeck(), "q1", item("Q1"), "again", T);
    expect(notYet.cards.q1.due).toBe(T);
  });
  it("counts as fading only the answered questions that are due again", () => {
    const fresh = { ...emptyNoteDeck(), items: { q0: { ...item("Q0"), added: T } } };
    const knew = addQuestion(emptyNoteDeck(), "q1", item("Q1"), "good", T);
    expect(fadingBySlug({ a: fresh, b: knew }, T).size).toBe(0);
    expect(fadingBySlug({ a: fresh, b: knew }, "2026-10-03")).toEqual(new Map([["b", 1]]));
  });
  it("sums what a note's answered questions hold", () => {
    const fresh = { ...emptyNoteDeck(), items: { q0: { ...item("Q0"), added: T } } };
    let b = addQuestion(emptyNoteDeck(), "q1", item("Q1"), "good", T);
    b = addQuestion(b, "q2", item("Q2"), "again", "2026-10-02");
    const r = retentionBySlug({ a: fresh, b }, "2026-10-03");
    expect(r.has("a")).toBe(false);
    expect(r.get("b")).toEqual({ saved: 2, due: 2, last: "2026-10-02" });
    expect(retentionBySlug({ b }, T).get("b")?.due).toBe(0);
  });
  it("says how long ago in days, weeks or months", () => {
    expect(daysAgo(3, "fr")).toBe("il y a 3 jours");
    expect(daysAgo(35, "fr")).toBe("il y a 5 semaines");
    expect(daysAgo(90, "en")).toBe("3 months ago");
  });
  it("ignores grades for unsaved questions and forgets removed ones", () => {
    const d0 = emptyNoteDeck();
    expect(gradeQuestion(d0, "x", "good", T)).toBe(d0);
    const d = removeQuestion(addQuestion(d0, "q1", item("Q1"), "good", T), "q1");
    expect(d.items).toEqual({});
    expect(d.cards).toEqual({});
  });
  it("caps stored HTML", () => {
    const d = addQuestion(emptyNoteDeck(), "q", { ...item("Q"), a: "x".repeat(50_000) }, null, T);
    expect(d.items.q.a.length).toBe(20_000);
  });
});

describe("parse / storage", () => {
  it("round-trips and drops malformed items and orphan states", () => {
    const d = addQuestion(emptyNoteDeck(), "q1", item("Q1"), "good", T);
    const raw = JSON.parse(JSON.stringify(d));
    raw.items.bad = { q: 1 };
    raw.items.js = { ...item("x"), url: "javascript:alert(1)" };
    raw.cards.orphan = { ef: 2.5, iv: 1, reps: 1, due: T };
    const p = parseNoteDeck(JSON.stringify(raw));
    expect(Object.keys(p.items)).toEqual(["q1"]);
    expect(Object.keys(p.cards)).toEqual(["q1"]);
    expect(parseNoteDeck("{oops").items).toEqual({});
  });
  it("loads every note entry and leaves deck progress alone", () => {
    const s = new MemStore();
    s.setItem("srs:some-deck", JSON.stringify({ v: 1, cards: {}, newDay: "", newCount: 0 }));
    saveNoteDeck(s, "a", addQuestion(emptyNoteDeck(), "q1", item("A"), null, T));
    saveNoteDeck(s, "b", addQuestion(emptyNoteDeck(), "q2", item("B"), "good", T));
    const all = loadAllNoteDecks(s);
    expect(Object.keys(all).sort()).toEqual(["a", "b"]);
    expect(countSaved(all)).toBe(2);
    expect(loadNoteDeck(s, "a").items.q1.q).toBe("A");
    saveNoteDeck(s, "a", emptyNoteDeck());
    expect(s.getItem("srs:note:a")).toBeNull();
    expect(s.getItem("srs:some-deck")).not.toBeNull();
  });
  it("orders due questions most overdue first, new ones last", () => {
    let a = addQuestion(emptyNoteDeck(), "new", item("N"), null, T);
    a = addQuestion(a, "old", item("O"), "again", "2026-09-01");
    expect(dueQuestions({ a }, T).map((x) => x.id)).toEqual(["old", "new"]);
  });
});

describe("[!quiz] callouts", () => {
  it("renders a card with the answer hidden behind an aria-expanded button", async () => {
    const { html } = await renderMarkdown("> [!quiz] Qu'est-ce qu'une base ?\n> Une famille libre et génératrice.");
    const id = quizId("Qu’est-ce qu’une base ?");
    expect(html).toContain(`data-quiz-id="${id}"`);
    expect(html).toContain('class="quiz-question"');
    expect(html).toMatch(/<button type="button" class="quiz-reveal" aria-expanded="false" aria-controls="q-[a-z0-9]+-a" data-i18n="quiz.reveal">Afficher la réponse<\/button>/);
    // The hidden answer stays out of the search index; the question does not.
    expect(html).toMatch(/<div class="callout-body quiz-answer" id="q-[a-z0-9]+-a" hidden data-pagefind-ignore><p>Une famille/);
    expect(html).not.toMatch(/class="quiz-question"[^>]*data-pagefind-ignore/);
  });
  it("accepts Obsidian's foldable forms (+ starts revealed)", async () => {
    const minus = (await renderMarkdown("> [!quiz]- Q ?\n> R.")).html;
    expect(minus).toContain('aria-expanded="false"');
    const plus = (await renderMarkdown("> [!quiz]+ Q ?\n> R.")).html;
    expect(plus).toContain('aria-expanded="true"');
    expect(plus).not.toContain(" hidden>");
  });
  it("keeps [!question] a plain callout", async () => {
    const { html } = await renderMarkdown("> [!question] Pourquoi ?\n> Parce que.");
    expect(html).toContain("callout-question");
    expect(html).not.toContain("quiz-reveal");
  });
  it("tells questions apart by their math and dedupes DOM ids", async () => {
    const { html } = await renderMarkdown(
      "> [!quiz] Que vaut $a$ ?\n> 1\n\n> [!quiz] Que vaut $b$ ?\n> 2\n\n> [!quiz] Que vaut $b$ ?\n> 2",
    );
    const ids = [...html.matchAll(/data-quiz-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[1]).toBe(ids[2]);
    expect(html).toContain(`id="q-${ids[1]}-2"`);
  });
});

describe("correct answers (mastery)", () => {
  it("records a correct answer without saving the question", () => {
    const store = new MemStore();
    const d = recordCorrect(emptyNoteDeck(), "q1", T);
    expect(Object.keys(d.items)).toEqual([]);
    saveNoteDeck(store, "n", d);
    // Kept in storage (it holds an answer), but not a review.
    expect(loadNoteDeck(store, "n").ok).toEqual({ q1: T });
    expect(loadAllNoteDecks(store)).toEqual({});
    expect(answeredCorrectly(loadNoteDeck(store, "n"), "q1")).toBe(true);
  });
  it("good/easy grades count, again/hard don't", () => {
    let d = addQuestion(emptyNoteDeck(), "q1", item("Q1"), null, T);
    d = gradeQuestion(d, "q1", "again", T);
    expect(d.ok?.q1).toBeUndefined();
    d = gradeQuestion(d, "q1", "easy", T);
    expect(d.ok?.q1).toBe(T);
    expect(allAnsweredCorrectly(d, ["q1"])).toBe(true);
    expect(allAnsweredCorrectly(d, ["q1", "q2"])).toBe(false);
    expect(allAnsweredCorrectly(d, [])).toBe(false);
  });
  it("migrates entries stored before `ok`: a saved card with a streak counts", () => {
    const legacy = JSON.stringify({
      v: 1,
      cards: { q1: { ef: 2.5, iv: 1, reps: 1, due: "2026-10-01" }, q2: { ef: 2.3, iv: 0, reps: 0, due: T } },
      newDay: T,
      newCount: 2,
      items: { q1: { ...item("Q1"), added: T }, q2: { ...item("Q2"), added: T } },
    });
    const d = parseNoteDeck(legacy);
    expect(d.ok).toEqual({});
    expect(answeredCorrectly(d, "q1")).toBe(true);
    expect(answeredCorrectly(d, "q2")).toBe(false);
    // And round-trips with the new field.
    expect(parseNoteDeck(JSON.stringify(recordCorrect(d, "q2", T))).ok).toEqual({ q2: T });
    expect(parseNoteDeck('{"v":1,"cards":{},"items":{},"ok":{"x":"bad"}}').ok).toEqual({});
  });
});

describe("extractQuizItems (build)", () => {
  it("pulls question, answer and ids from rendered HTML", async () => {
    const { html } = await renderMarkdown(
      "Intro.\n\n> [!quiz] Qu'est-ce qu'une base ?\n> Une famille **libre** et génératrice.\n>\n> > [!note] Remarque\n> > imbriquée\n\nMilieu.\n\n> [!quiz]+ Deux ?\n> Oui.\n\n> [!quiz] Deux ?\n> Oui.",
    );
    const items = extractQuizItems(html);
    expect(items).toHaveLength(3);
    expect(items[0].id).toBe(quizId("Qu’est-ce qu’une base ?"));
    expect(items[0].q).toContain("base");
    expect(items[0].a).toContain("<strong>libre</strong>");
    expect(items[0].a).toContain("imbriquée");
    expect(items[0].a).not.toMatch(/<\/div>$/);
    expect(items[1].id).toBe(items[2].id);
    expect(items[2].domId).toBe(`q-${items[2].id}-2`);
    expect(items[1].a).toContain("Oui.");
  });
  it("returns nothing for a note without quiz", () => {
    expect(extractQuizItems("<p>rien</p>")).toEqual([]);
  });
});
