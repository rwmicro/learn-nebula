import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";
import { parseTimeline, periodYear, sameSentence, keyLine } from "./exercises";

const data = (html: string) => {
  const m = html.match(/data-ex-data="([^"]*)"/);
  return m ? JSON.parse(m[1].replace(/&#x22;|&quot;/g, '"').replace(/&#x26;|&amp;/g, "&")) : null;
};

describe("exercise callouts", () => {
  it("builds a word bank from a translation", async () => {
    const { html, hasQuiz } = await renderMarkdown(
      "> [!traduire] Je m’appelle Andi.\n> Nama saya Andi.\n> aussi: Saya Andi.\n> piège: adalah, kamu",
    );
    expect(hasQuiz).toBe(true);
    expect(html).toContain('data-ex="traduire"');
    expect(data(html)).toEqual({ answer: "Nama saya Andi.", also: ["Saya Andi."], traps: ["adalah", "kamu"] });
    // The answer is only in the attribute, never in the text.
    expect(html.replace(/data-ex-data="[^"]*"/, "")).not.toContain("Nama saya");
  });

  it("keeps a list's order and its intruders", async () => {
    const { html } = await renderMarkdown("> [!ordre] Les étapes\n> 1. Un\n> 2. Deux\n> 3. Trois\n>\n> piège: Zéro");
    expect(data(html)).toEqual({ items: ["Un", "Deux", "Trois"], traps: ["Zéro"] });
  });

  it("pairs a two-column table", async () => {
    const { html } = await renderMarkdown(
      "> [!associer] Capitales\n> | Pays | Capitale |\n> |---|---|\n> | France | Paris |\n> | Japon | Tokyo |",
    );
    expect(data(html)).toEqual({ pairs: [["France", "Paris"], ["Japon", "Tokyo"]] });
  });

  it("points at a line of a code block", async () => {
    const { html } = await renderMarkdown(
      "> [!ligne] Quelle ligne divise par zéro ?\n> ```python\n> a = 1\n> b = 0\n> print(a / b)\n> ```\n> ligne: 3\n>\n> On divise par `b`, qui vaut 0.",
    );
    expect(data(html)).toEqual({ line: 3 });
    expect(html).toContain('class="callout-body ex-after"');
  });

  it("falls back to a plain callout when the body holds no exercise", async () => {
    const { html } = await renderMarkdown("> [!ordre] Rien\n> Juste du texte.");
    expect(html).not.toContain("data-ex=");
    expect(html).toContain("callout-ex");
  });
});

describe("frise", () => {
  it("reads periods as years", () => {
    expect(periodYear("1789")).toBe(1789);
    expect(periodYear("-300 av. J.-C.")).toBe(-300);
    expect(periodYear("300 av. J.-C.")).toBe(-300);
    expect(periodYear("VIIIe siècle")).toBe(750);
    expect(Number.isNaN(periodYear("Renaissance"))).toBe(true);
  });

  it("sorts a timeline and spreads six events over it", () => {
    const src = ["timeline", "  title T", ...Array.from({ length: 10 }, (_, i) => `  ${1900 + i * 10} : E${i}`)].join("\n");
    const items = parseTimeline(src)!;
    expect(items).toHaveLength(6);
    expect(items[0].what).toBe("E0");
    expect(items[5].what).toBe("E9");
    expect(parseTimeline("timeline\n 1869 : B\n 1865 : A\n 1900 : C")!.map((e) => e.what)).toEqual(["A", "B", "C"]);
    expect(parseTimeline("timeline\n Avant : A\n 1865 : B\n 1900 : C")).toBeNull();
  });

  it("adds the card after a mermaid timeline", async () => {
    const { html, hasQuiz } = await renderMarkdown("```mermaid\ntimeline\n 1789 : Révolution\n 1815 : Waterloo\n 1848 : Printemps\n```");
    expect(html).toContain('class="frise-ex"');
    expect(hasQuiz).toBe(true);
  });
});

describe("helpers", () => {
  it("compares sentences loosely", () => {
    expect(sameSentence("Nama saya Andi.", "nama  saya andi")).toBe(true);
    expect(sameSentence("Saya nama Andi", "Nama saya Andi")).toBe(false);
  });
  it("reads key lines with or without accents", () => {
    expect(keyLine("Piège : a, b")).toEqual({ key: "piege", value: "a, b" });
    expect(keyLine("faille: 4")).toEqual({ key: "ligne", value: "4" });
    expect(keyLine("Nama saya")).toBeNull();
  });
});
