// "Écouter", several languages in one note. A note about Mandarin is French
// prose with Chinese in it, a vocabulary table has one language per column:
// the text is cut into passages, one language each, and every passage is
// read by the voice of its language (public/js/audio.js). Pure: the DOM walk
// that feeds it is lib/read-aloud-dom.ts, the sequencing
// lib/read-aloud-player.ts.
import { joinSpeech, type SpeechPart } from "./speech-text";
import { KOKORO_VOICES, MMS_VOICES, kokoroKey, mmsKey } from "./natural-voices";

export interface LangInfo {
  /** French name, the fallback when Intl.DisplayNames has none. */
  name: string;
  /** The language's colour, on white text. */
  color: string;
  /** The BCP 47 tag a voice is looked up with, when the code has none of its
   *  own (Darija reads with an Arabic voice). Empty: no voice can read it. */
  speakAs?: string;
  /** Other names a table header or a vault folder may use (normalised). */
  alias?: string[];
}

/** Every language of the garden, and a few scripts can bring in. */
export const LANGS: Record<string, LangInfo> = {
  fr: { name: "Français", color: "#2f6b4a", alias: ["french"] },
  en: { name: "Anglais", color: "#2c5d8f", alias: ["english"] },
  es: { name: "Espagnol", color: "#b0452c", alias: ["spanish", "castillan"] },
  zh: {
    name: "Mandarin",
    color: "#b3263a",
    alias: ["chinois", "chinese", "hanzi", "caracteres"],
  },
  hi: { name: "Hindi", color: "#a85510" },
  de: { name: "Allemand", color: "#4a4a4a", alias: ["german"] },
  ar: { name: "Arabe", color: "#1f7a52", alias: ["arabic"] },
  tr: { name: "Turc", color: "#a3273f", alias: ["turkish"] },
  ro: { name: "Roumain", color: "#2b4f9e", alias: ["romanian"] },
  ms: { name: "Malais", color: "#1d5d7a", alias: ["malay", "melayu"] },
  id: {
    name: "Indonésien",
    color: "#9a2f2f",
    alias: ["indonesian", "bahasa indonesia"],
  },
  jv: { name: "Javanais", color: "#a65a12", alias: ["javanese", "jawa"] },
  hak: {
    name: "Hakka",
    color: "#7a3e8f",
    speakAs: "",
    alias: ["khek", "hakka khek"],
  },
  nan: {
    name: "Teochew",
    color: "#6b5a4a",
    speakAs: "",
    alias: ["teochiu", "chaozhou"],
  },
  "x-sambas": {
    name: "Sambas",
    color: "#356b70",
    speakAs: "ms",
    alias: ["malais de sambas"],
  },
  tpi: { name: "Tok Pisin", color: "#2d7d3a", speakAs: "" },
  kab: { name: "Kabyle", color: "#8a5a1f", speakAs: "", alias: ["taqbaylit"] },
  ug: { name: "Ouïghour", color: "#2f6f8f", alias: ["uyghur", "ouigour"] },
  ta: { name: "Tamoul", color: "#9c3d6b", alias: ["tamil"] },
  az: {
    name: "Azéri",
    color: "#3d5f2f",
    alias: ["azerbaidjanais", "azerbaijani"],
  },
  ary: {
    name: "Darija",
    color: "#5e7a1f",
    speakAs: "ar",
    alias: ["arabe marocain"],
  },
  ja: { name: "Japonais", color: "#8f2c5d", alias: ["japanese"] },
  ko: { name: "Coréen", color: "#2c6f8f", alias: ["korean"] },
  ru: { name: "Russe", color: "#5a4a8f", alias: ["russian"] },
  th: { name: "Thaï", color: "#7a6a1f", alias: ["thai"] },
};

/** A neutral colour for a language the table does not know. */
export const UNKNOWN_COLOR = "#6f6f6f";

export function langColor(code: string): string {
  return LANGS[code]?.color ?? UNKNOWN_COLOR;
}

