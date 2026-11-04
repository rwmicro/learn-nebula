"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { addQuestion, loadNoteDeck, saveNoteDeck } from "@/lib/note-quiz";
import { aiRoute, generateOnDevice, type AiRoute } from "@/lib/garden-ai";
import {
  CORRECTOR,
  correctorEnabled,
  correctorSupported,
  deleteCorrector,
  loadLocalModel,
  localModel,
  localModelError,
  localModelCached,
  onLoadProgress,
  promptLocal,
  setCorrectorEnabled,
  setLocalModelEnabled,
  type ChatTurn,
} from "@/lib/local-llm";
import {
  addToHistory,
  closestExpr,
  correctorSystem,
  goalsReached,
  hintFor,
  LEVEL_RATE,
  levelProgress,
  OPENING_TURN,
  HISTORY_KEY,
  parseCorrection,
  parseHistory,
  parseProgress,
  parseReply,
  similarity,
  tokens,
  partnerName,
  partnerSystem,
  PARTNER_KEY,
  recordScene,
  setLevel as setProgressLevel,
  wordDiff,
  type DiffPart,
  type PartnerProgress,
  type SceneRecord,
  type SceneChoice,
} from "@/lib/partner";
import {
  LEVEL_IDS,
  PARTNER_DATA,
  PARTNER_LANGS,
  SCENE_IDS,
  SOON_LANGS,
  type LevelId,
  type PartnerLang,
  type SceneExpr,
} from "@/lib/partner-scenes";
import {
  canListen,
  hasSystemVoice,
  listen,
  listenMode,
  naturalVoiceFor,
  naturalVoiceOn,
  prepareListening,
  setNaturalVoice,
  speak,
  unlockAudio,
  type Listening,
  type ListenMode,
  type Speaking,
} from "@/lib/partner-voice";
import { normaliseSpoken } from "@/lib/speech-match";

// /parler/: a voice partner per language, on the model of /echecs/'s bot.
// Four moments:
// - the setup: the language, a partner per level (the one of the reader's
//   level marked), the scene, roles swapped or not;
// - the warm-up: the scene's six expressions, to hear and repeat;
// - the conversation: hold (or tap) to speak, the partner answers aloud with
//   its translation under the line (shown, blurred or hidden), every word can
//   be touched for its meaning and kept as a card, a three-step coach (the
//   idea, the words, the sentence), the scene's two goals at the top, and
//   the reader's line shown corrected word by word when it is close to an
//   expression of the scene, or when the optional corrector finds a mistake;
// - the review: goals, hints, the lines to work on (each can become a card),
//   the vault note, the way to the next level.
//
// Everything runs in the browser (lib/garden-ai.ts): the partner is Gemini
// Nano or the downloaded model, the corrector a bigger one, desktop only.

type Phase = "setup" | "warmup" | "talk" | "review";
type Subs = "show" | "blur" | "hide";
type Note = { href: string; title: string; slug: string };

interface Turn {
  who: "partner" | "me";
  text: string;
  translation?: string;
  /** The model's raw answer (what the history sends back to it). */
  raw?: string;
  /** My line, corrected word by word. */
  diff?: DiffPart[];
  fixed?: string;
  why?: string;
  /** Where the correction comes from. */
  via?: "scene" | "corrector";
  streaming?: boolean;
}

interface Prefs {
  lang: PartnerLang;
  level: LevelId;
  scene: SceneChoice;
  swapped: boolean;
  subs: Subs | null;
}

const PREFS_KEY = "gk-partner-prefs";
const DEFAULT_PREFS: Prefs = { lang: "es", level: "a2", scene: "cafe", swapped: false, subs: null };

function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    if (!v) return DEFAULT_PREFS;
    return {
      lang: PARTNER_LANGS.includes(v.lang as PartnerLang) ? (v.lang as PartnerLang) : DEFAULT_PREFS.lang,
      level: LEVEL_IDS.includes(v.level as LevelId) ? (v.level as LevelId) : DEFAULT_PREFS.level,
      scene: [...SCENE_IDS, "libre"].includes(v.scene as string) ? (v.scene as SceneChoice) : DEFAULT_PREFS.scene,
      swapped: !!v.swapped,
      subs: v.subs === "show" || v.subs === "blur" || v.subs === "hide" ? v.subs : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: nothing kept */
  }
}

/** Subtitles fade with the level unless the reader chose. */
function defaultSubs(level: LevelId): Subs {
  return level === "a1" || level === "a2" ? "show" : level === "b1" ? "blur" : "hide";
}

