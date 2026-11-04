// The logic of /parler/, the voice partner (components/play/LanguagePartner.tsx),
// kept pure so it is tested (partner.test.ts): the prompts, reading the
// model's answer, the goals a learner's line reaches, the comparison of a
// line with the scene's expressions or with the corrector's sentence (the
// coloured correction in the bubble), and the progress kept per language.
//
// What the tests of 2026-11-04 showed (pensine's partenaire-vocal notes): a
// small model plays the partner well but finds no mistakes while it plays,
// so a correction never comes from the partner's own answer. On a phone the
// correction compares the line with the scene's expressions; the optional
// corrector (a bigger model, desktop only) is a second, separate prompt.

import { editDistance, normaliseSpoken } from "./speech-match";
import {
  LEVEL_IDS,
  PARTNER_DATA,
  type LevelId,
  type PartnerLang,
  type SceneExpr,
  type SceneId,
} from "./partner-scenes";

export type SceneChoice = SceneId | "libre";

/** The partner's language as the prompt names it (in French). */
export const LANG_NAME_FR: Record<PartnerLang, string> = {
  es: "espagnol",
  en: "anglais",
  de: "allemand",
  fr: "français",
  zh: "chinois mandarin (caractères simplifiés)",
  ar: "arabe standard moderne",
  hi: "hindi (écriture devanagari)",
  id: "indonésien",
  tr: "turc",
};

/** The reader's interface language, as the prompt names it. */
const UI_NAME_FR: Record<string, string> = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  zh: "chinois",
  ar: "arabe",
  id: "indonésien",
};

const LEVEL_RULES: Record<LevelId, string> = {
  a1: "niveau A1 : phrases de 6 mots au plus, mots très courants, présent seulement",
  a2: "niveau A2 : phrases de 10 mots au plus, vocabulaire de tous les jours",
  b1: "niveau B1 : phrases naturelles de 15 mots au plus ; donne ton avis, pose des questions ouvertes",
  b2: "niveau B2 : débit naturel, expressions idiomatiques, un peu d'humour, 20 mots au plus",
};

/** Speech rate of the partner's voice per level (1 = normal). */
export const LEVEL_RATE: Record<LevelId, number> = { a1: 0.8, a2: 0.9, b1: 1, b2: 1.05 };

const SCENE_TEXT: Record<SceneChoice, [string, string]> = {
  // [the partner's role, the same scene with the roles swapped]
  cafe: [
    "Au café : tu es serveur ou serveuse ; l'apprenant commande une boisson, puis paie.",
    "Au café, rôles inversés : tu es le client, l'apprenant est le serveur. Commande une boisson, puis demande à payer.",
  ],
  presenter: [
    "Faire connaissance : demande à l'apprenant son nom, d'où il vient et son métier, et réponds à ses questions.",
    "Faire connaissance, rôles inversés : c'est l'apprenant qui te pose les questions ; réponds-y et présente-toi.",
  ],
  chemin: [
    "Dans la rue : tu es un passant ; l'apprenant cherche la gare. Explique-lui le chemin simplement.",
    "Dans la rue, rôles inversés : tu es un touriste perdu qui cherche la gare ; l'apprenant t'explique le chemin.",
  ],
  libre: [
    "Conversation libre : discute de ce que l'apprenant veut, comme un ami curieux.",
    "Conversation libre : discute de ce que l'apprenant veut, comme un ami curieux.",
  ],
};

export function partnerName(lang: PartnerLang, level: LevelId): string {
  return PARTNER_DATA[lang].partners[Math.max(0, LEVEL_IDS.indexOf(level))];
}

/** The partner's system prompt: who it is, the level, the scene, and the
 *  two-line answer (the line, then its translation for the reader). */
