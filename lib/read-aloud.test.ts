import { describe, expect, it } from "vitest";
import {
  buildPassages,
  chooseVoice,
  coarseArcs,
  langBadge,
  langForScript,
  langFromHeader,
  langFromSlug,
  LANGS,
  parseVoicePrefs,
  passageLangs,
  relayAt,
  ringArcs,
  scriptOf,
  speakTag,
  splitByScript,
  systemVoicesFor,
  voiceOptions,
  type LangPart,
  type SystemVoice,
  type VoiceOption,
} from "./read-aloud";
import { PIPER_NAMES } from "./read-aloud";
import { PIPER_VOICES } from "./piper-voice";

const texts = (ps: { lang: string; text: string }[]) =>
  ps.map((p) => `${p.lang}:${p.text}`);

describe("languages", () => {
  it("every colour is a hex dark enough for white text", () => {
    for (const [code, info] of Object.entries(LANGS)) {
      expect(info.color, code).toMatch(/^#[0-9a-f]{6}$/);
      const [r, g, b] = [1, 3, 5]
        .map((i) => parseInt(info.color.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // WCAG AA for the small white code on the colour.
      expect(1.05 / (lum + 0.05), code).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("badges are short", () => {
    expect(langBadge("zh")).toBe("ZH");
    expect(langBadge("hak")).toBe("HAK");
    expect(langBadge("x-sambas")).toBe("SAM");
    expect(langBadge("zh-Hant")).toBe("ZH");
  });
  it("reads a dialect with the voice of its nearest language, or with none", () => {
    expect(speakTag("ary")).toBe("ar");
    expect(speakTag("x-sambas")).toBe("ms");
    expect(speakTag("nan")).toBe("");
    expect(speakTag("fr")).toBe("fr");
    expect(speakTag("xx")).toBe("xx");
  });
  it("names table headers", () => {
    expect(langFromHeader("Javanais")).toBe("jv");
    expect(langFromHeader(" INDONÉSIEN ")).toBe("id");
    expect(langFromHeader("Indonésien (formel)")).toBe("id");
    expect(langFromHeader("Français")).toBe("fr");
    expect(langFromHeader("Hakka-Khek")).toBe("hak");
    expect(langFromHeader("Sens")).toBeNull();
    expect(langFromHeader("Français courant")).toBeNull();
    expect(langFromHeader("")).toBeNull();
  });
  it("finds the studied language in a slug", () => {
    expect(
      langFromSlug(
        "social-sciences/languages-dialects/mandarin/01-phonologie/pinyin",
      ),
    ).toBe("zh");
    expect(
      langFromSlug("social-sciences/languages-dialects/hakka-khek/x"),
    ).toBe("hak");
    expect(
      langFromSlug(
        "social-sciences/languages-dialects/indon%C3%A9sien/05-culture/javanais",
      ),
    ).toBe("id");
    expect(langFromSlug("social-sciences/languages-dialects/tok-pisin/a")).toBe(
      "tpi",
    );
    expect(langFromSlug("applied-sciences/maths/mandarin")).toBeNull();
    expect(
      langFromSlug("social-sciences/languages-dialects/klingon/a"),
    ).toBeNull();
  });
});

describe("scripts", () => {
  it("tells scripts apart, and leaves Latin and punctuation alone", () => {
    expect(scriptOf("语")).toBe("han");
    expect(scriptOf("ع")).toBe("arabic");
    expect(scriptOf("न")).toBe("devanagari");
    expect(scriptOf("த")).toBe("tamil");
    expect(scriptOf("ⵣ")).toBe("tifinagh");
    expect(scriptOf("é")).toBeNull();
    expect(scriptOf("，")).toBeNull();
    expect(scriptOf("3")).toBeNull();
  });
  it("gives a script to the studied language when it can be", () => {
    expect(langForScript("han")).toBe("zh");
    expect(langForScript("han", "hak")).toBe("hak");
    expect(langForScript("han", "id")).toBe("zh");
    expect(langForScript("arabic", "ug")).toBe("ug");
    expect(langForScript("arabic", "ary")).toBe("ary");
    expect(langForScript("tifinagh", "fr")).toBe("kab");
  });
  it("cuts French prose around Chinese", () => {
    const got = splitByScript(
      "Le mandarin (普通话 pǔtōnghuà, ou 国语) est",
      "fr",
    );
    expect(got.map((p) => [p.lang, p.text])).toEqual([
      ["fr", "Le mandarin ("],
      ["zh", "普通话 "],
      ["fr", "pǔtōnghuà, ou "],
      ["zh", "国语) "],
      ["fr", "est"],
    ]);
  });
  it("keeps a sentence with its own punctuation in one piece", () => {
    expect(splitByScript("你好，我来。", "fr").map((p) => p.text)).toEqual([
      "你好，我来。",
    ]);
  });
  it("does nothing to text in one language", () => {
    expect(splitByScript("Bonjour, 3 fois.", "fr")).toEqual([
      { text: "Bonjour, 3 fois.", lang: "fr" },
    ]);
    expect(splitByScript("", "fr")).toEqual([]);
    expect(splitByScript("  ", "fr").map((p) => p.lang)).toEqual(["fr"]);
  });
  it("leaves Latin words with the prose when the prose is Chinese (pinyin, names)", () => {
    expect(splitByScript("我说 pinyin 很好", "zh").map((p) => p.lang)).toEqual([
      "zh",
    ]);
  });
  it("counts offsets in UTF-16 units, astral characters included", () => {
    const node = {};
    const got = splitByScript("a 𠀀𠀁 b", "fr", null, node, 10);
    expect(got.map((p) => [p.lang, p.seg?.start, p.seg?.end])).toEqual([
      ["fr", 10, 12],
      ["zh", 12, 17],
      ["fr", 17, 18],
    ]);
    expect(got.every((p) => p.seg?.node === node)).toBe(true);
  });
});

describe("passages", () => {
  const P = (lang: string, text: string): LangPart => ({ lang, text });
  it("groups by language and breaks sentences at blocks", () => {
    const got = buildPassages([
      P("fr", "Titre"),
      null,
      P("fr", "Le mot "),
      P("zh", "国语"),
      P("fr", " veut dire"),
      null,
    ]);
    expect(texts(got)).toEqual([
      "fr:Titre. Le mot",
      "zh:国语",
      "fr:veut dire.",
    ]);
  });
  it("never lets punctuation read alone or change the voice", () => {
    const got = buildPassages([
      P("fr", "Le ("),
      P("zh", "普通话"),
      P("fr", ", "),
      P("zh", "国语"),
      P("fr", ") est"),
    ]);
    expect(texts(got)).toEqual(["fr:Le (", "zh:普通话, 国语", "fr:) est"]);
  });
  it("reads a long paragraph on its own, a heading with what follows", () => {
    const long =
      "Une phrase assez longue pour faire un vrai paragraphe, bien au-delà du seuil fixé.";
    const got = buildPassages([
      P("fr", "Titre"),
      null,
      P("fr", long),
      null,
      P("fr", long),
      null,
      P("fr", "Fin"),
      null,
    ]);
    expect(got.map((p) => p.text)).toEqual([`Titre. ${long}`, long, "Fin."]);
  });
  it("does not let a stray dash between two paragraphs become a passage", () => {
    const long = "x".repeat(90);
    expect(
      buildPassages([
        P("fr", long),
        null,
        P("fr", " — "),
        null,
        P("zh", "国语"),
        null,
      ]).map((p) => p.lang),
    ).toEqual(["fr", "zh"]);
  });
  it("drops what has nothing to say", () => {
    expect(buildPassages([P("fr", " — "), null, P("fr", "…")])).toEqual([]);
    expect(buildPassages([])).toEqual([]);
    expect(buildPassages([null, null])).toEqual([]);
  });
  it("reads a vocabulary row one language per cell", () => {
    const got = buildPassages([
      null,
      P("jv", "Lunga"),
      null,
      null,
      P("id", "Pergi"),
      null,
      null,
      P("fr", "Partir"),
      null,
    ]);
    expect(texts(got)).toEqual(["jv:Lunga.", "id:Pergi.", "fr:Partir."]);
  });
  it("keeps where each passage is", () => {
    const a = { node: 1, start: 0, end: 3 };
    const b = { node: 2, start: 0, end: 2 };
    const got = buildPassages([
      { lang: "fr", text: "Un ", seg: a },
      { lang: "fr", text: "et", seg: b },
    ]);
    expect(got[0].segs).toEqual([a, b]);
  });
  it("lists the languages in order of appearance", () => {
    expect(
      passageLangs([
        { lang: "fr" },
        { lang: "zh" },
        { lang: "fr" },
        { lang: "jv" },
      ]),
    ).toEqual(["fr", "zh", "jv"]);
  });
});

describe("ring", () => {
  it("is as long as the text", () => {
    const arcs = ringArcs([
      { lang: "fr", text: "aaaaaa" },
      { lang: "zh", text: "bb" },
      { lang: "fr", text: "cc" },
    ]);
    expect(arcs).toEqual([
      { lang: "fr", start: 0, end: 60 },
      { lang: "zh", start: 60, end: 80 },
      { lang: "fr", start: 80, end: 100 },
    ]);
    expect(ringArcs([])).toEqual([]);
  });
  it("keeps the minority language visible when there are too many arcs", () => {
    const many = ringArcs(
      Array.from({ length: 60 }, (_, i) => ({
        lang: i % 2 ? "zh" : "fr",
        text: i % 2 ? "x" : "xxxxxxxxx",
      })),
    );
    const few = coarseArcs(many, 12);
    expect(few.length).toBeLessThanOrEqual(12);
    expect(few[0].start).toBe(0);
    expect(few[few.length - 1].end).toBeCloseTo(100);
    for (let i = 1; i < few.length; i++) {
      expect(few[i].start).toBeCloseTo(few[i - 1].end);
      expect(few[i].lang).not.toBe(few[i - 1].lang);
    }
    // A tenth of the text, yet a third of each slot: it can be seen.
    const zh = few.filter((a) => a.lang === "zh");
    expect(zh.length).toBeGreaterThan(0);
    for (const a of zh)
      expect(a.end - a.start).toBeGreaterThanOrEqual((100 / 6) * 0.35 - 1e-9);
    expect(coarseArcs(many.slice(0, 3), 12)).toHaveLength(3);
  });
  it("leaves a stretch in one language as one arc among the slots", () => {
    const text = [
      ...Array.from({ length: 40 }, (_, i) => ({
        lang: i % 2 ? "zh" : "fr",
        text: "xx",
      })),
      { lang: "fr", text: "x".repeat(400) },
    ];
    const few = coarseArcs(ringArcs(text), 12);
    expect(few[few.length - 1].lang).toBe("fr");
    expect(few[few.length - 1].end - few[few.length - 1].start).toBeGreaterThan(
      60,
    );
  });
  it("draws paragraphs of one language as one arc", () => {
    const arcs = ringArcs([
      { lang: "fr", text: "aa" },
      { lang: "fr", text: "aa" },
      { lang: "zh", text: "b" },
    ]);
    expect(coarseArcs(arcs, 28)).toEqual([
      { lang: "fr", start: 0, end: 80 },
      { lang: "zh", start: 80, end: 100 },
    ]);
  });
});

describe("relay", () => {
  const ps = [{ lang: "fr" }, { lang: "zh" }, { lang: "nan" }, { lang: "fr" }];
  it("says who read, who reads, who is next", () => {
    expect(relayAt(ps, 1)).toEqual({ prev: "fr", now: "zh", next: "nan" });
    expect(relayAt(ps, 0)).toEqual({ prev: null, now: "fr", next: "zh" });
    expect(relayAt(ps, 3)).toEqual({ prev: "nan", now: "fr", next: null });
    expect(relayAt(ps, 2)).toEqual({ prev: "zh", now: "nan", next: "fr" });
  });
  it("names the next other language, past paragraphs of the same one", () => {
    const same = [
      { lang: "fr" },
      { lang: "fr" },
      { lang: "zh" },
      { lang: "zh" },
      { lang: "fr" },
    ];
    expect(relayAt(same, 0)).toEqual({ prev: null, now: "fr", next: "zh" });
    expect(relayAt(same, 3)).toEqual({ prev: "fr", now: "zh", next: "fr" });
    expect(relayAt([{ lang: "fr" }, { lang: "fr" }], 0)).toEqual({
      prev: null,
      now: "fr",
      next: null,
    });
  });
  it("looks past the passages nobody can read", () => {
    expect(relayAt(ps, 1, (i) => ps[i].lang !== "nan")).toEqual({
      prev: "fr",
      now: "zh",
      next: "fr",
    });
  });
  it("survives an index out of range", () => {
    expect(relayAt(ps, 9).now).toBeNull();
    expect(relayAt([], 0)).toEqual({ prev: null, now: null, next: null });
  });
});

describe("voices", () => {
  const sys: SystemVoice[] = [
    { name: "Thomas", lang: "fr-FR", localService: true },
    {
      name: "Audrey (Premium)",
      lang: "fr_FR",
      voiceURI: "com.apple.voice.premium.fr-FR.Audrey",
      localService: true,
    },
    { name: "Eddy", lang: "fr-FR", voiceURI: "com.apple.eloquence.fr-FR.Eddy" },
    { name: "Tingting", lang: "zh-CN" },
    { name: "Majed", lang: "ar-SA" },
    { name: "Damayanti", lang: "id-ID" },
  ];
  it("names a downloadable voice for every language that has one, and only those", () => {
    expect(Object.keys(PIPER_NAMES).sort()).toEqual(
      Object.keys(PIPER_VOICES).sort(),
    );
  });
  it("sorts the installed voices, the best first", () => {
    expect(systemVoicesFor("fr", sys).map((v) => v.name)).toEqual([
      "Audrey (Premium)",
      "Thomas",
      "Eddy",
    ]);
    expect(systemVoicesFor("ary", sys).map((v) => v.name)).toEqual(["Majed"]);
    expect(systemVoicesFor("nan", sys)).toEqual([]);
    expect(systemVoicesFor("jv", sys)).toEqual([]);
  });
  it("lists what the reader can pick", () => {
    expect(voiceOptions("zh", sys, true).map((o) => o.id)).toEqual([
      "piper",
      "system:Tingting",
    ]);
    expect(voiceOptions("zh", sys, false).map((o) => o.id)).toEqual([
      "system:Tingting",
    ]);
    expect(voiceOptions("id", sys, true).map((o) => o.id)).toEqual([
      "system:Damayanti",
    ]);
    expect(voiceOptions("ary", [], true).map((o) => o.name)).toEqual([
      "Kareem",
    ]);
    expect(voiceOptions("nan", sys, true)).toEqual([]);
    expect(voiceOptions("jv", sys, true)).toEqual([]);
  });
  it("falls back to the device's own voice when the browser lists none", () => {
    expect(voiceOptions("fr", [], false, "Appareil")).toEqual([
      { id: "system:", engine: "system", name: "Appareil" },
    ]);
    expect(voiceOptions("zh", [], true, "Appareil").map((o) => o.id)).toEqual([
      "piper",
      "system:",
    ]);
    // No voice can read Teochew, listed or not.
    expect(voiceOptions("nan", [], true, "Appareil")).toEqual([]);
    // A list without the language: nothing, not another language's voice.
    expect(voiceOptions("jv", sys, true, "Appareil")).toEqual([]);
    expect(voiceOptions("fr", [], false)).toEqual([]);
  });
  it("lists a voice once even when the browser reports it twice", () => {
    expect(
      voiceOptions("zh", [...sys, { name: "Tingting", lang: "zh-CN" }], false),
    ).toHaveLength(1);
  });

  const piper: VoiceOption = { id: "piper", engine: "piper", name: "MLS" };
  const thomas: VoiceOption = {
    id: "system:Thomas",
    engine: "system",
    name: "Thomas",
  };
  const amelie: VoiceOption = {
    id: "system:Amélie",
    engine: "system",
    name: "Amélie",
  };
  it("keeps the reader's choice while it exists", () => {
    expect(
      chooseVoice("fr", [piper, thomas, amelie], { fr: "system:Amélie" }, true),
    ).toBe(amelie);
    expect(chooseVoice("fr", [piper, thomas], { fr: "piper" }, false)).toBe(
      piper,
    );
  });
  it("forgets a choice that is gone (a voice uninstalled, another device)", () => {
    expect(
      chooseVoice("fr", [piper, thomas], { fr: "system:Amélie" }, false),
    ).toBe(thomas);
  });
  it("takes the natural voice only once it is turned on", () => {
    expect(chooseVoice("fr", [piper, thomas], {}, true)).toBe(piper);
    expect(chooseVoice("fr", [piper, thomas], {}, false)).toBe(thomas);
    // Nothing installed and the switch off: no download behind the reader's back.
    expect(chooseVoice("fr", [piper], {}, false)).toBeNull();
    expect(chooseVoice("fr", [piper], {}, true)).toBe(piper);
  });
  it("skips a language nothing can read", () => {
    expect(chooseVoice("nan", [], {}, true)).toBeNull();
  });
  it("only trusts well-formed stored choices", () => {
    expect(parseVoicePrefs('{"fr":"piper","zh":"system:Tingting"}')).toEqual({
      fr: "piper",
      zh: "system:Tingting",
    });
    expect(parseVoicePrefs(null)).toEqual({});
    expect(parseVoicePrefs("")).toEqual({});
    expect(parseVoicePrefs("not json")).toEqual({});
    expect(parseVoicePrefs("[1]")).toEqual({});
    expect(parseVoicePrefs('"fr"')).toEqual({});
    expect(
      parseVoicePrefs('{"fr":3,"__proto__":"x","FR":"a","zh":"ok"}'),
    ).toEqual({ zh: "ok" });
    expect(parseVoicePrefs(JSON.stringify({ fr: "x".repeat(500) }))).toEqual(
      {},
    );
  });
});
