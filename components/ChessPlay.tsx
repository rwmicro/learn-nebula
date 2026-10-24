"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { recordActivity } from "@/lib/personal";
import {
  CHESS_NOTES,
  ELO_KEY,
  LEVELS,
  levelFor,
  parseBestMove,
  parseElo,
  parseScore,
  topicOf,
  updateElo,
  verdict,
  type ChessTopic,
  type EloRecord,
  type Level,
  type Verdict,
} from "@/lib/chess-play";

// /echecs/: a game against Stockfish (the lite single-threaded build in
// public/engine/, run in a worker, nothing leaves the browser), five levels,
// the reader's own Elo in this browser, and after the game a review: each
// of the reader's mistakes with the better move and the vault note about
// what was missed (lib/chess-play.ts topicOf).

const ENGINE_URL = "/engine/stockfish-17.1-lite-single-03e3232.js";
const GLYPH: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const FILES = "abcdefgh";

/** One UCI conversation at a time: `go` resolves on `bestmove`, with the
 *  last score the engine printed (centipawns, side to move). */
class Engine {
  private w: Worker;
  private lines: ((l: string) => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  constructor() {
    this.w = new Worker(ENGINE_URL);
    this.w.onmessage = (e: MessageEvent) => {
      const line = String(e.data);
      for (const f of this.lines.slice()) f(line);
    };
  }
  private until(test: (l: string) => boolean, onLine?: (l: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const f = (l: string) => {
        onLine?.(l);
        if (test(l)) {
          this.lines = this.lines.filter((x) => x !== f);
          resolve(l);
        }
      };
      this.lines.push(f);
    });
  }
  private run<T>(job: () => Promise<T>): Promise<T> {
    const p = this.queue.then(job);
    this.queue = p.catch(() => undefined);
    return p;
  }
  init(): Promise<void> {
    return this.run(async () => {
      const ok = this.until((l) => l === "uciok");
      this.w.postMessage("uci");
      await ok;
    });
  }
  configure(options: Record<string, string | number>): Promise<void> {
    return this.run(async () => {
      for (const [k, v] of Object.entries(options)) this.w.postMessage(`setoption name ${k} value ${v}`);
      const ready = this.until((l) => l === "readyok");
      this.w.postMessage("isready");
      await ready;
    });
  }
  go(fen: string, search: { depth?: number; movetime?: number }): Promise<{ best: string | null; score: number }> {
    return this.run(async () => {
      let score = 0;
      const done = this.until(
        (l) => l.startsWith("bestmove"),
        (l) => {
          const s = parseScore(l);
          if (s !== null) score = s;
        },
      );
      this.w.postMessage(`position fen ${fen}`);
      this.w.postMessage(search.depth ? `go depth ${search.depth}` : `go movetime ${search.movetime ?? 500}`);
      const line = await done;
      return { best: parseBestMove(line), score };
    });
  }
  stop() {
    this.w.terminate();
  }
}

/** Options every level sets, so one level's limits never leak into the next. */
const RESET = { UCI_LimitStrength: "false", "Skill Level": 20 };

interface Review {
  ply: number;
  san: string;
  better: string | null;
  verdict: Verdict;
  topic: ChessTopic;
}

function readElo(): EloRecord {
  try {
    return parseElo(localStorage.getItem(ELO_KEY));
  } catch {
    return parseElo(null);
  }
}

