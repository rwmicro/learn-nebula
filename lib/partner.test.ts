import { describe, expect, it } from "vitest";
import {
  addToHistory,
  closestExpr,
  goalsReached,
  hintFor,
  levelProgress,
  parseCorrection,
  parseHistory,
  parseProgress,
  parseReply,
  partnerSystem,
  recordScene,
  wordDiff,
} from "./partner";
import { PARTNER_DATA, PARTNER_LANGS, SCENE_IDS } from "./partner-scenes";

describe("parseReply", () => {
  it("reads the two labelled lines", () => {
    expect(parseReply("REPLIQUE: ¡Hola! ¿Qué te pongo?\nTRADUCTION: Bonjour ! Je te sers quoi ?")).toEqual({
      line: "¡Hola! ¿Qué te pongo?",
      translation: "Bonjour ! Je te sers quoi ?",
    });
  });
  it("tolerates an accent, bold labels and a reasoning trace", () => {
    expect(parseReply("<think>…</think>**RÉPLIQUE:** Merhaba!\n**TRADUCTION:** Bonjour !")).toEqual({
      line: "Merhaba!",
      translation: "Bonjour !",
    });
  });
  it("takes a bracketed gloss as the translation", () => {
    expect(parseReply("REPLIQUE: ¡Buenas tardes! (Bonjour !)")).toEqual({ line: "¡Buenas tardes!", translation: "Bonjour !" });
  });
  it("keeps the first line of an unformatted answer, ignores a correction", () => {
    expect(parseReply("¡Hola Martin!\nCORRECTION: aucune")).toEqual({ line: "¡Hola Martin!", translation: "" });
  });
  it("ignores a repeated block", () => {
    expect(parseReply("REPLIQUE: A uno.\nTRADUCTION: Un.\nREPLIQUE: B dos.\nTRADUCTION: Deux.").line).toBe("A uno.");
  });
});

describe("parseCorrection", () => {
  it("returns the corrected sentence and why", () => {
    expect(
      parseCorrection("CORRIGE: Quiero dos cafés con leche, por favor.\nPOURQUOI: Pluriel après un nombre.", "Quiero dos café con leche por favor"),
    ).toEqual({ fixed: "Quiero dos cafés con leche, por favor.", why: "Pluriel après un nombre." });
  });
  it("is null when nothing changes (punctuation aside)", () => {
    expect(parseCorrection("CORRIGE: Para llevar.\nPOURQUOI: rien", "para llevar")).toBeNull();
  });
  it("is null for a rewrite too far from what was said", () => {
    expect(parseCorrection("CORRIGE: Buenos días, ¿cómo está usted hoy señor?", "quiero un café")).toBeNull();
  });
});

describe("wordDiff", () => {
  it("strikes and adds words", () => {
    expect(wordDiff("Hola quiero un café con leche", "Hola, me pones un café con leche")).toEqual([
      { op: "same", text: "Hola," },
      { op: "del", text: "quiero" },
      { op: "ins", text: "me pones" },
      { op: "same", text: "un" },
      { op: "same", text: "café" },
      { op: "same", text: "con" },
      { op: "same", text: "leche" },
    ]);
  });
  it("compares Chinese by character", () => {
    expect(wordDiff("我要一个拿铁", "我要一杯拿铁。").map((p) => p.op)).toEqual(["same", "same", "same", "del", "ins", "same", "same"]);
  });
});

describe("closestExpr", () => {
  const exprs = PARTNER_DATA.es.scenes.cafe.exprs;
  it("finds the expression a line almost says", () => {
    expect(closestExpr("puedo pagar con tarjetas", exprs)?.expr.t).toBe("¿Puedo pagar con tarjeta?");
  });
  it("is null for an exact line or an unrelated one", () => {
    expect(closestExpr("¿Puedo pagar con tarjeta?", exprs)).toBeNull();
    expect(closestExpr("me gusta el fútbol", exprs)).toBeNull();
  });
  it("keeps the learner's own end of an open expression", () => {
    const p = PARTNER_DATA.es.scenes.presenter.exprs;
    expect(closestExpr("Trabaja como ingeniero", p)?.target).toBe("Trabajo como ingeniero");
  });
});

describe("goalsReached", () => {
  it("reads the scene's keys, accents aside", () => {
    expect(goalsReached("es", "cafe", "Quiero un CAFÉ")).toEqual([true, false]);
    expect(goalsReached("es", "cafe", "¿cuánto es?")).toEqual([false, true]);
    expect(goalsReached("zh", "cafe", "我要一杯拿铁")).toEqual([true, false]);
    expect(goalsReached("es", "libre", "hola")).toEqual([false, false]);
  });
});

describe("scene data", () => {
  it("gives every language six scenes of six expressions, both goals", () => {
    for (const lang of PARTNER_LANGS)
      for (const s of SCENE_IDS) {
        const d = PARTNER_DATA[lang].scenes[s];
        expect(d.exprs).toHaveLength(6);
        expect(new Set(d.exprs.map((e) => e.g))).toEqual(new Set([0, 1]));
        expect(d.keys[0].length && d.keys[1].length).toBeTruthy();
      }
  });
  it("lets each goal's first expression reach that goal", () => {
    for (const lang of PARTNER_LANGS)
      for (const s of SCENE_IDS)
        for (const g of [0, 1] as const) {
          const h = hintFor(lang, s, g === 0 ? [false, false] : [true, false])!;
          expect(goalsReached(lang, s, h.expr.t)[g], `${lang}/${s}/${g}: ${h.expr.t}`).toBe(true);
        }
  });
});

describe("partnerSystem", () => {
  it("names the partner, the level and the reader's language", () => {
    const s = partnerSystem({ lang: "es", level: "a2", scene: "cafe", swapped: false, uiLang: "en" });
    expect(s).toContain("Lucía");
    expect(s).toContain("A2");
    expect(s).toContain("TRADUCTION: sa traduction en anglais");
  });
});

describe("progress", () => {
  it("counts passes per level and offers the next one at five", () => {
    let p = parseProgress(null);
    for (let i = 0; i < 5; i++) p = recordScene(p, "es", "a2", true);
    p = recordScene(p, "es", "a2", false);
    expect(levelProgress(p, "es", "a2")).toEqual({ done: 5, need: 5, next: "b1", unlocked: true });
    expect(parseProgress(JSON.stringify(p))).toEqual(p);
  });
  it("drops what isn't valid", () => {
    expect(parseProgress('{"xx":{},"es":{"level":"z9","wins":{"a1":-2,"b1":3}}}')).toEqual({
      es: { level: "a1", wins: { b1: 3 } },
    });
  });
});

describe("history", () => {
  const rec = { lang: "es", level: "a2", scene: "cafe", passed: true, fixes: 1, lines: 4, at: "2026-11-04T10:00:00Z" } as const;
  it("keeps the newest first, at most twelve, and drops silent scenes", () => {
    let h = parseHistory(null);
    for (let i = 0; i < 14; i++) h = addToHistory(h, { ...rec, lines: i });
    expect(h).toHaveLength(12);
    expect(h[0].lines).toBe(13);
    expect(h.some((r) => r.lines === 0)).toBe(false);
  });
  it("drops what it can't read", () => {
    expect(parseHistory("{")).toEqual([]);
    expect(parseHistory(JSON.stringify([rec, { ...rec, lang: "xx" }, null]))).toHaveLength(1);
  });
});