/** The short badge of a language: "ZH", "HAK", "SAMBAS" → "SAM". */
export function langBadge(code: string): string {
  return code.replace(/^x-/, "").split("-")[0].slice(0, 3).toUpperCase();
}

/** The tag to look a voice up with; "" when nothing can read the language. */
export function speakTag(code: string): string {
  const info = LANGS[code];
  return info?.speakAs ?? code;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z\u0080-￿]+/g, " ")
    .trim();

let nameIndex: Map<string, string> | null = null;
function names(): Map<string, string> {
  if (nameIndex) return nameIndex;
  nameIndex = new Map();
  for (const [code, info] of Object.entries(LANGS)) {
    nameIndex.set(norm(info.name), code);
    for (const a of info.alias ?? []) nameIndex.set(norm(a), code);
  }
  return nameIndex;
}

/** The language a table header names ("Javanais", "Indonésien (formel)"),
 *  or null: "Sens", "Exemple", "Français courant" are not language names. */
export function langFromHeader(text: string): string | null {
  return names().get(norm(text)) ?? null;
}

/** The language a note studies, from its slug
 *  ("social-sciences/languages-dialects/hakka-khek/…" → "hak"), or null. */
export function langFromSlug(slug: string): string | null {
  const m = /(?:^|\/)languages-dialects\/([^/]+)/.exec(slug.toLowerCase());
  if (!m) return null;
  const folder = norm(decodeURIComponent(m[1]).replace(/-/g, " "));
  const exact = names().get(folder);
  if (exact) return exact;
  for (const [name, code] of names())
    if (folder.split(" ").includes(name)) return code;
  return null;
}

export type Script =
  | "han"
  | "kana"
  | "hangul"
  | "arabic"
  | "devanagari"
  | "tamil"
  | "thai"
  | "cyrillic"
  | "tifinagh";