export function partnerSystem(opts: {
  lang: PartnerLang;
  level: LevelId;
  scene: SceneChoice;
  swapped: boolean;
  uiLang: string;
}): string {
  const L = LANG_NAME_FR[opts.lang];
  const ui = UI_NAME_FR[opts.uiLang] ?? "français";
  const who = partnerName(opts.lang, opts.level);
  const city = PARTNER_DATA[opts.lang].city;
  return `Tu es ${who}, à ${city}. Tu joues une scène avec un apprenant qui parle ${ui} et apprend le ${L}.
${SCENE_TEXT[opts.scene][opts.swapped ? 1 : 0]}
Tu parles uniquement ${L}, ${LEVEL_RULES[opts.level]}. Une seule réplique à la fois, qui finit souvent par une question pour faire avancer la scène. Ne corrige pas l'apprenant.
Réponds toujours en exactement deux lignes, sans rien d'autre :
REPLIQUE: ta réplique, en ${L}.
TRADUCTION: sa traduction en ${ui}.`;
}

/** The first turn the partner answers (the scene starts). */
export const OPENING_TURN = "(La scène commence. Salue-moi et lance la conversation.)";

/** The corrector's prompt (a separate call, never the partner's). */
export function correctorSystem(lang: PartnerLang, uiLang: string): string {
  const L = LANG_NAME_FR[lang];
  const ui = UI_NAME_FR[uiLang] ?? "français";
  return `Tu es professeur de ${L}. On te donne une phrase dite par un élève débutant (transcrite depuis l'oral : ignore la ponctuation et les majuscules). Si elle contient une faute de grammaire ou de vocabulaire, réécris-la corrigée en changeant le moins possible. Réponds en deux lignes exactement :
CORRIGE: la phrase corrigée (ou la phrase telle quelle si elle est juste)
POURQUOI: l'explication en ${ui} en moins de 12 mots, ou « rien »`;
}

/** What follows a `</think>` (a reasoning trace that slipped through). */
function afterThink(raw: string): string {
  const end = raw.lastIndexOf("</think>");
  return end >= 0 ? raw.slice(end + 8) : raw;
}

const LABEL = /^\s*\**\s*(R[ÉE]PLIQUE|TRADUCTION|CORRECTION|CORRIGE|CORRIGÉ|POURQUOI)\s*\**\s*[:：]\s*\**\s*/i;

function labelled(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  let current = "";
  for (const line of afterThink(raw).split(/\r?\n/)) {
    const m = LABEL.exec(line);
    if (m) {
      current = m[1].toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
      if (!out.has(current)) out.set(current, line.slice(m[0].length).trim());
      else current = "#"; // a second block: ignore it
    } else if (current && current !== "#" && line.trim() && !out.get(current)) {
      out.set(current, line.trim());
    }
  }
  return out;
}

/** Quotes or a trailing "(…)" gloss a model may wrap its line in. */
function tidy(s: string): string {
  return s
    .replace(/\s*\((?:en|in) [^)]*\)\s*$/i, "")
    .replace(/^["«“]\s*|\s*["»”]$/g, "")
    .trim();
}

/** The partner's answer as {line, translation}; a model that ignored the
 *  format still gives its first line as the line. */
export function parseReply(raw: string): { line: string; translation: string } {
  const m = labelled(raw);
  let line = tidy(m.get("REPLIQUE") ?? "");
  let translation = tidy(m.get("TRADUCTION") ?? "");
  if (!line) {
    const first = afterThink(raw)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !LABEL.test(l));
    line = tidy(first ?? "");
  }
  // "¿Qué tal? (Comment ça va ?)": the gloss in brackets is the translation.
  const gloss = /^(.*\S)\s*\(([^()]{3,})\)\s*$/.exec(line);
  if (gloss) {
    line = gloss[1];
    if (!translation) translation = gloss[2];
  }
  if (translation === line) translation = "";
  return { line, translation };
}

/** The corrector's sentence, or null when it says nothing usable: the same
 *  sentence, or one too far from what was said to be a correction (a model
 *  that rewrote everything). */
export function parseCorrection(raw: string, said: string): { fixed: string; why: string } | null {
  const m = labelled(raw);
  const fixed = tidy(m.get("CORRIGE") ?? "");
  if (!fixed) return null;
  const a = normaliseSpoken(said);
  const b = normaliseSpoken(fixed);
  if (!b || a === b) return null;
  if (similarity(tokens(a), tokens(b)) < 0.5) return null;
  const why = tidy(m.get("POURQUOI") ?? "");
  return { fixed, why: /^rien\b/i.test(why) ? "" : why };
}

