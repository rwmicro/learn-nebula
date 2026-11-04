"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chess, type Square } from "chess.js";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { recordActivity } from "@/lib/personal";
import { addQuestion, loadNoteDeck, saveNoteDeck } from "@/lib/note-quiz";
import {
  CHESS_NOTES,
  ELO_KEY,
  GAME_KEY,
  LEVELS,
  PREFS_KEY,
  boardSvg,
  captured,
  evalLabel,
  evalShare,
  hintOf,
  hintTopic,
  levelFor,
  openingOf,
  parseElo,
  parsePrefs,
  parseSavedGame,
  sanFor,
  topicOf,
  updateElo,
  verdict,
  whiteScore,
  type ChessPrefs,
  type ChessTopic,
  type EloRecord,
  type HintKind,
  type Level,
  type SavedGame,
  type Verdict,
} from "@/lib/chess-play";
import { ChessBoard, PieceIcon } from "./ChessBoard";
import { Engine, FULL_STRENGTH } from "./chess-engine";

// /echecs/: a game against Stockfish (components/play/chess-engine.ts, in the
// browser). Three moments:
// - the setup: the reader's Elo and its line, the five levels as cards (the
//   one nearest the Elo marked), the colour, a game left in progress;
// - the table: the board between the two players (pieces taken, whose move),
//   the evaluation bar, the moves (browsable), the opening's name, a coach
//   whose hints go from an idea to the square to the move, take-back, flip,
//   PGN. A hint, a take-back or a replay makes the game unrated;
// - the review: the game as a curve, the reader's key moments with the better
//   move on the board, the vault note about what was missed, "replay from
//   here" and "make it a card" (a question in that note's deck).

const START = new Chess().fen();
const BOT_ICON: Record<string, string> = {
  debutant: "p",
  facile: "n",
  moyen: "b",
  fort: "r",
  expert: "q",
};

interface Moment {
  ply: number;
  san: string;
  from: string;
  to: string;
  fen: string;
  best: string | null;
  better: string | null;
  verdict: Verdict;
  loss: number;
  topic: ChessTopic;
}

interface ReviewData {
  /** White's score after each ply (index 0: the start). */
  curve: number[];
  moments: Moment[];
  counts: Record<"inaccuracy" | "mistake" | "blunder", number>;
}

interface Hint {
  step: 1 | 2 | 3;
  kind: HintKind;
  piece: string;
  from: string;
  to: string;
  mateIn: number;
  topic: ChessTopic;
}

type Notes = Partial<Record<ChessTopic, { href: string; title: string }>>;

function read<T>(key: string, parse: (raw: string | null) => T): T {
  try {
    return parse(localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: nothing kept */
  }
}

/** Position after the first `n` moves of a game. */
function replay(start: string, sans: readonly string[], n = sans.length): Chess {
  const c = new Chess(start);
  for (const m of sans.slice(0, n)) c.move(m);
  return c;
}

/** Plies played before `start` (a replay starts mid-game): move numbers stay
 *  those of the real game. */
function plyOffset(start: string): number {
  const parts = start.split(" ");
  return (Number(parts[5]) - 1) * 2 + (parts[1] === "b" ? 1 : 0);
}

function pickColor(pref: ChessPrefs["color"]): "w" | "b" {
  if (pref !== "random") return pref;
  return Math.random() < 0.5 ? "w" : "b";
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 40);
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * 150).toFixed(1)},${(36 - ((v - lo) / span) * 32).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="chess-spark" viewBox="0 0 150 40" aria-hidden="true" preserveAspectRatio="none">
      <polyline points={pts} />
    </svg>
  );
}