const SCRIPTS: [Script, RegExp][] = [
  ["han", /\p{Script=Han}/u],
  ["kana", /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ["hangul", /\p{Script=Hangul}/u],
  ["arabic", /\p{Script=Arabic}/u],
  ["devanagari", /\p{Script=Devanagari}/u],
  ["tamil", /\p{Script=Tamil}/u],
  ["thai", /\p{Script=Thai}/u],
  ["cyrillic", /\p{Script=Cyrillic}/u],
  ["tifinagh", /\p{Script=Tifinagh}/u],
];

/** The script of one character, null for Latin and for what belongs to no
 *  language (spaces, digits, punctuation). */
export function scriptOf(ch: string): Script | null {
  for (const [s, re] of SCRIPTS) if (re.test(ch)) return s;
  return null;
}

const LETTER = /\p{L}/u;

/** The languages each script can be, the first one being the default. The
 *  note's studied language wins when it is one of them: the characters of a
 *  Hakka note are Hakka, not Mandarin. */
const SCRIPT_LANGS: Record<Script, string[]> = {
  han: ["zh", "hak", "nan", "ja"],
  kana: ["ja"],
  hangul: ["ko"],
  arabic: ["ar", "ary", "ug"],
  devanagari: ["hi"],
  tamil: ["ta"],
  thai: ["th"],
  cyrillic: ["ru", "ug", "az"],
  tifinagh: ["kab"],
};

export function langForScript(script: Script, studied?: string | null): string {
  const langs = SCRIPT_LANGS[script];
  return studied && langs.includes(studied) ? studied : langs[0];
}

/** Where a piece of text sits in the page: opaque here, a text node and its
 *  offsets for the DOM side, which turns them into highlight ranges. */
export interface Seg<N = unknown> {
  node: N;
  start: number;
  end: number;
}

/** A piece of text in one language, or the end of a block (null). */
export type LangPart<N = unknown> = {
  text: string;
  lang: string;
  seg?: Seg<N>;
} | null;

/**
 * Cuts `text` (in `base`) where the script changes: Latin letters stay in
 * `base`, a run of Chinese characters, Arabic letters… becomes its own
 * piece. Spaces, digits and punctuation stay with the run they follow, so
 * "你好，我来" is one piece and a closing bracket never reads alone.
 */
export function splitByScript<N>(
  text: string,
  base: string,
  studied?: string | null,
  node?: N,
  offset = 0,
): Exclude<LangPart<N>, null>[] {
  const out: Exclude<LangPart<N>, null>[] = [];
  let lang = base;
  let from = 0;
  let i = 0;
  const push = (to: number) => {
    if (to <= from) return;
    const piece: Exclude<LangPart<N>, null> = {
      text: text.slice(from, to),
      lang,
    };
    if (node !== undefined)
      piece.seg = { node, start: offset + from, end: offset + to };
    out.push(piece);
    from = to;
  };
  for (const ch of text) {
    const script = scriptOf(ch);
    const next = script
      ? langForScript(script, studied)
      : LETTER.test(ch)
        ? base
        : null;
    if (next && next !== lang) {
      push(i);
      lang = next;
    }
    i += ch.length;
  }
  push(text.length);
  return out;
}

export interface Passage<N = unknown> {
  lang: string;
  /** What the voice says. */
  text: string;
  /** Where it is in the page, in reading order. */
  segs: Seg<N>[];
}

const SPEAKABLE = /[\p{L}\p{N}]/u;

/** A block shorter than this (a heading, a table cell) is read with the
 *  block after it when both are in one language. */
const MIN_BLOCK = 80;

/**
 * Groups parts into passages, the unit that is read, highlighted and
 * skipped to: a paragraph, or less when the language changes inside it.
 * Consecutive parts of one language make one passage; a block end closes it
 * once it holds a real sentence, so a heading stays with its paragraph and a
 * vocabulary row is not cut cell by cell within one language. A piece with
 * nothing to say (a lone bracket between two languages) joins the passage
 * before it and never changes the voice.
 */
export function buildPassages<N>(parts: LangPart<N>[]): Passage<N>[] {
  type Draft = {
    lang: string;
    parts: SpeechPart[];
    segs: Seg<N>[];
    says: boolean;
    len: number;
  };
  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  for (const p of parts) {
    if (p === null) {
      if (!cur) continue;
      cur.parts.push(null);
      if (cur.says && cur.len >= MIN_BLOCK) cur = null;
      continue;
    }
    const says = SPEAKABLE.test(p.text);
    // Punctuation and spaces never open a passage of their own.
    if (!cur || (says && p.lang !== cur.lang)) {
      cur = { lang: p.lang, parts: [], segs: [], says: false, len: 0 };
      drafts.push(cur);
    }
    cur.parts.push(p.text);
    if (p.seg) cur.segs.push(p.seg);
    cur.says ||= says;
    cur.len += p.text.trim().length;
  }
  const out: Passage<N>[] = [];
  for (const d of drafts) {
    if (!d.says) continue;
    let text = joinSpeech(d.parts);
    // joinSpeech ends every block with a full stop; a passage cut in the
    // middle of a sentence (the voice changes there) has none to add.
    const tail = d.parts[d.parts.length - 1];
    if (
      typeof tail === "string" &&
      text.endsWith(".") &&
      !tail.trimEnd().endsWith(".")
    )
      text = text.slice(0, -1);
    out.push({ lang: d.lang, text, segs: d.segs });
  }
  return out;
}

/** The languages of a reading, in order of first appearance. */
export function passageLangs(passages: { lang: string }[]): string[] {
  return [...new Set(passages.map((p) => p.lang))];
}

export interface Arc {
  lang: string;
  /** 0–100 along the reading, by length of text. */
  start: number;
  end: number;
}

/** The progress ring: one arc per passage, as long as its text. */
export function ringArcs(passages: { lang: string; text: string }[]): Arc[] {
  const total = passages.reduce((n, p) => n + p.text.length, 0);
  if (!total) return [];
  let at = 0;
  return passages.map((p) => {
    const start = (at / total) * 100;
    at += p.text.length;
    return { lang: p.lang, start, end: (at / total) * 100 };
  });
}

/**
 * The ring as drawn: one arc per run of a language. Too many runs would
 * make a ring of dust, and dropping the smallest would erase the very thing
 * it shows (a few Chinese words in French prose): past `max` arcs the ring
 * is cut into max/2 equal slots, each showing its main language and, when
 * there is another one in it, that one too, never thinner than a third of
 * the slot.
 */
export function coarseArcs(arcs: Arc[], max: number): Arc[] {
  const join = (list: Arc[]) =>
    list.reduce<Arc[]>((acc, a) => {
      const last = acc[acc.length - 1];
      if (last && last.lang === a.lang) last.end = a.end;
      else acc.push({ ...a });
      return acc;
    }, []);
  const runs = join(arcs);
  if (runs.length <= max) return runs;
  const slots = Math.max(1, Math.floor(max / 2));
  const out: Arc[] = [];
  for (let i = 0; i < slots; i++) {
    const from = (i * 100) / slots;
    const to = ((i + 1) * 100) / slots;
    const share = new Map<string, number>();
    for (const r of runs) {
      const w = Math.min(r.end, to) - Math.max(r.start, from);
      if (w > 0) share.set(r.lang, (share.get(r.lang) ?? 0) + w);
    }
    // Map keeps the order of first appearance in the slot.
    const byShare = [...share].sort((x, y) => y[1] - x[1]);
    if (!byShare.length) continue;
    if (byShare.length === 1) {
      out.push({ lang: byShare[0][0], start: from, end: to });
      continue;
    }
    const [main, other] = byShare;
    const part = Math.min(0.65, Math.max(0.35, other[1] / (to - from)));
    const otherFirst =
      [...share.keys()].indexOf(other[0]) < [...share.keys()].indexOf(main[0]);
    const cut = otherFirst
      ? from + (to - from) * part
      : to - (to - from) * part;
    out.push({ lang: otherFirst ? other[0] : main[0], start: from, end: cut });
    out.push({ lang: otherFirst ? main[0] : other[0], start: cut, end: to });
  }
  return join(out);
}

/** Who reads around passage `i`: its language, and the nearest other
 *  language before and after it (null when there is none; `usable` leaves
 *  out the passages that will be skipped). */
export function relayAt(
  passages: { lang: string }[],
  i: number,
  usable: (index: number) => boolean = () => true,
): { prev: string | null; now: string | null; next: string | null } {
  const now = passages[i]?.lang ?? null;
  const find = (from: number, step: number) => {
    for (let k = from; k >= 0 && k < passages.length; k += step)
      if (passages[k].lang !== now && usable(k)) return passages[k].lang;
    return null;
  };
  return {
    prev: now ? find(i - 1, -1) : null,
    now,
    next: now ? find(i + 1, 1) : null,
  };
}

// ------------------------------------------------------------------ voices

export type VoiceEngine = "piper" | "system";

/** The ids of the downloadable voices: the three engines of the worker
 *  (public/js/natural-voice-worker.js), all under the engine "piper". */
export const NATURAL_IDS = ["piper", "kokoro", "mms"];

export interface VoiceOption {
  /** Stable id, stored as the reader's choice: "piper", "kokoro", "mms",
   *  "system:Amélie". */
  id: string;
  engine: VoiceEngine;
  /** A Kokoro or MMS voice: its key for the worker (lib/natural-voices.ts). */
  key?: string;
  /** The voice's own name. */
  name: string;
}

export interface SystemVoice {
  name: string;
  lang: string;
  voiceURI?: string;
  localService?: boolean;
}

/** The names of the downloadable voices (their dataset), by language. */
export const PIPER_NAMES: Record<string, string> = {
  fr: "MLS",
  en: "LJSpeech",
  es: "Davefx",
  ar: "Kareem",
  zh: "Huayan",
  de: "Thorsten",
  hi: "Pratham",
  tr: "DFKI",
};

/** iOS and macOS ship a small "compact" voice per language, but the reader
 *  can install far better ones: "Premium", then "Enhanced". Eloquence's
 *  voices and the novelty ones come last. */
export function voiceScore(v: SystemVoice): number {
  const id = `${v.name} ${v.voiceURI ?? ""}`.toLowerCase();
  let s = 0;
  if (/premium/.test(id)) s += 4;
  else if (/enhanced|amélioré|natural|neural/.test(id)) s += 3;
  if (/eloquence|speech\.synthesis\.voice/.test(id)) s -= 3;
  if (v.localService) s += 1;
  return s;
}

/** The installed voices that can read `code`, best first. */
export function systemVoicesFor(
  code: string,
  voices: SystemVoice[],
): SystemVoice[] {
  const tag = speakTag(code).toLowerCase().split("-")[0];
  if (!tag) return [];
  return voices
    .filter(
      (v) =>
        v.lang && v.lang.toLowerCase().replace("_", "-").split("-")[0] === tag,
    )
    .map((v, i) => ({ v, i }))
    .sort((a, b) => voiceScore(b.v) - voiceScore(a.v) || a.i - b.i)
    .map((x) => x.v);
}

/** The id of "whatever voice the device reads this language with". */
export const DEVICE_VOICE = "system:";

/**
 * Every voice the reader can pick for `code`, the downloadable one first.
 * Some browsers speak but list no voice (the list comes late, or never, on
 * some Android WebViews): with an empty list and a `deviceName`, the
 * language gets the device's own voice rather than none. With a list that
 * simply lacks the language it gets nothing: the device would read it with
 * another language's voice.
 */
export function voiceOptions(
  code: string,
  system: SystemVoice[],
  piperOk: boolean,
  deviceName?: string,
): VoiceOption[] {
  const out: VoiceOption[] = [];
  const tag = speakTag(code).toLowerCase().split("-")[0];
  if (piperOk && tag && PIPER_NAMES[tag])
    out.push({ id: "piper", engine: "piper", name: PIPER_NAMES[tag] });
  // Kokoro and MMS also read languages no installed voice does (Hakka has
  // no tag to look a system voice up with): they go by the code itself.
  const natural = (LANGS[code]?.speakAs || code).toLowerCase().split("-")[0];
  if (piperOk && KOKORO_VOICES[natural])
    out.push({
      id: "kokoro",
      engine: "piper",
      name: `${KOKORO_VOICES[natural].name} (Kokoro)`,
      key: kokoroKey(natural)!,
    });
  if (piperOk && MMS_VOICES[natural])
    out.push({
      id: "mms",
      engine: "piper",
      name: "MMS",
      key: mmsKey(natural)!,
    });
  const seen = new Set<string>();
  for (const v of systemVoicesFor(code, system)) {
    if (seen.has(v.name)) continue;
    seen.add(v.name);
    out.push({ id: `system:${v.name}`, engine: "system", name: v.name });
  }
  if (!system.length && deviceName && tag)
    out.push({ id: DEVICE_VOICE, engine: "system", name: deviceName });
  return out;
}

/** The reader's choices, language → voice id. */
export type VoicePrefs = Record<string, string>;

export const VOICE_PREFS_KEY = "gk-voices";

/** Reads what localStorage holds; anything else than a flat map of short
 *  strings is dropped (another tab, an old version, a hand edit). */
export function parseVoicePrefs(raw: string | null | undefined): VoicePrefs {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: VoicePrefs = {};
    for (const [k, id] of Object.entries(v as Record<string, unknown>))
      if (
        /^[a-z-]{2,12}$/.test(k) &&
        typeof id === "string" &&
        id.length <= 120
      )
        out[k] = id;
    return out;
  } catch {
    return {};
  }
}

/**
 * The voice that reads `code`: the reader's choice while it still exists,
 * else the downloadable voice when "voix naturelle" is on, else the best
 * installed one, else the downloadable one. Null: nothing can read this
 * language here, its passages are skipped.
 */
export function chooseVoice(
  code: string,
  options: VoiceOption[],
  prefs: VoicePrefs,
  naturalOn: boolean,
): VoiceOption | null {
  if (!options.length) return null;
  const picked = options.find((o) => o.id === prefs[code]);
  if (picked) return picked;
  const piper = options.find((o) => o.engine === "piper");
  const system = options.find((o) => o.engine === "system");
  if (naturalOn && piper) return piper;
  return system ?? (naturalOn ? (piper ?? null) : null);
}