// --- comparing a line with an expression -----------------------------------

const HAN = /\p{Script=Han}/u;

/** Words of a normalised line; Chinese, which has no spaces, by character. */
export function tokens(normalised: string): string[] {
  const out: string[] = [];
  for (const w of normalised.split(" ")) {
    if (!w) continue;
    if (HAN.test(w)) out.push(...[...w]);
    else out.push(w);
  }
  return out;
}

/** 1 − word edit distance / longer length. */
export function similarity(a: string[], b: string[]): number {
  const n = Math.max(a.length, b.length);
  if (!n) return 1;
  // editDistance works on strings by code point: map each word to one.
  const dict = new Map<string, string>();
  const code = (w: string) => {
    if (!dict.has(w)) dict.set(w, String.fromCodePoint(0xe000 + dict.size));
    return dict.get(w)!;
  };
  return 1 - editDistance(a.map(code).join(""), b.map(code).join("")) / n;
}

export interface DiffPart {
  /** "same": kept; "del": said but not in the target; "ins": missing. */
  op: "same" | "del" | "ins";
  text: string;
}

/** Word-by-word difference from what was said to the target, for the
 *  coloured bubble (struck words, highlighted additions). Words are shown as
 *  written in each sentence; they are compared normalised. */
export function wordDiff(said: string, target: string): DiffPart[] {
  const split = (s: string) => {
    const shown: string[] = [];
    for (const w of s.split(/\s+/).filter(Boolean)) {
      if (HAN.test(w)) shown.push(...[...w].filter((c) => !/[\p{P}\s]/u.test(c)));
      else shown.push(w);
    }
    return shown.map((w) => ({ w, n: normaliseSpoken(w) })).filter((x) => x.n);
  };
  const a = split(said);
  const b = split(target);
  // LCS table.
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i][j] = a[i].n === b[j].n ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (op: DiffPart["op"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op && op !== "same") last.text += ` ${text}`;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].n === b[j].n) {
      push("same", b[j].w);
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) push("del", a[i++].w);
    else push("ins", b[j++].w);
  }
  while (i < a.length) push("del", a[i++].w);
  while (j < b.length) push("ins", b[j++].w);
  return out;
}

/** The scene expression a line was trying to say, when it is close but not
 *  quite it (similarity ≥ 0.5 and < 1). An expression ending in "…" ("Me
 *  llamo…") is compared with as many words of the line, the rest being the
 *  learner's own (a name, a city). */
export function closestExpr(said: string, exprs: readonly SceneExpr[]): { expr: SceneExpr; target: string } | null {
  const heard = tokens(normaliseSpoken(said));
  if (!heard.length) return null;
  let best: { expr: SceneExpr; target: string; s: number } | null = null;
  for (const e of exprs) {
    const cut = e.t.indexOf("…");
    const prefix = cut >= 0 ? e.t.slice(0, cut) : e.t;
    const want = tokens(normaliseSpoken(prefix));
    if (!want.length) continue; // "…'da yaşıyorum": nothing fixed to compare
    let mine = heard;
    let target = e.t;
    if (cut >= 0) {
      // The rest of the line is the learner's own (a name, a city).
      mine = heard.slice(0, want.length);
      const rest = said.trim().split(/\s+/).slice(prefix.trim().split(/\s+/).length).join(" ");
      target = `${prefix.trim()}${rest ? ` ${rest}` : ""}`;
    }
    const s = similarity(mine, want);
    if (!best || s > best.s) best = { expr: e, target, s };
  }
  if (!best || best.s < 0.5 || best.s >= 1) return null;
  // Short expressions: one word off out of two is a different sentence
  // (an open one, "Trabajo como…", is followed by the learner's own words).
  const fixed = tokens(normaliseSpoken(best.expr.t.split("…")[0])).length;
  if (fixed < (best.expr.t.includes("…") ? 2 : 3)) return null;
  return { expr: best.expr, target: best.target };
}