export function ChessPlay({ notes }: { notes: Partial<Record<ChessTopic, { href: string; title: string }>> }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  // The game being played, changed by the handlers; the render reads `view`,
  // rebuilt from the moves in state.
  const game = useRef<Chess | null>(null);
  const engine = useRef<Engine | null>(null);
  const [sans, setSans] = useState<string[]>([]);
  const [rec, setRec] = useState<EloRecord | null>(null);
  const [level, setLevel] = useState<Level>(LEVELS[1]);
  const [color, setColor] = useState<"w" | "b">("w");
  const [sel, setSel] = useState<Square | null>(null);
  const [thinking, setThinking] = useState(false);
  const [ready, setReady] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [result, setResult] = useState<null | { score: 0 | 0.5 | 1; key: string; delta: number }>(null);
  const [started, setStarted] = useState(false);
  const [review, setReview] = useState<Review[] | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);

  useEffect(() => {
    game.current = new Chess();
    const r = readElo();
    setRec(r);
    setLevel(levelFor(r.elo));
    return () => engine.current?.stop();
  }, []);

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

  /** The game is over: the result, the Elo, the day's activity. */
  const over = useRef(false);
  const finish = useCallback(
    (score: 0 | 0.5 | 1, key: string) => {
      if (over.current) return;
      over.current = true;
      const before = readElo();
      const after = updateElo(before, level.elo, score);
      try {
        localStorage.setItem(ELO_KEY, JSON.stringify(after));
        recordActivity("c");
      } catch {
        /* storage blocked: the Elo isn't kept */
      }
      setRec(after);
      setResult({ score, key, delta: after.elo - before.elo });
    },
    [level],
  );

  const checkEnd = useCallback(() => {
    const g = game.current;
    if (!g || !g.isGameOver()) return false;
    if (g.isCheckmate()) finish(g.turn() === color ? 0 : 1, g.turn() === color ? "chess.lostMate" : "chess.wonMate");
    else finish(0.5, g.isStalemate() ? "chess.stalemate" : "chess.draw");
    return true;
  }, [color, finish]);

  const engineMove = useCallback(async () => {
    const e = await boot();
    if (!e) return;
    const g = game.current;
    if (!g) return;
    setThinking(true);
    await e.configure({ ...RESET, ...level.options });
    const { best } = await e.go(g.fen(), level);
    setThinking(false);
    if (!best || over.current || g !== game.current) return;
    try {
      g.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] ?? "q" });
    } catch {
      return;
    }
    setSans(g.history());
    checkEnd();
  }, [boot, level, checkEnd]);

  const newGame = (as: "w" | "b") => {
    game.current = new Chess();
    over.current = false;
    setSans([]);
    setColor(as);
    setSel(null);
    setResult(null);
    setReview(null);
    setStarted(true);
    if (as === "b") void engineMove();
    else void boot();
  };

  const view = useMemo(() => {
    const c = new Chess();
    for (const m of sans) c.move(m);
    return c;
  }, [sans]);
  const targets = useMemo(
    () => new Set<string>(sel ? view.moves({ square: sel, verbose: true }).map((m) => m.to) : []),
    [sel, view],
  );

  const tap = (sq: Square) => {
    const g = game.current;
    if (!g || !started || result || thinking || g.turn() !== color) return;
    const piece = g.get(sq);
    if (sel && targets.has(sq)) {
      g.move({ from: sel, to: sq, promotion: "q" });
      setSel(null);
      setSans(g.history());
      if (!checkEnd()) void engineMove();
      return;
    }
    setSel(piece && piece.color === color ? sq : null);
  };

  /** Each position evaluated at full strength; each of the reader's moves
   *  graded by what it lost. */
  const runReview = async () => {
    const e = await boot();
    if (!e || !game.current) return;
    const moves = game.current.history({ verbose: true });
    if (!moves.length) return;
    await e.configure({ ...RESET });
    const replay = new Chess();
    const fens = [replay.fen()];
    for (const m of moves) {
      replay.move(m.san);
      fens.push(replay.fen());
    }
    const evals: { best: string | null; score: number }[] = [];
    for (let i = 0; i < fens.length; i++) {
      setReviewing(Math.round((100 * i) / fens.length));
      const over = new Chess(fens[i]).isGameOver();
      evals.push(over ? { best: null, score: new Chess(fens[i]).isCheckmate() ? -10000 : 0 } : await e.go(fens[i], { depth: 10 }));
    }
    setReviewing(null);
    const out: (Review & { loss: number })[] = [];
    let opponentBlundered = false;
    moves.forEach((m, i) => {
      const mine = m.color === color;
      const before = evals[i].score;
      const after = -evals[i + 1].score;
      const v = verdict(before, after);
      if (!mine) {
        opponentBlundered = v.verdict === "blunder";
        return;
      }
      if (v.verdict === "mistake" || v.verdict === "blunder") {
        const best = evals[i].best;
        let better: string | null = null;
        if (best) {
          const c = new Chess(fens[i]);
          better = c.move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] ?? "q" })?.san ?? null;
        }
        out.push({
          ply: i,
          san: m.san,
          better,
          verdict: v.verdict,
          loss: v.loss,
          topic: topicOf(fens[i], Math.floor(i / 2) + 1, before, after, opponentBlundered),
        });
      }
      opponentBlundered = false;
    });
    setReview(out.sort((a, b) => b.loss - a.loss).slice(0, 5).sort((a, b) => a.ply - b.ply));
  };

  const g = view;
  const last = g.history({ verbose: true }).at(-1);
  const checkSq = g.inCheck()
    ? (FILES.split("").flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => `${f}${r}` as Square)).find((s) => {
        const p = g.get(s);
        return p && p.type === "k" && p.color === g.turn();
      }) ?? null)
    : null;
  const ranks = color === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = color === "w" ? FILES.split("") : FILES.split("").reverse();
  const moveList = sans;

  return (
    <div className="chess" data-pagefind-ignore>
      <div className="chess-side">
        <p className="chess-elo">
          <span>{tr("chess.yourElo")}</span>
          <b>{rec?.elo ?? "…"}</b>
          {rec && rec.games > 0 && <small>{tr("chess.record", { w: rec.wins, d: rec.draws, l: rec.losses })}</small>}
        </p>
        <label className="chess-level">
          <span>{tr("chess.level")}</span>
          <select
            value={level.id}
            disabled={started && !result}
            onChange={(e) => setLevel(LEVELS.find((l) => l.id === e.target.value) ?? LEVELS[0])}
          >
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {tr(`chess.lv_${l.id}`)} · {l.elo}
              </option>
            ))}
          </select>
        </label>
        <div className="chess-btns">
          <button type="button" className="chess-btn chess-btn--pri" onClick={() => newGame("w")}>
            {tr("chess.playWhite")}
          </button>
          <button type="button" className="chess-btn" onClick={() => newGame("b")}>
            {tr("chess.playBlack")}
          </button>
          {started && !result && moveList.length > 0 && (
            <button type="button" className="chess-btn chess-btn--quiet" onClick={() => finish(0, "chess.resigned")}>
              {tr("chess.resign")}
            </button>
          )}
        </div>
        <p className="chess-status" role="status">
          {ready === "loading"
            ? tr("chess.loading")
            : ready === "error"
              ? tr("chess.error")
              : result
                ? `${tr(result.key)} ${tr("chess.delta", { d: result.delta >= 0 ? `+${result.delta}` : String(result.delta) })}`
                : thinking
                  ? tr("chess.thinking")
                  : started
                    ? tr(g.turn() === color ? "chess.yourMove" : "chess.thinking")
                    : tr("chess.intro")}
        </p>
        {result && !review && (
          <button type="button" className="chess-btn chess-btn--pri" disabled={reviewing !== null} onClick={() => void runReview()}>
            {reviewing !== null ? tr("chess.reviewing", { p: reviewing }) : tr("chess.review")}
          </button>
        )}
        {review && (
          <div className="chess-review">
            <h2>{tr("chess.reviewTitle")}</h2>
            {review.length === 0 ? (
              <p>{tr("chess.clean")}</p>
            ) : (
              <ol>
                {review.map((r) => {
                  const note = notes[r.topic];
                  return (
                    <li key={r.ply} className={`is-${r.verdict}`}>
                      <b>
                        {Math.floor(r.ply / 2) + 1}
                        {r.ply % 2 ? "… " : ". "}
                        {r.san}
                      </b>{" "}
                      <span className="chess-verdict">{tr(`chess.v_${r.verdict}`)}</span>
                      {r.better && <span className="chess-better">{tr("chess.better", { m: r.better })}</span>}
                      {note && <a href={note.href}>{tr("chess.readNote", { title: note.title })}</a>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
        {moveList.length > 0 && (
          <p className="chess-moves">
            {moveList.map((m, i) => (
              <span key={i}>
                {i % 2 === 0 && <small>{i / 2 + 1}.</small>}
                {m}{" "}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="chess-board" role="grid" aria-label={tr("chess.boardAria")}>
        {ranks.map((r) =>
          files.map((f) => {
            const sq = `${f}${r}` as Square;
            const p = g.get(sq);
            const dark = (FILES.indexOf(f) + r) % 2 === 0;
            const cls = [
              "chess-sq",
              dark ? "is-dark" : "",
              sel === sq ? "is-sel" : "",
              targets.has(sq) ? (p ? "is-take" : "is-to") : "",
              last && (last.from === sq || last.to === sq) ? "is-last" : "",
              checkSq === sq ? "is-check" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={sq}
                type="button"
                className={cls}
                onClick={() => tap(sq)}
                aria-label={`${sq}${p ? ` ${tr(`chess.p_${p.type}`)} ${tr(p.color === "w" ? "chess.white" : "chess.black")}` : ""}`}
              >
                {p && <span className={`chess-pc chess-pc--${p.color}`}>{GLYPH[p.color + p.type]}</span>}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