export function ChessPlay({ notes }: { notes: Notes }) {
  const locale = useLocale();
  const tr = useCallback((k: string, v?: Record<string, string | number>) => t(k, v, locale), [locale]);

  const game = useRef<Chess>(new Chess());
  const engine = useRef<Engine | null>(null);
  const over = useRef(false);
  // Bumped by each new game: an engine answer for an older one is dropped.
  const gen = useRef(0);
  // What the engine callbacks need of the game being played, set by begin()
  // before they run (the state copies land a render later).
  const levelRef = useRef<Level>(LEVELS[1]);
  const colorRef = useRef<"w" | "b">("w");
  const unratedRef = useRef(false);

  const [phase, setPhase] = useState<"setup" | "play" | "over">("setup");
  const [rec, setRec] = useState<EloRecord | null>(null);
  const [prefs, setPrefs] = useState<ChessPrefs>({ eval: true, color: "w" });
  const [level, setLevel] = useState<Level>(LEVELS[1]);
  const [color, setColor] = useState<"w" | "b">("w");
  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [start, setStart] = useState(START);
  const [sans, setSans] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [sel, setSel] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [ready, setReady] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [evals, setEvals] = useState<Record<number, number>>({});
  const [unrated, setUnrated] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [result, setResult] = useState<null | {
    score: 0 | 0.5 | 1;
    key: string;
    delta: number | null;
    elo: number;
  }>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [moment, setMoment] = useState<number | null>(null);
  const [cards, setCards] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const r = read(ELO_KEY, parseElo);
    setRec(r);
    setLevel(levelFor(r.elo));
    setPrefs(read(PREFS_KEY, parsePrefs));
    setSaved(read(GAME_KEY, parseSavedGame));
    return () => engine.current?.stop();
  }, []);

  const savePrefs = (p: Partial<ChessPrefs>) => {
    setPrefs((old) => {
      const next = { ...old, ...p };
      write(PREFS_KEY, next);
      return next;
    });
  };

  const boot = useCallback(async () => {
    if (engine.current) return engine.current;
    setReady("loading");
    try {
      const e = new Engine();
      await e.init();
      engine.current = e;
      setReady("ok");
      return e;
    } catch {
      setReady("error");
      return null;
    }
  }, []);

  // --- the game ------------------------------------------------------------

  const finish = useCallback((score: 0 | 0.5 | 1, key: string) => {
    if (over.current) return;
    over.current = true;
    const before = read(ELO_KEY, parseElo);
    let delta: number | null = null;
    let after = before;
    if (!unratedRef.current) {
      after = updateElo(before, levelRef.current.elo, score);
      delta = after.elo - before.elo;
      write(ELO_KEY, after);
    }
    try {
      recordActivity("c");
    } catch {
      /* storage blocked */
    }
    write(GAME_KEY, null);
    setSaved(null);
    setRec(after);
    setResult({ score, key, delta, elo: after.elo });
    setThinking(false);
    setSel(null);
    setHint(null);
    setPhase("over");
  }, []);

  const checkEnd = useCallback(() => {
    const g = game.current;
    if (!g.isGameOver()) return false;
    const mine = g.turn() === colorRef.current;
    if (g.isCheckmate()) finish(mine ? 0 : 1, mine ? "chess.lostMate" : "chess.wonMate");
    else finish(0.5, g.isStalemate() ? "chess.stalemate" : "chess.draw");
    return true;
  }, [finish]);

  /** The live position's score for the bar, once per move of the reader. */
  const evaluate = useCallback(async () => {
    if (!prefs.eval) return;
    const e = await boot();
    const g = game.current;
    if (!e) return;
    const my = gen.current;
    const ply = g.history().length;
    const fen = g.fen();
    const { score } = await e.go(fen, { depth: 10 });
    if (my !== gen.current) return;
    setEvals((old) => ({
      ...old,
      [ply]: whiteScore(score, fen.split(" ")[1] as "w" | "b"),
    }));
  }, [boot, prefs.eval]);

  const engineMove = useCallback(async () => {
    const e = await boot();
    if (!e) return;
    const g = game.current;
    const my = gen.current;
    setThinking(true);
    const lv = levelRef.current;
    const { best } = await e.go(g.fen(), lv, {
      ...FULL_STRENGTH,
      ...lv.options,
    });
    if (my !== gen.current || over.current) return;
    setThinking(false);
    if (!best) return;
    try {
      g.move({
        from: best.slice(0, 2),
        to: best.slice(2, 4),
        promotion: best[4] ?? "q",
      });
    } catch {
      return;
    }
    setSans(g.history());
    if (!checkEnd()) void evaluate();
  }, [boot, checkEnd, evaluate]);

  // Keep the game in progress, to pick it up after leaving the page.
  useEffect(() => {
    if (phase !== "play") return;
    write(GAME_KEY, {
      level: level.id,
      color,
      start,
      sans,
      unrated,
    } satisfies SavedGame);
  }, [phase, level, color, start, sans, unrated]);

  const begin = (opts: { level: Level; color: "w" | "b"; start: string; sans: string[]; unrated: boolean }) => {
    gen.current++;
    const g = new Chess(opts.start);
    for (const m of opts.sans) g.move(m);
    game.current = g;
    over.current = false;
    levelRef.current = opts.level;
    colorRef.current = opts.color;
    unratedRef.current = opts.unrated;
    setLevel(opts.level);
    setColor(opts.color);
    setStart(opts.start);
    setSans(g.history());
    setCursor(null);
    setFlipped(false);
    setSel(null);
    setPromo(null);
    setThinking(false);
    setEvals({});
    setUnrated(opts.unrated);
    setHint(null);
    setResult(null);
    setReview(null);
    setMoment(null);
    setCards(new Set());
    setPhase("play");
    // On a phone the site's header would push the reader's own row under
    // the tab bar: start with the board's top row at the top instead.
    requestAnimationFrame(() => {
      const main = document.querySelector(".chess-main");
      if (main && window.innerWidth < 640) main.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
    });
    if (g.turn() !== opts.color) void engineMove();
    else void evaluate();
  };

  const newGame = () => {
    begin({
      level,
      color: pickColor(prefs.color),
      start: START,
      sans: [],
      unrated: false,
    });
  };

  const resume = () => {
    if (!saved) return;
    begin({
      level: LEVELS.find((l) => l.id === saved.level) ?? LEVELS[0],
      color: saved.color,
      start: saved.start,
      sans: saved.sans,
      unrated: saved.unrated,
    });
  };

  // --- what is shown ---------------------------------------------------------

  const live = cursor === null;
  const shownPly = cursor ?? sans.length;
  const view = useMemo(() => replay(start, sans, shownPly), [start, sans, shownPly]);
  const lastMove = useMemo(() => {
    if (shownPly === 0) return null;
    const m = replay(start, sans, shownPly - 1).move(sans[shownPly - 1]);
    return { from: m.from, to: m.to };
  }, [start, sans, shownPly]);
  const targets = useMemo(
    () => new Set<string>(sel && live ? view.moves({ square: sel, verbose: true }).map((m) => m.to) : []),
    [sel, view, live],
  );
  const myTurn = phase === "play" && live && !thinking && view.turn() === color;
  const offset = plyOffset(start);
  const opening = useMemo(
    () => (start === START ? openingOf(sans.slice(0, Math.max(shownPly, 1)), locale) : null),
    [start, sans, shownPly, locale],
  );

  /** A move of the player's from `from` to `to`, if legal; a pawn reaching
   *  the last rank opens the promotion picker first. */
  const moveTo = (from: Square, to: Square): boolean => {
    const g = game.current;
    if (!g.moves({ square: from, verbose: true }).some((m) => m.to === to)) return false;
    const p = g.get(from);
    if (p?.type === "p" && (to[1] === "8" || to[1] === "1")) {
      setSel(from);
      setPromo({ from, to });
      return true;
    }
    play(from, to);
    return true;
  };

  const mine = (sq: Square): boolean => {
    const p = view.get(sq);
    return !!p && p.color === color;
  };

  const tap = (sq: Square) => {
    if (!myTurn) return;
    if (sel && targets.has(sq) && moveTo(sel, sq)) return;
    setSel(mine(sq) && sel !== sq ? sq : null);
  };

  const play = (from: Square, to: Square, promotion: "q" | "r" | "b" | "n" = "q") => {
    const g = game.current;
    try {
      g.move({ from, to, promotion });
    } catch {
      return;
    }
    setSel(null);
    setPromo(null);
    setHint(null);
    setSans(g.history());
    if (!checkEnd()) void engineMove();
  };

  const takeBack = () => {
    const g = game.current;
    if (!myTurn) return;
    const mine = g.history().length - (g.turn() === color ? 2 : 1);
    if (mine < 0 || (g.history().length < 2 && color === "w")) return;
    g.undo();
    if (g.turn() !== color) g.undo();
    setSans(g.history());
    unratedRef.current = true;
    setUnrated(true);
    setHint(null);
    setSel(null);
  };

  const askHint = async () => {
    if (!myTurn || hintBusy) return;
    if (hint && hint.step < 3) {
      setHint({ ...hint, step: (hint.step + 1) as 2 | 3 });
      return;
    }
    if (hint) return;
    setHintBusy(true);
    const e = await boot();
    const g = game.current;
    const my = gen.current;
    if (!e) return setHintBusy(false);
    const { best, score } = await e.go(g.fen(), { depth: 12 });
    setHintBusy(false);
    if (my !== gen.current || !best) return;
    const h = hintOf(g.fen(), best, score);
    if (!h) return;
    unratedRef.current = true;
    setUnrated(true);
    setHint({
      step: 1,
      ...h,
      topic: hintTopic(h.kind, Math.floor((g.history().length + offset) / 2) + 1),
    });
  };

  const copyPgn = async () => {
    const c = new Chess(start);
    c.setHeader("Event", "The Gardener");
    c.setHeader("Date", new Date().toISOString().slice(0, 10).replace(/-/g, "."));
    const bot = `Stockfish (${tr(`chess.lv_${level.id}`)})`;
    c.setHeader("White", color === "w" ? tr("chess.you") : bot);
    c.setHeader("Black", color === "b" ? tr("chess.you") : bot);
    if (result)
      c.setHeader(
        "Result",
        result.score === 0.5 ? "1/2-1/2" : (result.score === 1) === (color === "w") ? "1-0" : "0-1",
      );
    for (const m of sans) c.move(m);
    try {
      await navigator.clipboard.writeText(c.pgn());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard refused */
    }
  };

  // The moves are one sideways line on a phone: keep the shown move in it.
  const movesRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = movesRef.current;
    if (!ol || ol.scrollWidth <= ol.clientWidth) return;
    const cur = ol.querySelector<HTMLElement>(".is-cur");
    if (!cur) {
      ol.scrollLeft = ol.scrollWidth;
      return;
    }
    const left = cur.offsetLeft;
    if (left < ol.scrollLeft || left + cur.offsetWidth > ol.scrollLeft + ol.clientWidth)
      ol.scrollLeft = Math.max(0, left - ol.clientWidth / 2);
  }, [sans, cursor]);

  // ← → browse the moves.
  useEffect(() => {
    if (phase === "setup") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "ArrowLeft") setCursor((c) => Math.max(0, (c ?? sans.length) - 1));
      else if (e.key === "ArrowRight") setCursor((c) => (c === null || c + 1 >= sans.length ? null : c + 1));
      else return;
      setMoment(null);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, sans.length]);

  // --- review --------------------------------------------------------------

  const runReview = async () => {
    const e = await boot();
    if (!e || !sans.length) return;
    const c = new Chess(start);
    const fens = [c.fen()];
    const moves = sans.map((m) => {
      const mv = c.move(m);
      fens.push(c.fen());
      return mv;
    });
    const evalsAt: { best: string | null; score: number }[] = [];
    for (let i = 0; i < fens.length; i++) {
      setReviewing(Math.round((100 * i) / fens.length));
      const pos = new Chess(fens[i]);
      evalsAt.push(
        pos.isGameOver() ? { best: null, score: pos.isCheckmate() ? -10000 : 0 } : await e.go(fens[i], { depth: 10 }),
      );
    }
    setReviewing(null);
    const curve = evalsAt.map((v, i) => whiteScore(v.score, fens[i].split(" ")[1] as "w" | "b"));
    const counts = { inaccuracy: 0, mistake: 0, blunder: 0 };
    const out: Moment[] = [];
    let opponentBlundered = false;
    moves.forEach((m, i) => {
      const mine = m.color === color;
      const before = evalsAt[i].score;
      const after = -evalsAt[i + 1].score;
      const v = verdict(before, after);
      if (!mine) {
        opponentBlundered = v.verdict === "blunder";
        return;
      }
      if (v.verdict !== "good") counts[v.verdict]++;
      if (v.verdict === "mistake" || v.verdict === "blunder") {
        const best = evalsAt[i].best;
        let better: string | null = null;
        if (best) {
          try {
            better = new Chess(fens[i]).move({
              from: best.slice(0, 2),
              to: best.slice(2, 4),
              promotion: best[4] ?? "q",
            }).san;
          } catch {
            better = null;
          }
        }
        out.push({
          ply: i,
          san: m.san,
          from: m.from,
          to: m.to,
          fen: fens[i],
          best,
          better,
          verdict: v.verdict,
          loss: v.loss,
          topic: topicOf(fens[i], Math.floor((i + offset) / 2) + 1, before, after, opponentBlundered),
        });
      }
      opponentBlundered = false;
    });
    const moments = out
      .sort((a, b) => b.loss - a.loss)
      .slice(0, 5)
      .sort((a, b) => a.ply - b.ply);
    setReview({ curve, moments, counts });
    if (moments.length) showMoment(0, moments);
  };

  const showMoment = (i: number, list = review?.moments ?? []) => {
    const m = list[i];
    if (!m) return;
    setMoment(i);
    setCursor(m.ply);
  };

  const replayFrom = (m: Moment) => {
    begin({ level, color, start: m.fen, sans: [], unrated: true });
  };

  const makeCard = (i: number, m: Moment) => {
    const note = notes[m.topic];
    if (!note || !m.better || !m.best) return;
    const slug = CHESS_NOTES[m.topic];
    const flip = color === "b";
    const side = tr(m.fen.split(" ")[1] === "w" ? "chess.whiteToPlay" : "chess.blackToPlay");
    const q = `${boardSvg(m.fen, { flip })}<p>${side} ${tr("chess.cardQ")}</p>`;
    const a = `${boardSvg(m.fen, { flip, arrow: [m.best.slice(0, 2), m.best.slice(2, 4)] })}<p><b>${sanFor(m.better, locale)}</b> · ${tr("chess.cardA", { m: sanFor(m.san, locale) })}</p>`;
    try {
      const deck = loadNoteDeck(localStorage, slug);
      saveNoteDeck(
        localStorage,
        slug,
        addQuestion(
          deck,
          `chess-${m.fen.split(" ").slice(0, 2).join("-").replace(/\//g, "")}`,
          { q, a, url: note.href, title: note.title },
          null,
        ),
      );
      window.dispatchEvent(new CustomEvent("gk:activity", { detail: { kind: "card" } }));
      setCards((s) => new Set(s).add(i));
    } catch {
      /* storage blocked */
    }
  };

  // --- pieces of the page -----------------------------------------------------

  const squareLabel = (sq: Square, key: string | null) =>
    key ? `${sq} ${tr(`chess.p_${key[1]}`)} ${tr(key[0] === "w" ? "chess.white" : "chess.black")}` : sq;

  const flip = (color === "b") !== flipped;
  const taken = captured(view.fen());
  const botSide: "w" | "b" = color === "w" ? "b" : "w";
  const shownEval =
    evals[shownPly] ??
    review?.curve[shownPly] ??
    (() => {
      for (let i = shownPly; i >= 0; i--) if (evals[i] !== undefined) return evals[i];
      return 0;
    })();
  const selected = moment !== null ? review?.moments[moment] : null;

  const strip = (side: "w" | "b") => {
    const isBot = side === botSide;
    const took = side === "w" ? taken.w : taken.b;
    const lead = side === "w" ? taken.lead : -taken.lead;
    return (
      <div className={`chess-player${isBot ? " is-bot" : " is-me"}`}>
        <span className="chess-avatar" aria-hidden="true">
          <PieceIcon piece={(isBot ? botSide : color) + (isBot ? BOT_ICON[level.id] : "k")} />
        </span>
        <span className="chess-player-name">
          <b>{isBot ? `Stockfish · ${tr(`chess.lv_${level.id}`)}` : tr("chess.you")}</b>
          <small>{isBot ? level.elo : (rec?.elo ?? "…")}</small>
        </span>
        <span className="chess-taken" aria-label={tr("chess.taken")}>
          {took.map((p, i) => (
            <PieceIcon key={i} piece={(side === "w" ? "b" : "w") + p} />
          ))}
          {lead > 0 && <small>+{lead}</small>}
        </span>
        {phase === "play" &&
          live &&
          view.turn() === side &&
          (isBot ? (
            <span className="chess-dots" role="status" aria-label={tr("chess.thinking")}>
              <i />
              <i />
              <i />
            </span>
          ) : (
            <span className="chess-turn">{view.inCheck() ? tr("chess.check") : tr("chess.yourTurn")}</span>
          ))}
      </div>
    );
  };

  const hintText = (h: Hint) => {
    const piece = tr(`chess.p_${h.piece}`);
    if (h.step >= 2) return tr("chess.hintPiece", { piece, sq: h.from });
    switch (h.kind) {
      case "mate":
        return tr("chess.hintMate", { n: h.mateIn });
      case "promote":
        return tr("chess.hintPromote");
      case "capture":
        return tr("chess.hintCapture");
      case "check":
        return tr("chess.hintCheck");
      default:
        return tr("chess.hintQuiet", { piece });
    }
  };

  const verdictCount = (k: "inaccuracy" | "mistake" | "blunder") => review?.counts[k] ?? 0;

  // ===========================================================================

  if (phase === "setup") {
    const yours = rec ? levelFor(rec.elo).id : null;
    return (
      <div className="chess chess-setup" data-phase="setup" data-pagefind-ignore>
        <div className="chess-setup-board" aria-hidden="true">
          <ChessBoard
            pos={new Chess()}
            flip={prefs.color === "b"}
            label={tr("chess.boardAria")}
            squareLabel={(sq) => sq}
          />
        </div>
        <div className="chess-setup-form">
          <p className="chess-setup-intro">{tr("chess.intro")}</p>
          {saved && (
            <div className="chess-card chess-resume">
              <span>
                <b>{tr("chess.inProgress")}</b>
                <small>
                  {tr(`chess.lv_${saved.level}`)} ·{" "}
                  {tr("chess.moveN", {
                    n: Math.floor((saved.sans.length + plyOffset(saved.start)) / 2) + 1,
                  })}
                </small>
              </span>
              <button type="button" className="chess-btn chess-btn--pri" onClick={resume}>
                {tr("chess.resume")}
              </button>
              <button
                type="button"
                className="chess-btn chess-btn--quiet"
                onClick={() => {
                  write(GAME_KEY, null);
                  setSaved(null);
                }}
              >
                {tr("chess.discard")}
              </button>
            </div>
          )}
          <div className="chess-card chess-elo">
            <span className="chess-elo-n">
              <small>{tr("chess.yourElo")}</small>
              <b>{rec?.elo ?? "…"}</b>
            </span>
            {rec && <Sparkline values={rec.hist} />}
            <span className="chess-elo-rec">
              {rec && rec.games > 0 ? (
                <>
                  <b>{tr("chess.games", { n: rec.games })}</b>
                  <small>
                    {tr("chess.record", {
                      w: rec.wins,
                      d: rec.draws,
                      l: rec.losses,
                    })}
                  </small>
                </>
              ) : (
                <small>{tr("chess.firstGame")}</small>
              )}
            </span>
          </div>
          <fieldset className="chess-levels">
            <legend>{tr("chess.opponent")}</legend>
            {LEVELS.map((l) => (
              <label key={l.id} className={`chess-level${level.id === l.id ? " is-on" : ""}`}>
                <input type="radio" name="chess-level" checked={level.id === l.id} onChange={() => setLevel(l)} />
                <span className="chess-avatar" aria-hidden="true">
                  <PieceIcon piece={`b${BOT_ICON[l.id]}`} />
                </span>
                <span className="chess-level-text">
                  {yours === l.id && <em>{tr("chess.yourLevel")}</em>}
                  <b>{tr(`chess.lv_${l.id}`)}</b>
                  <small>{tr(`chess.lvd_${l.id}`)}</small>
                </span>
                <span className="chess-level-elo">{l.elo}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="chess-colors">
            <legend>{tr("chess.yourPieces")}</legend>
            {(["w", "b", "random"] as const).map((c) => (
              <label key={c} className={prefs.color === c ? "is-on" : ""}>
                <input
                  type="radio"
                  name="chess-color"
                  checked={prefs.color === c}
                  onChange={() => savePrefs({ color: c })}
                />
                {c !== "random" && <i className={`chess-dot is-${c}`} aria-hidden="true" />}
                {tr(c === "w" ? "chess.whites" : c === "b" ? "chess.blacks" : "chess.random")}
              </label>
            ))}
          </fieldset>
          <label className="chess-toggle">
            <input type="checkbox" checked={prefs.eval} onChange={(e) => savePrefs({ eval: e.target.checked })} />
            <span>{tr("chess.showEval")}</span>
          </label>
          <button type="button" className="chess-btn chess-btn--pri chess-start" onClick={newGame}>
            {tr("chess.start")}
          </button>
          {ready === "error" && <p className="chess-error">{tr("chess.error")}</p>}
        </div>
      </div>
    );
  }

  const pairs: { n: number; w: number | null; b: number | null }[] = [];
  for (let i = 0; i < sans.length; i++) {
    const abs = i + offset;
    const n = Math.floor(abs / 2) + 1;
    if (abs % 2 === 0 || !pairs.length) pairs.push({ n, w: abs % 2 === 0 ? i : null, b: null });
    if (abs % 2 === 1) pairs[pairs.length - 1].b = i;
  }
  const isCur = (i: number | null) => i !== null && i + 1 === shownPly;
  const moveBtn = (i: number | null) =>
    i === null ? (
      <span className="chess-mv is-empty">…</span>
    ) : (
      <button
        type="button"
        className={`chess-mv${isCur(i) ? " is-cur" : ""}${review?.moments.some((m) => m.ply === i) ? ` is-${review.moments.find((m) => m.ply === i)!.verdict}` : ""}`}
        onClick={() => {
          setCursor(i + 1 >= sans.length ? null : i + 1);
          setMoment(null);
        }}
      >
        {sanFor(sans[i], locale)}
      </button>
    );

  const myCurve = review?.curve.map((v) => (color === "w" ? v : -v));
  const W = 500;
  const H = 96;
  const cx = (i: number) => (myCurve && myCurve.length > 1 ? (i / (myCurve.length - 1)) * W : 0);
  const cy = (v: number) => H - (evalShare(v) / 100) * H;

  const top = flip ? "w" : "b";
  const bottom = flip ? "b" : "w";

  return (
    <div className="chess chess-table" data-phase={phase} data-pagefind-ignore>
      <div className="chess-main">
        {strip(top)}
        <div className={`chess-boardwrap${prefs.eval || review ? " has-eval" : ""}`}>
          {(prefs.eval || review) && (
            <div
              className={`chess-eval${flip ? " is-flip" : ""}`}
              aria-label={tr("chess.evalAria", {
                v: evalLabel(shownEval, locale),
              })}
              role="img"
            >
              <span
                className="chess-eval-w"
                style={
                  {
                    blockSize: `${evalShare(shownEval)}%`,
                    ["--w" as string]: `${evalShare(shownEval)}%`,
                  } as CSSProperties
                }
              />
              <small>{evalLabel(shownEval, locale)}</small>
            </div>
          )}
          <ChessBoard
            pos={view}
            flip={flip}
            label={tr("chess.boardAria")}
            squareLabel={squareLabel}
            sel={live ? sel : null}
            targets={targets}
            last={selected ? null : lastMove}
            bad={selected ? [selected.from, selected.to] : undefined}
            pulse={hint && hint.step >= 2 && live ? hint.from : null}
            arrow={
              selected?.best
                ? {
                    from: selected.best.slice(0, 2),
                    to: selected.best.slice(2, 4),
                    tone: "good",
                  }
                : hint && hint.step === 3 && live
                  ? { from: hint.from, to: hint.to, tone: "hint" }
                  : null
            }
            onTap={phase === "play" ? tap : undefined}
            canDrag={myTurn && !promo ? mine : undefined}
            onDragStart={(sq) => setSel(sq)}
            onDrop={(from, to) => {
              if (!moveTo(from, to)) setSel(from);
            }}
            promo={
              promo
                ? {
                    to: promo.to,
                    color,
                    pick: (p) => play(promo.from, promo.to, p),
                    cancel: () => setPromo(null),
                  }
                : null
            }
          />
        </div>
        {strip(bottom)}
        {!live && phase === "play" && (
          <button type="button" className="chess-btn chess-back-live" onClick={() => setCursor(null)}>
            {tr("chess.backToGame")}
          </button>
        )}
      </div>

      <aside className="chess-panel">
        {opening && (
          <p className="chess-opening">
            <span>{opening}</span>
            {notes.openings && <a href={notes.openings.href}>{tr("chess.openingNote")}</a>}
          </p>
        )}

        {phase === "over" && result && (
          <section className="chess-result">
            <h2>{tr(result.key)}</h2>
            <p>
              {result.delta !== null ? (
                <span className={`chess-chip ${result.delta >= 0 ? "is-ok" : "is-blunder"}`}>
                  {tr("chess.eloAfter", {
                    d: result.delta >= 0 ? `+${result.delta}` : `−${-result.delta}`,
                    e: result.elo,
                  })}
                </span>
              ) : (
                <span className="chess-chip">{tr("chess.unrated")}</span>
              )}
            </p>
            {!review && (
              <div className="chess-btns">
                <button
                  type="button"
                  className="chess-btn chess-btn--pri"
                  disabled={reviewing !== null || !sans.length}
                  onClick={() => void runReview()}
                >
                  {reviewing !== null ? tr("chess.reviewing", { p: reviewing }) : tr("chess.review")}
                </button>
                <button
                  type="button"
                  className="chess-btn"
                  onClick={() =>
                    begin({
                      level,
                      color,
                      start: START,
                      sans: [],
                      unrated: false,
                    })
                  }
                >
                  {tr("chess.again")}
                </button>
                <button type="button" className="chess-btn chess-btn--quiet" onClick={() => setPhase("setup")}>
                  {tr("chess.newGame")}
                </button>
              </div>
            )}
          </section>
        )}

        {review && myCurve && (
          <section className="chess-review">
            <h3 className="chess-kicker">{tr("chess.curve")}</h3>
            <div className="chess-curve-wrap">
              <svg
                className="chess-curve"
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={tr("chess.curve")}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const i = Math.round(((e.clientX - r.left) / r.width) * (myCurve.length - 1));
                  setCursor(Math.max(0, Math.min(sans.length, i)));
                  setMoment(null);
                }}
              >
                <line className="chess-curve-mid" x1="0" y1={H / 2} x2={W} y2={H / 2} />
                <path
                  className="chess-curve-fill"
                  d={`M0,${H} ${myCurve.map((v, i) => `L${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(" ")} L${W},${H}Z`}
                />
                <polyline
                  className="chess-curve-line"
                  points={myCurve.map((v, i) => `${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(" ")}
                />
                <line className="chess-curve-cur" x1={cx(shownPly)} y1="0" x2={cx(shownPly)} y2={H} />
              </svg>
              <div className="chess-curve-dots" aria-hidden="true">
                {review.moments.map((m, i) => (
                  <i
                    key={m.ply}
                    className={`is-${m.verdict}${moment === i ? " is-on" : ""}`}
                    style={{
                      insetInlineStart: `${(cx(m.ply + 1) / W) * 100}%`,
                      insetBlockStart: `${(cy(myCurve[m.ply + 1]) / H) * 100}%`,
                    }}
                  />
                ))}
              </div>
            </div>
            <p className="chess-counts">
              {tr("chess.counts", {
                i: verdictCount("inaccuracy"),
                m: verdictCount("mistake"),
                b: verdictCount("blunder"),
              })}
            </p>
            <h3 className="chess-kicker">{tr("chess.reviewTitle")}</h3>
            {review.moments.length === 0 ? (
              <p>{tr("chess.clean")}</p>
            ) : (
              <ol className="chess-moments">
                {review.moments.map((m, i) => {
                  const note = notes[m.topic];
                  const n = Math.floor((m.ply + offset) / 2) + 1;
                  const on = moment === i;
                  return (
                    <li key={m.ply} className={`chess-moment is-${m.verdict}${on ? " is-on" : ""}`}>
                      <button
                        type="button"
                        className="chess-moment-head"
                        onClick={() => showMoment(i)}
                        aria-expanded={on}
                      >
                        <b>
                          {n}
                          {(m.ply + offset) % 2 ? "… " : ". "}
                          {sanFor(m.san, locale)}
                          {m.verdict === "blunder" ? "??" : "?"}
                        </b>
                        <span className={`chess-chip is-${m.verdict}`}>
                          {tr(`chess.v_${m.verdict}`)} · −
                          {(m.loss / 100).toFixed(1).replace(".", locale === "fr" || locale === "es" ? "," : ".")}
                        </span>
                      </button>
                      {on && (
                        <div className="chess-moment-body">
                          {m.better && (
                            <p>
                              {tr("chess.better", {
                                m: sanFor(m.better, locale),
                              })}
                            </p>
                          )}
                          <div className="chess-moment-links">
                            {note && <a href={note.href}>{tr("chess.readNote", { title: note.title })}</a>}
                            <button type="button" className="chess-link is-garden" onClick={() => replayFrom(m)}>
                              {tr("chess.replayFrom")}
                            </button>
                            {note && m.better && (
                              <button
                                type="button"
                                className="chess-link"
                                disabled={cards.has(i)}
                                onClick={() => makeCard(i, m)}
                              >
                                {cards.has(i) ? tr("chess.cardMade") : tr("chess.makeCard")}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="chess-btns">
              <button
                type="button"
                className="chess-btn chess-btn--pri"
                onClick={() =>
                  begin({
                    level,
                    color,
                    start: START,
                    sans: [],
                    unrated: false,
                  })
                }
              >
                {tr("chess.again")}
              </button>
              <button type="button" className="chess-btn chess-btn--quiet" onClick={() => setPhase("setup")}>
                {tr("chess.newGame")}
              </button>
            </div>
          </section>
        )}

        {phase === "play" && (
          <section className="chess-coach">
            {hint ? (
              <p className="chess-bubble">
                {hintText(hint)}
                <small>
                  {notes[hint.topic] && <a href={notes[hint.topic]!.href}>{notes[hint.topic]!.title}</a>}
                  {tr("chess.hintStep", { n: hint.step })}
                </small>
              </p>
            ) : (
              <p className="chess-status" role="status">
                {ready === "loading"
                  ? tr("chess.loading")
                  : ready === "error"
                    ? tr("chess.error")
                    : !live
                      ? tr("chess.browsing")
                      : view.turn() === color
                        ? tr("chess.yourMove")
                        : tr("chess.thinking")}
              </p>
            )}
            <div className="chess-btns">
              <button
                type="button"
                className="chess-btn"
                disabled={!myTurn || hintBusy || hint?.step === 3}
                onClick={() => void askHint()}
              >
                {hint ? tr("chess.hintMore") : tr("chess.hint")}
              </button>
            </div>
            {!hint && !unrated && <small className="chess-note">{tr("chess.hintUnrated")}</small>}
            {unrated && <small className="chess-note">{tr("chess.unratedNow")}</small>}
          </section>
        )}

        <ol ref={movesRef} className="chess-moves" aria-label={tr("chess.moves")}>
          {pairs.map((p) => (
            <li key={p.n}>
              <span className="chess-mv-n">{p.n}.</span>
              {moveBtn(p.w)}
              {moveBtn(p.b)}
            </li>
          ))}
        </ol>

        <div className="chess-actions">
          <button
            type="button"
            className="chess-icon"
            aria-label={tr("chess.prev")}
            disabled={shownPly === 0}
            onClick={() => {
              setCursor(Math.max(0, shownPly - 1));
              setMoment(null);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="chess-icon"
            aria-label={tr("chess.next")}
            disabled={live}
            onClick={() => {
              setCursor(shownPly + 1 >= sans.length ? null : shownPly + 1);
              setMoment(null);
            }}
          >
            ›
          </button>
          <button type="button" className="chess-act" onClick={() => setFlipped((f) => !f)}>
            ⇅ {tr("chess.flip")}
          </button>
          {phase === "play" && (
            <button
              type="button"
              className="chess-act"
              disabled={!myTurn || sans.length < (color === "w" ? 2 : 3)}
              onClick={takeBack}
            >
              ↶ {tr("chess.takeBack")}
            </button>
          )}
          <button type="button" className="chess-act" disabled={!sans.length} onClick={() => void copyPgn()}>
            {copied ? tr("chess.copied") : tr("chess.pgn")}
          </button>
          <label className="chess-act chess-toggle">
            <input type="checkbox" checked={prefs.eval} onChange={(e) => savePrefs({ eval: e.target.checked })} />
            <span>{tr("chess.evalShort")}</span>
          </label>
          {phase === "play" && (
            <button type="button" className="chess-act is-quiet" onClick={() => finish(0, "chess.resigned")}>
              ⚑ {tr("chess.resign")}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