/** Which of the scene's two goals a line reaches. */
export function goalsReached(lang: PartnerLang, scene: SceneChoice, said: string): [boolean, boolean] {
  if (scene === "libre") return [false, false];
  const heard = ` ${normaliseSpoken(said)} `;
  const flat = heard.replace(/ /g, "");
  const keys = PARTNER_DATA[lang].scenes[scene].keys;
  const hit = (k: string) => {
    const n = normaliseSpoken(k);
    return HAN.test(n) ? flat.includes(n.replace(/ /g, "")) : heard.includes(` ${n}`);
  };
  return [keys[0].some(hit), keys[1].some(hit)];
}

/** The three steps of the coach for the next goal not reached yet: the idea
 *  (the goal's name, an i18n key), the words (the goal's first keys) and the
 *  sentence (its first expression). Null in a free conversation, or once
 *  both goals are reached. */
export function hintFor(
  lang: PartnerLang,
  scene: SceneChoice,
  reached: readonly boolean[],
): { goal: 0 | 1; ideaKey: string; words: string[]; expr: SceneExpr } | null {
  if (scene === "libre") return null;
  const goal = !reached[0] ? 0 : !reached[1] ? 1 : null;
  if (goal === null) return null;
  const data = PARTNER_DATA[lang].scenes[scene];
  const expr = data.exprs.find((e) => e.g === goal)!;
  const words = data.keys[goal].slice(0, 3);
  return { goal, ideaKey: `parler.goal_${scene}_${goal}`, words, expr };
}

// --- progress -----------------------------------------------------------------

/** localStorage key: {lang: {level, wins: {level: count}}}. */
export const PARTNER_KEY = "gk-partner";

/** Scenes to pass at a level before the next one is offered. */
export const WINS_TO_LEVEL_UP = 5;

export interface LangProgress {
  level: LevelId;
  wins: Partial<Record<LevelId, number>>;
}
export type PartnerProgress = Partial<Record<PartnerLang, LangProgress>>;

export function parseProgress(raw: string | null): PartnerProgress {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? "");
  } catch {
    return {};
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: PartnerProgress = {};
  for (const [lang, p] of Object.entries(v as Record<string, unknown>)) {
    if (!(lang in PARTNER_DATA) || !p || typeof p !== "object") continue;
    const { level, wins } = p as { level?: unknown; wins?: unknown };
    const lv = LEVEL_IDS.includes(level as LevelId) ? (level as LevelId) : "a1";
    const w: Partial<Record<LevelId, number>> = {};
    if (wins && typeof wins === "object")
      for (const [k, n] of Object.entries(wins as Record<string, unknown>))
        if (LEVEL_IDS.includes(k as LevelId) && Number.isInteger(n) && (n as number) > 0)
          w[k as LevelId] = Math.min(n as number, 9999);
    out[lang as PartnerLang] = { level: lv, wins: w };
  }
  return out;
}

/** A scene finished: a pass (both goals reached) counts at its level. */
export function recordScene(prog: PartnerProgress, lang: PartnerLang, level: LevelId, passed: boolean): PartnerProgress {
  const cur = prog[lang] ?? { level, wins: {} };
  const wins = { ...cur.wins };
  if (passed) wins[level] = (wins[level] ?? 0) + 1;
  return { ...prog, [lang]: { level: cur.level, wins } };
}

export function setLevel(prog: PartnerProgress, lang: PartnerLang, level: LevelId): PartnerProgress {
  return { ...prog, [lang]: { level, wins: { ...(prog[lang]?.wins ?? {}) } } };
}

/** Where the reader stands at a level: scenes passed, and the next level
 *  (null at the last one). */
export function levelProgress(prog: PartnerProgress, lang: PartnerLang, level: LevelId) {
  const done = Math.min(prog[lang]?.wins[level] ?? 0, WINS_TO_LEVEL_UP);
  const i = LEVEL_IDS.indexOf(level);
  const next = i >= 0 && i < LEVEL_IDS.length - 1 ? LEVEL_IDS[i + 1] : null;
  return { done, need: WINS_TO_LEVEL_UP, next, unlocked: done >= WINS_TO_LEVEL_UP };
}