function cardId(lang: PartnerLang, text: string): string {
  let h = 0;
  for (const c of normaliseSpoken(text)) h = (h * 31 + c.codePointAt(0)!) | 0;
  return `parler-${lang}-${(h >>> 0).toString(36)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

const ic = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const MicIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" {...ic}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...ic}>
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);
const BulbIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...ic}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />
  </svg>
);
const KeyboardIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...ic}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </svg>
);
const SubsIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...ic}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 13h4M13 13h4M7 16h6" />
  </svg>
);

type Translator = { translate(s: string): Promise<string> };
type TranslatorApi = {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<Translator>;
};
const translators = new Map<string, Promise<Translator | null>>();
function browserTranslator(from: string, to: string): Promise<Translator | null> {
  const key = `${from}>${to}`;
  if (!translators.has(key))
    translators.set(
      key,
      (async () => {
        const T = (globalThis as unknown as { Translator?: TranslatorApi }).Translator;
        if (!T) return null;
        try {
          const a = await T.availability({ sourceLanguage: from, targetLanguage: to });
          if (a !== "available") return null;
          return await T.create({ sourceLanguage: from, targetLanguage: to });
        } catch {
          return null;
        }
      })(),
    );
  return translators.get(key)!;
}

/** "#lang=es" (a language note's card, the home): that language, at the
 *  level the reader reached in it. The hash is then dropped, so a reload
 *  keeps the reader's own later choice. */
function withHashLang(prefs: Prefs): Prefs {
  const wanted = /(?:^#|&)lang=([a-z]{2})\b/.exec(location.hash)?.[1] as PartnerLang | undefined;
  if (!wanted || !PARTNER_LANGS.includes(wanted)) return prefs;
  window.history.replaceState(null, "", location.pathname + location.search);
  let level: LevelId | undefined;
  try {
    level = parseProgress(localStorage.getItem(PARTNER_KEY))[wanted]?.level;
  } catch {
    /* storage blocked */
  }
  const next = { ...prefs, lang: wanted, ...(level ? { level } : {}) };
  write(PREFS_KEY, next);
  return next;
}

export function LanguagePartner({ notes }: { notes: Partial<Record<PartnerLang, Note>> }) {
  const locale = useLocale();
  const tr = useCallback((k: string, v?: Record<string, string | number>) => t(k, v, locale), [locale]);

  const [phase, setPhase] = useState<Phase>("setup");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [progress, setProgress] = useState<PartnerProgress>({});
  const [route, setRoute] = useState<AiRoute | null>(null);
  const [mode, setMode] = useState<ListenMode>("none");
  const [dl, setDl] = useState<{ pct: number } | null>(null);
  const [corrector, setCorrector] = useState<{ supported: boolean; on: boolean; dl: number | null }>({
    supported: false,
    on: false,
    dl: null,
  });

  const [turns, setTurns] = useState<Turn[]>([]);
  const [reached, setReached] = useState<[boolean, boolean]>([false, false]);
  const [hint, setHint] = useState<0 | 1 | 2 | 3>(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [interim, setInterim] = useState("");
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [word, setWord] = useState<{ turn: number; word: string; meaning: string | null } | null>(null);
  const [cards, setCards] = useState<Set<string>>(new Set());
  const [warm, setWarm] = useState<Record<number, "ok" | "close" | "listening">>({});
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState<SceneRecord[]>([]);
  const [natural, setNatural] = useState(false);
  const [canNatural, setCanNatural] = useState(false);
  /** The natural voice downloading (0–100), while a line waits for it. */
  const [voicePct, setVoicePct] = useState<number | null>(null);
  /** No system voice for the language (Arabic, Hindi on many phones). */
  const [noVoice, setNoVoice] = useState(false);
  /** Why the partner last failed to answer (the model's own message). */
  const [failWhy, setFailWhy] = useState("");
  /** The microphone stopped on an error (refused, no audio). */
  const [micError, setMicError] = useState<string | null>(null);

  const listening = useRef<Listening | null>(null);
  const speaking = useRef<Speaking | null>(null);
  const abort = useRef<AbortController | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const log = useRef<HTMLOListElement | null>(null);
  const pressAt = useRef(0);

  const { lang, level, scene, swapped } = prefs;
  const data = PARTNER_DATA[lang];
  const tag = data.tag;
  const subs: Subs = prefs.subs ?? defaultSubs(level);
  const who = partnerName(lang, level);
  const exprs: SceneExpr[] = scene === "libre" ? [] : data.scenes[scene].exprs;
  const gloss = (e: SceneExpr) => (locale === "fr" ? e.fr : e.en);

  useEffect(() => {
    setPrefs(withHashLang(readPrefs()));
    try {
      setProgress(parseProgress(localStorage.getItem(PARTNER_KEY)));
      setHistory(parseHistory(localStorage.getItem(HISTORY_KEY)));
      setNatural(naturalVoiceOn());
    } catch {
      /* storage blocked */
    }
    void correctorSupported().then((supported) => setCorrector((c) => ({ ...c, supported, on: supported && correctorEnabled() })));
  }, []);

  useEffect(() => {
    const onHash = () => setPrefs((cur) => withHashLang(cur));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let live = true;
    setRoute(null);
    void aiRoute(lang).then((r) => live && setRoute(r));
    void listenMode(tag).then((m) => live && setMode(m));
    void Promise.resolve().then(() => live && setCanNatural(naturalVoiceFor(tag)));
    void hasSystemVoice(tag).then((has) => live && setNoVoice(!has));
    return () => {
      live = false;
    };
  }, [lang, tag]);

  useEffect(() => {
    turnsRef.current = turns;
    log.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns]);

  useEffect(
    () => () => {
      listening.current?.cancel();
      speaking.current?.stop();
      abort.current?.abort();
    },
    [],
  );

  const update = (p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      write(PREFS_KEY, next);
      return next;
    });
  };

  /** Say a line aloud, showing the natural voice's download when it has to
   *  fetch it first (the first line of a language: about 60 MB). */
  const hear = (text: string, rate: number): Speaking => {
    const s = speak(text, tag, rate, (p) => setVoicePct(p < 100 ? p : null));
    void s.done.then(() => setVoicePct(null));
    return s;
  };
  /** The same from a click: the audio is unlocked inside it (iOS). */
  const hearNow = (text: string, rate: number) => {
    unlockAudio();
    hear(text, rate);
  };

  // --- the model --------------------------------------------------------------

  const ensureModel = async (): Promise<"nano" | "local" | null> => {
    const r = route ?? (await aiRoute(lang));
    if (r === "nano") return "nano";
    if (r === "local" || r === "download") {
      if (r === "download") setLocalModelEnabled(true);
      const cached = await localModelCached();
      const off = onLoadProgress((p) => !cached && setDl({ pct: Math.floor((p.loaded / Math.max(1, p.total)) * 100) }));
      if (!cached) setDl({ pct: 0 });
      const ok = await loadLocalModel();
      off();
      setDl(null);
      setRoute("local");
      return ok ? "local" : null;
    }
    return null;
  };

  const historyFor = (list: Turn[]): ChatTurn[] => {
    const h: ChatTurn[] = [{ role: "user", content: OPENING_TURN }];
    for (const tu of list) {
      if (tu.streaming) continue;
      h.push(tu.who === "partner" ? { role: "assistant", content: tu.raw ?? tu.text } : { role: "user", content: tu.text });
    }
    // The opening turn is the prompt when nothing was said yet.
    return h;
  };

  const partnerAnswers = async (list: Turn[]) => {
    const r = await ensureModel();
    if (!r) {
      setFailWhy(localModelError());
      setFailed(true);
      setState("idle");
      return;
    }
    setState("thinking");
    const ctrl = new AbortController();
    abort.current = ctrl;
    const hist = historyFor(list);
    const prompt = hist.pop()!.content;
    const idx = list.length;
    setTurns([...list, { who: "partner", text: "", streaming: true }]);
    let raw: string | null = null;
    try {
      raw = await generateOnDevice({
        route: r,
        system: partnerSystem({ lang, level, scene, swapped, uiLang: locale }),
        prompt,
        history: hist,
        lang,
        maxTokens: 140,
        signal: ctrl.signal,
        onText: (text) => {
          const { line } = parseReply(text);
          if (line) setTurns((ts) => ts.map((tu, i) => (i === idx ? { ...tu, text: line } : tu)));
        },
      });
    } catch {
      return; // aborted: the scene was left
    }
    const reply = raw ? parseReply(raw) : null;
    if (!reply?.line) {
      setTurns(list);
      setFailWhy(r === "local" ? localModelError() : "");
      setFailed(true);
      setState("idle");
      return;
    }
    const done: Turn = { who: "partner", text: reply.line, translation: reply.translation, raw: `REPLIQUE: ${reply.line}\nTRADUCTION: ${reply.translation}` };
    setTurns([...list, done]);
    setState("speaking");
    speaking.current = hear(reply.line, LEVEL_RATE[level]);
    await speaking.current.done;
    speaking.current = null;
    setState("idle");
  };

  const correct = async (idx: number, said: string) => {
    if (!corrector.on) return;
    let raw: string | null = null;
    try {
      raw = await promptLocal({ model: CORRECTOR, system: correctorSystem(lang, locale), prompt: said, maxTokens: 70 });
    } catch {
      return;
    }
    const c = raw ? parseCorrection(raw, said) : null;
    if (!c) return;
    setTurns((ts) =>
      ts.map((tu, i) => (i === idx ? { ...tu, diff: wordDiff(said, c.fixed), fixed: c.fixed, why: c.why, via: "corrector" } : tu)),
    );
  };

  const say = async (text: string) => {
    const said = text.trim();
    if (!said) return;
    const close = closestExpr(said, exprs);
    const mine: Turn = close
      ? { who: "me", text: said, diff: wordDiff(said, close.target), fixed: close.target, via: "scene" }
      : { who: "me", text: said };
    const [g0, g1] = goalsReached(lang, scene, close ? close.target : said);
    const next: [boolean, boolean] = [reached[0] || g0, reached[1] || g1];
    setReached(next);
    if (next[0] !== reached[0] || next[1] !== reached[1]) setHint(0);
    const list = [...turnsRef.current, mine];
    setTurns(list);
    setWord(null);
    await partnerAnswers(list);
    void correct(list.length - 1, said);
  };

  // --- starting and leaving a scene -------------------------------------------

  const startTalk = async () => {
    unlockAudio();
    speaking.current?.stop();
    setPhase("talk");
    setTurns([]);
    setReached([false, false]);
    setHint(0);
    setHintsUsed(0);
    setShown(new Set());
    setFailed(false);
    setWord(null);
    if (canListen()) void prepareListening(tag).then(setMode);
    await partnerAnswers([]);
  };

  const leave = (to: Phase) => {
    listening.current?.cancel();
    listening.current = null;
    speaking.current?.stop();
    abort.current?.abort();
    setState("idle");
    setInterim("");
    if (to === "review") {
      const lines = turnsRef.current.filter((x) => x.who === "me");
      const h = addToHistory(history, {
        lang,
        level,
        scene,
        passed: scene !== "libre" && reached[0] && reached[1],
        fixes: lines.filter((x) => x.fixed).length,
        lines: lines.length,
        at: new Date().toISOString(),
      });
      setHistory(h);
      write(HISTORY_KEY, h);
    }
    if (to === "review" && scene !== "libre") {
      const passed = reached[0] && reached[1];
      const p = recordScene(progress, lang, level, passed);
      setProgress(p);
      write(PARTNER_KEY, p);
    }
    setPhase(to);
  };

  // --- push to talk -----------------------------------------------------------

  const startListening = () => {
    if (state === "thinking" || listening.current) return;
    speaking.current?.stop();
    setWord(null);
    setMicError(null);
    // The recogniser may stop by itself (Safari after a silence, or on an
    // error): what was heard is sent as if the button had been released.
    const l = listen(tag, mode === "none" ? "cloud" : mode, setInterim, (error) => {
      if (listening.current !== l) return;
      if (error) {
        listening.current = null;
        l?.cancel();
        setState("idle");
        setInterim("");
        setMicError(error);
        if (error === "not-allowed" || error === "service-not-allowed" || error === "audio-capture") setTyping(true);
        return;
      }
      void stopListening(true);
    });
    if (!l) {
      setTyping(true);
      return;
    }
    listening.current = l;
    setState("listening");
    setInterim("");
  };
  const stopListening = async (send: boolean) => {
    const l = listening.current;
    if (!l) return;
    listening.current = null;
    if (!send) {
      l.cancel();
      setState("idle");
      setInterim("");
      return;
    }
    const alts = await l.stop();
    setInterim("");
    setState("idle");
    if (alts[0]) await say(alts[0]);
  };
  // Hold to talk, or tap once to start and once to send. Times are the
  // events' own timestamps (the handlers stay pure for the compiler).
  const onPress = (at: number) => {
    if (listening.current) return;
    pressAt.current = at;
    startListening();
  };
  const onRelease = (at: number) => {
    if (!listening.current) return;
    if (at - pressAt.current < 350) return; // a tap: keep listening
    void stopListening(true);
  };

  // --- words, hints, cards ----------------------------------------------------

  const touchWord = async (turn: number, w: string, line: string) => {
    setWord({ turn, word: w, meaning: null });
    const to = locale;
    const tl = await browserTranslator(lang, to);
    let meaning: string | null = null;
    if (tl) {
      try {
        meaning = await tl.translate(w);
      } catch {
        meaning = null;
      }
    }
    if (!meaning) {
      const r = route === "nano" ? "nano" : "local";
      try {
        const out = await generateOnDevice({
          route: r,
          system: "Tu es un dictionnaire. Réponds par la traduction seule, en 5 mots au plus.",
          prompt: `Traduis « ${w} » (dans la phrase « ${line} ») en ${tr("parler.uiLangName")}.`,
          lang,
          maxTokens: 20,
        });
        meaning = out ? out.split("\n")[0].replace(/^["«\s]+|["»\s.]+$/g, "") : null;
      } catch {
        meaning = null;
      }
    }
    setWord((cur) => (cur && cur.turn === turn && cur.word === w ? { ...cur, meaning: meaning || "—" } : cur));
  };

  const note = notes[lang];
  const makeCard = (front: string, back: string, romanised?: string) => {
    if (!note) return;
    const id = cardId(lang, front);
    try {
      const deck = loadNoteDeck(localStorage, note.slug);
      const q = `<p lang="${lang}"><b>${escapeHtml(front)}</b>${romanised ? `<br><i>${escapeHtml(romanised)}</i>` : ""}</p>`;
      const a = `<p>${escapeHtml(back)}</p>`;
      saveNoteDeck(localStorage, note.slug, addQuestion(deck, id, { q, a, url: note.href, title: note.title }, null));
      window.dispatchEvent(new CustomEvent("gk:activity", { detail: { kind: "card" } }));
      setCards((s) => new Set(s).add(id));
    } catch {
      /* storage blocked */
    }
  };

  const nextHint = () => {
    if (hint === 0) setHintsUsed((n) => n + 1);
    setHint((h) => (h >= 3 ? 1 : ((h + 1) as 1 | 2 | 3)));
  };

  // --- warm-up ----------------------------------------------------------------

  const repeat = async (i: number, e: SceneExpr) => {
    unlockAudio();
    if (listening.current) return;
    const m = await prepareListening(tag);
    const l = listen(tag, m === "none" ? "cloud" : m, undefined, (error) => {
      if (listening.current !== l || !error) return;
      listening.current = null;
      setWarm((w) => ({ ...w, [i]: "close" }));
      setMicError(error);
    });
    if (!l) return;
    listening.current = l;
    setWarm((w) => ({ ...w, [i]: "listening" }));
    // A short line: listen for its length plus a margin, then judge.
    const ms = 1800 + e.t.length * 90;
    setTimeout(async () => {
      if (listening.current !== l) return;
      listening.current = null;
      const alts = await l.stop();
      // Heard as said, or nearly (one word in five off): understood.
      const want = tokens(normaliseSpoken(e.t.split("…")[0]));
      const ok = alts.some((a) => {
        const heard = tokens(normaliseSpoken(a));
        return similarity(e.t.includes("…") ? heard.slice(0, want.length) : heard, want) >= 0.8;
      });
      setWarm((w) => ({ ...w, [i]: ok ? "ok" : "close" }));
    }, ms);
  };

  // --- review data ------------------------------------------------------------

  const fixes = useMemo(() => turns.filter((tu) => tu.who === "me" && tu.fixed), [turns]);
  const lp = levelProgress(progress, lang, level);
  const hintNow = hintFor(lang, scene, reached);
  const passed = scene !== "libre" && reached[0] && reached[1];
  const myLevel = progress[lang]?.level ?? null;
  const unavailable = route === "none";

  // --- pieces -----------------------------------------------------------------

  const diffView = (parts: DiffPart[]) =>
    parts
      .map((p, i) =>
        p.op === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.op === "del" ? (
          <s key={i} className="pt-del">
            {p.text}
          </s>
        ) : (
          <ins key={i} className="pt-ins">
            {p.text}
          </ins>
        ),
      )
      .reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, " ", el] : [el]), []);

  const langName = tr(`parler.lang_${lang}`);
  const voiceNotice = (
    <>
      {voicePct !== null && (
        <p className="pt-device" role="status">
          {tr("parler.voiceLoading", { p: voicePct })}
        </p>
      )}
      {noVoice && !natural && (
        <p className="pt-notice" role="note">
          {tr("parler.noVoice", { lang: locale === "fr" || locale === "es" ? langName.toLocaleLowerCase(locale) : langName })}
          {canNatural && (
            <button
              type="button"
              className="pt-link"
              onClick={() => {
                setNaturalVoice(true);
                setNatural(true);
                unlockAudio();
              }}
            >
              {tr("parler.turnOnVoice")}
            </button>
          )}
        </p>
      )}
      {micError && (
        <p className="pt-notice" role="alert">
          {tr("parler.micError", { e: micError })}
        </p>
      )}
    </>
  );

  const goalsBar = scene !== "libre" && (
    <div className="pt-goals" role="status">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...ic}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </svg>
      <span className="pt-goals-txt">
        <b>{tr(`parler.scene_${scene}`)}</b>
        {[0, 1].map((g) => (
          <span key={g} className={reached[g] ? "pt-goal is-done" : "pt-goal"}>
            {reached[g] ? "✓ " : ""}
            {tr(`parler.goal_${scene}_${g}`)}
          </span>
        ))}
      </span>
      <span className="pt-goals-n">{reached.filter(Boolean).length}/2</span>
    </div>
  );

  // --- setup ------------------------------------------------------------------

  if (phase === "setup")
    return (
      <div className="pt pt-setup">
        <p className="pt-intro">{tr("parler.intro")}</p>

        <h2 className="pt-h">{tr("parler.language")}</h2>
        <div className="pt-chips" role="radiogroup" aria-label={tr("parler.language")}>
          {PARTNER_LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={l === lang}
              className={l === lang ? "pt-chip is-on" : "pt-chip"}
              onClick={() => {
                const lv = progress[l]?.level;
                update({ lang: l, ...(lv ? { level: lv } : {}) });
              }}
            >
              {tr(`parler.lang_${l}`)}
            </button>
          ))}
        </div>
        {lang === "ar" && <p className="pt-variety">{tr("parler.variety_ar")}</p>}
        <p className="pt-soon">{tr("parler.soonList", { list: SOON_LANGS.join(", ") })}</p>

        <h2 className="pt-h">{tr("parler.partner")}</h2>
        <ul className="pt-partners" role="radiogroup" aria-label={tr("parler.partner")}>
          {LEVEL_IDS.map((lv) => (
            <li key={lv}>
              <button
                type="button"
                role="radio"
                aria-checked={lv === level}
                className={lv === level ? "pt-partner is-on" : "pt-partner"}
                onClick={() => {
                  update({ level: lv });
                  const p = setProgressLevel(progress, lang, lv);
                  setProgress(p);
                  write(PARTNER_KEY, p);
                }}
              >
                <span className="pt-avatar" aria-hidden="true">
                  {partnerName(lang, lv)[0]}
                </span>
                <span className="pt-partner-txt">
                  <span className="pt-partner-name">
                    <b>{partnerName(lang, lv)}</b> <span className="pt-lv">{tr(`parler.lv_${lv}`)}</span>
                  </span>
                  <small>{tr(`parler.lvd_${lv}`)}</small>
                </span>
                {myLevel === lv && <span className="pt-mine">{tr("parler.yourLevel")}</span>}
              </button>
            </li>
          ))}
        </ul>

        <h2 className="pt-h">{tr("parler.scene")}</h2>
        <div className="pt-scenes" role="radiogroup" aria-label={tr("parler.scene")}>
          {([...SCENE_IDS, "libre"] as SceneChoice[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === scene}
              className={s === scene ? "pt-scene is-on" : "pt-scene"}
              onClick={() => update({ scene: s })}
            >
              <b>{tr(`parler.scene_${s}`)}</b>
              <small>{tr(`parler.scened_${s}`)}</small>
            </button>
          ))}
        </div>
        {scene !== "libre" && (
          <p className="pt-goals-preview">
            <b>{tr("parler.goalsPreview")}</b> {tr(`parler.goal_${scene}_0`)} · {tr(`parler.goal_${scene}_1`)}
          </p>
        )}
        {scene !== "libre" && (
          <label className="pt-swap">
            <input type="checkbox" checked={swapped} onChange={(e) => update({ swapped: e.target.checked })} />
            {tr(`parler.swap_${scene}`)}
          </label>
        )}

        {canNatural && (
          <label className="pt-swap">
            <input
              type="checkbox"
              checked={natural}
              onChange={(e) => {
                setNaturalVoice(e.target.checked);
                setNatural(e.target.checked);
              }}
            />
            <span>
              {tr("parler.naturalVoice")}
              <small>{tr("parler.naturalVoiceHint")}</small>
            </span>
          </label>
        )}

        {corrector.supported && (
          <div className="pt-corrector">
            <label className="pt-swap">
              <input
                type="checkbox"
                checked={corrector.on}
                onChange={(e) => {
                  const on = e.target.checked;
                  setCorrectorEnabled(on);
                  setCorrector((c) => ({ ...c, on }));
                  if (on) {
                    const off = onLoadProgress((p) => setCorrector((c) => ({ ...c, dl: Math.floor((p.loaded / Math.max(1, p.total)) * 100) })));
                    void loadLocalModel(CORRECTOR).then(() => {
                      off();
                      setCorrector((c) => ({ ...c, dl: null }));
                    });
                  } else void deleteCorrector();
                }}
              />
              <span>
                {tr("parler.corrector", { n: CORRECTOR.gb.toLocaleString(locale) })}
                <small>{corrector.dl !== null ? tr("parler.downloading", { p: corrector.dl }) : tr("parler.correctorHint")}</small>
              </span>
            </label>
          </div>
        )}

        {history.length > 0 && (
          <>
            <h2 className="pt-h">{tr("parler.history")}</h2>
            <ul className="pt-history">
              {history.slice(0, 5).map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => update({ lang: r.lang, level: r.level, scene: r.scene })}
                    title={tr("parler.historyAgain")}
                  >
                    <span className={r.passed ? "pt-hist-mark is-good" : "pt-hist-mark"} aria-hidden="true">
                      {r.passed ? "✓" : r.scene === "libre" ? "·" : "…"}
                    </span>
                    <span className="pt-hist-txt">
                      <b>{tr(`parler.scene_${r.scene}`)}</b>
                      <small>
                        {tr(`parler.lang_${r.lang}`)} · {partnerName(r.lang, r.level)} ({tr(`parler.lv_${r.level}`)}) ·{" "}
                        {tr("parler.historyLines", { n: r.lines, f: r.fixes })}
                      </small>
                    </span>
                    <time dateTime={r.at}>{new Date(r.at).toLocaleDateString(locale, { day: "numeric", month: "short" })}</time>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="pt-device pt-device-setup">
            {unavailable
              ? tr("parler.noModel")
              : route === "download"
                ? tr("parler.needsDownload", { n: localModel().gb.toLocaleString(locale) })
                : mode === "cloud"
                  ? tr("parler.cloudListen")
                  : tr("parler.onDevice")}
        </p>
        <div className="pt-start pt-start-sticky">
          <button
            type="button"
            className="pt-go"
            disabled={unavailable || route === null}
            onClick={() => {
              unlockAudio();
              if (scene === "libre") void startTalk();
              else setPhase("warmup");
            }}
          >
            <MicIcon /> {tr("parler.start", { name: who })}
          </button>
          <p className="pt-summary" aria-hidden="true">
            {langName} · {tr(`parler.lv_${level}`)} · {tr(`parler.scene_${scene}`)}
          </p>
        </div>
      </div>
    );

  // --- warm-up ----------------------------------------------------------------

  if (phase === "warmup")
    return (
      <div className="pt pt-warmup">
        <button type="button" className="pt-back" onClick={() => setPhase("setup")}>
          ‹ {tr("parler.back")}
        </button>
        <h2 className="pt-title">{tr("parler.warmTitle")}</h2>
        <p className="pt-intro">{tr("parler.warmIntro", { name: who })}</p>
        {voiceNotice}
        <ul className="pt-exprs">
          {exprs.map((e, i) => (
            <li key={i} className={warm[i] === "ok" ? "is-ok" : undefined}>
              <span className="pt-expr">
                <b lang={tag}>{e.t}</b>
                {e.r && <i>{e.r}</i>}
                <small>{gloss(e)}</small>
              </span>
              <button type="button" className="pt-round" aria-label={tr("parler.listen")} onClick={() => hearNow(e.t, LEVEL_RATE[level])}>
                <SpeakerIcon />
              </button>
              {canListen() && (
                <button
                  type="button"
                  className={warm[i] === "listening" ? "pt-round is-live" : "pt-round pt-round-mic"}
                  aria-label={tr("parler.repeat", { name: who })}
                  onClick={() => void repeat(i, e)}
                >
                  <MicIcon />
                </button>
              )}
              {warm[i] === "ok" && <span className="pt-ok">{tr("parler.understood")}</span>}
              {warm[i] === "close" && <span className="pt-close">{tr("parler.tryAgain")}</span>}
            </li>
          ))}
        </ul>
        <div className="pt-start pt-start-row">
          <button type="button" className="pt-ghost" onClick={() => void startTalk()}>
            {tr("parler.skip")}
          </button>
          <button type="button" className="pt-go" onClick={() => void startTalk()}>
            {tr(`parler.enter_${scene}`)}
          </button>
        </div>
      </div>
    );

  // --- review -----------------------------------------------------------------

  if (phase === "review") {
    const nextScene = SCENE_IDS[(SCENE_IDS.indexOf(scene as (typeof SCENE_IDS)[number]) + 1) % SCENE_IDS.length];
    return (
      <div className="pt pt-review">
        <h2 className="pt-title">
          {scene === "libre" ? tr("parler.reviewFree", { name: who }) : passed ? tr(`parler.won_${scene}`) : tr("parler.notYet")}
        </h2>
        <p className="pt-intro">
          {tr("parler.reviewMeta", { name: who, scene: tr(`parler.scene_${scene}`), n: turns.filter((x) => x.who === "me").length })}
        </p>
        {scene !== "libre" && (
          <div className="pt-stats">
            <div className={passed ? "pt-stat is-good" : "pt-stat"}>
              <b>{reached.filter(Boolean).length}/2</b>
              <small>{tr("parler.goals")}</small>
            </div>
            <div className="pt-stat">
              <b>{hintsUsed}</b>
              <small>{tr("parler.hints")}</small>
            </div>
            <div className="pt-stat">
              <b>{fixes.length}</b>
              <small>{tr("parler.toReview")}</small>
            </div>
          </div>
        )}
        {scene !== "libre" && (
          <div className="pt-level">
            <div className="pt-level-row">
              <span>
                <b>{tr(`parler.lv_${level}`)}</b>
                {lp.next ? ` → ${tr(`parler.lv_${lp.next}`)}` : ""}
              </span>
              <span>{tr("parler.levelCount", { done: lp.done, need: lp.need })}</span>
            </div>
            <div className="pt-bar" role="progressbar" aria-valuemin={0} aria-valuemax={lp.need} aria-valuenow={lp.done}>
              <span style={{ width: `${(lp.done / lp.need) * 100}%` }} />
            </div>
            {lp.next && (
              <p className="pt-level-note">
                {lp.unlocked
                  ? tr("parler.levelUp", { name: partnerName(lang, lp.next) })
                  : tr("parler.levelLeft", { n: lp.need - lp.done, name: partnerName(lang, lp.next) })}
                {lp.unlocked && (
                  <button
                    type="button"
                    className="pt-link"
                    onClick={() => {
                      update({ level: lp.next! });
                      const p = setProgressLevel(progress, lang, lp.next!);
                      setProgress(p);
                      write(PARTNER_KEY, p);
                      setPhase("setup");
                    }}
                  >
                    {tr("parler.goNext", { name: partnerName(lang, lp.next) })}
                  </button>
                )}
              </p>
            )}
          </div>
        )}
        <h3 className="pt-h">{tr("parler.moments")}</h3>
        {fixes.length ? (
          <ul className="pt-fixes">
            {fixes.map((f, i) => {
              const id = cardId(lang, f.fixed!);
              return (
                <li key={i}>
                  <s className="pt-said">{f.text}</s>
                  <b lang={tag} className="pt-fixed">
                    {f.fixed}
                  </b>
                  {f.why && <small>{f.why}</small>}
                  {f.via === "scene" && <small>{tr("parler.fromScene")}</small>}
                  <span className="pt-actions">
                    <button type="button" className="pt-pill" onClick={() => hearNow(f.fixed!, LEVEL_RATE[level])}>
                      {tr("parler.listen")}
                    </button>
                    {note && (
                      <button
                        type="button"
                        className={cards.has(id) ? "pt-pill is-on" : "pt-pill pt-pill-strong"}
                        disabled={cards.has(id)}
                        onClick={() => makeCard(f.fixed!, f.text)}
                      >
                        {cards.has(id) ? tr("parler.carded") : tr("parler.makeCard")}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pt-clean">{tr("parler.clean")}</p>
        )}
        {note && (
          <a className="pt-note" href={note.href}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...ic}>
              <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
              <path d="M8 7h6" />
            </svg>
            <span>{tr("parler.readNote", { title: note.title })}</span>
          </a>
        )}
        <div className="pt-start pt-start-row">
          <button type="button" className="pt-ghost" onClick={() => void startTalk()}>
            {tr("parler.replay")}
          </button>
          <button
            type="button"
            className="pt-go"
            onClick={() => {
              if (scene !== "libre") update({ scene: nextScene });
              setPhase("setup");
            }}
          >
            {scene === "libre" ? tr("parler.newScene") : tr("parler.nextScene")}
          </button>
        </div>
      </div>
    );
  }

  // --- the conversation -------------------------------------------------------

  const busy = state === "thinking";
  return (
    <div className="pt pt-talk">
      <div className="pt-top">
        <button type="button" className="pt-round pt-quit" aria-label={tr("parler.end")} onClick={() => leave("review")}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...ic}>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <span className="pt-avatar is-on" aria-hidden="true">
          {who[0]}
        </span>
        <span className="pt-who">
          <b>{who}</b>
          <small>
            {tr(`parler.lang_${lang}`)} · {tr(`parler.lv_${level}`)}
          </small>
        </span>
        <button
          type="button"
          className="pt-round"
          aria-label={tr(`parler.subs_${subs}`)}
          title={tr(`parler.subs_${subs}`)}
          data-subs={subs}
          onClick={() => update({ subs: subs === "show" ? "blur" : subs === "blur" ? "hide" : "show" })}
        >
          <SubsIcon />
        </button>
      </div>
      {goalsBar}

      <ol className="pt-log" ref={log} aria-live="polite">
        {turns.map((tu, i) =>
          tu.who === "partner" ? (
            <li key={i} className="pt-turn is-partner">
              <p className="pt-bubble" lang={tag}>
                {tu.streaming && !tu.text ? (
                  <span className="pt-thinking">
                    <span className="pt-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    {tr("parler.thinking", { name: who })}
                  </span>
                ) : (
                  tu.text.split(/(\s+)/).map((w, k) =>
                    /^\s+$/.test(w) || !w ? (
                      w
                    ) : tu.streaming ? (
                      <span key={k}>{w}</span>
                    ) : (
                      <button
                        key={k}
                        type="button"
                        className={word && word.turn === i && word.word === w ? "pt-word is-on" : "pt-word"}
                        onClick={() => void touchWord(i, w.replace(/[¿¡?!.,;:«»"“”()]/g, ""), tu.text)}
                      >
                        {w}
                      </button>
                    ),
                  )
                )}
              </p>
              {word && word.turn === i && (
                <div className="pt-pop" role="dialog" aria-label={word.word}>
                  <span>
                    <b lang={tag}>{word.word}</b>
                    <small>{word.meaning ?? tr("parler.lookingUp")}</small>
                  </span>
                  {note && word.meaning && word.meaning !== "—" && (
                    <button
                      type="button"
                      className="pt-pill pt-pill-strong"
                      disabled={cards.has(cardId(lang, word.word))}
                      onClick={() => makeCard(word.word, word.meaning!)}
                    >
                      {cards.has(cardId(lang, word.word)) ? tr("parler.carded") : tr("parler.plusCard")}
                    </button>
                  )}
                </div>
              )}
              {!tu.streaming && (
                <div className="pt-under">
                  <button type="button" className="pt-mini" aria-label={tr("parler.replayLine")} onClick={() => hearNow(tu.text, LEVEL_RATE[level])}>
                    <SpeakerIcon />
                  </button>
                  <button type="button" className="pt-mini pt-slow" onClick={() => hearNow(tu.text, 0.7)}>
                    {tr("parler.slower")}
                  </button>
                  {tu.translation && subs !== "hide" && (
                    <button
                      type="button"
                      className={subs === "blur" && !shown.has(i) ? "pt-tr is-blur" : "pt-tr"}
                      aria-label={subs === "blur" && !shown.has(i) ? tr("parler.showTr") : undefined}
                      onClick={() => setShown((s) => new Set(s).add(i))}
                    >
                      {tu.translation}
                    </button>
                  )}
                </div>
              )}
            </li>
          ) : (
            <li key={i} className="pt-turn is-me">
              <p className="pt-bubble" lang={tag}>
                {tu.diff ? diffView(tu.diff) : tu.text}
              </p>
              {tu.diff && (
                <p className="pt-why">
                  {tu.via === "corrector" ? (tu.why ? `${tr("parler.why")} ${tu.why}` : tr("parler.betterSaid")) : tr("parler.closeTo")}
                </p>
              )}
            </li>
          ),
        )}
        {state === "listening" && (
          <li className="pt-turn is-me">
            <p className="pt-bubble is-live" lang={tag}>
              {interim || "…"}
            </p>
            <small className="pt-live">{tr("parler.listening")}</small>
          </li>
        )}
      </ol>

      {failed && (
        <p className="pt-error" role="alert">
          {tr("parler.failed")}
          <button type="button" className="pt-link" onClick={() => (setFailed(false), void partnerAnswers(turnsRef.current))}>
            {tr("parler.retry")}
          </button>
          {failWhy && <small className="pt-error-why">{tr("parler.failedWhy", { why: failWhy })}</small>}
        </p>
      )}
      {dl && <p className="pt-device">{tr("parler.downloading", { p: dl.pct })}</p>}
      {voiceNotice}

      {passed && state === "idle" && (
        <div className="pt-passed">
          <b>{tr(`parler.won_${scene}`)}</b>
          <button type="button" className="pt-go" onClick={() => leave("review")}>
            {tr("parler.seeReview")}
          </button>
        </div>
      )}

      {hint > 0 && hintNow && (
        <div className="pt-hint">
          <div className="pt-hint-head">
            <b>{tr("parler.hintTitle")}</b>
            <span>{tr("parler.hintStep", { n: hint })}</span>
            <button type="button" className="pt-hint-x" aria-label={tr("parler.hideHint")} onClick={() => setHint(0)}>
              ×
            </button>
          </div>
          <div className="pt-hint-steps" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= hint ? "is-on" : undefined} />
            ))}
          </div>
          <p>
            <span className="pt-muted">{tr("parler.hintIdea")}</span> {tr(hintNow.ideaKey)}
          </p>
          {hint >= 2 && (
            <p>
              <span className="pt-muted">{tr("parler.hintWords")}</span>{" "}
              {hintNow.words.map((w, k) => (
                <b key={k} lang={tag} className="pt-hw">
                  {w}
                </b>
              ))}
            </p>
          )}
          {hint >= 3 && (
            <p>
              <span className="pt-muted">{tr("parler.hintSentence")}</span> <b lang={tag}>{hintNow.expr.t}</b>
              {hintNow.expr.r && <i> {hintNow.expr.r}</i>}
            </p>
          )}
          {hint < 3 && (
            <button type="button" className="pt-pill" onClick={nextHint}>
              {hint === 1 ? tr("parler.hintMoreWords") : tr("parler.hintMoreSentence")}
            </button>
          )}
        </div>
      )}

      <div className={typing ? "pt-composer is-typing" : "pt-composer"}>
        {typing ? (
          <form
            className="pt-type"
            onSubmit={(e) => {
              e.preventDefault();
              const v = draft;
              setDraft("");
              void say(v);
            }}
          >
            <label className="sr-only" htmlFor="pt-input">
              {tr("parler.typeLabel")}
            </label>
            <input id="pt-input" lang={tag} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} autoComplete="off" />
            <button type="submit" className="pt-go" disabled={busy || !draft.trim()}>
              {tr("parler.send")}
            </button>
          </form>
        ) : null}
        <div className="pt-controls">
          <button
            type="button"
            className={typing ? "pt-round is-on" : "pt-round"}
            aria-label={tr("parler.typeInstead")}
            aria-pressed={typing}
            onClick={() => setTyping((v) => !v)}
          >
            <KeyboardIcon />
          </button>
          {canListen() ? (
            <button
              type="button"
              className={state === "listening" ? "pt-mic is-live" : "pt-mic"}
              aria-label={state === "listening" ? tr("parler.releaseToSend") : tr("parler.holdToTalk")}
              disabled={busy || turns.length === 0}
              onPointerDown={(e) => onPress(e.timeStamp)}
              onPointerUp={(e) => onRelease(e.timeStamp)}
              onPointerCancel={() => void stopListening(false)}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && !e.repeat && !listening.current) {
                  e.preventDefault();
                  onPress(e.timeStamp);
                } else if ((e.key === " " || e.key === "Enter") && listening.current) {
                  e.preventDefault();
                  void stopListening(true);
                } else if (e.key === "Escape") void stopListening(false);
              }}
            >
              <MicIcon />
            </button>
          ) : (
            <span className="pt-nomic">{tr("parler.noMic")}</span>
          )}
          <button
            type="button"
            className={hint ? "pt-round is-on" : "pt-round"}
            aria-label={tr("parler.hint")}
            disabled={!hintNow}
            onClick={() => (hint ? setHint(0) : nextHint())}
          >
            <BulbIcon />
          </button>
        </div>
        <p className="pt-mic-label">
          {state === "listening"
            ? tr("parler.releaseToSend")
            : state === "thinking"
              ? tr("parler.thinking", { name: who })
              : state === "speaking"
                ? tr("parler.speaking", { name: who })
                : canListen()
                  ? tr("parler.holdToTalk")
                  : ""}
          {state === "listening" && (
            <button type="button" className="pt-link" onClick={() => void stopListening(false)}>
              {tr("parler.cancel")}
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
