"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { PIECE_SVG } from "@/lib/chess-pieces";

// The phone home's chess card (components/home/HomeDashboard.tsx): a board
// in miniature over a wood band, then the reader's Elo and the way in. With
// a game saved by /echecs/ it shows that game (the position, its last move,
// whose turn, the opening) and "Reprendre la partie"; otherwise the start
// position, the five levels to pick from and "Jouer une partie". The board
// of the start position and the levels come from the build (app/page.tsx),
// so the first paint needs no chess code; chess.js is only fetched, as its
// own chunk, to draw a saved game.

export interface HomeChessData {
  /** The start position, drawn at build by lib/chess-play.ts boardSvg(). */
  startBoard: string;
  levels: { id: string; elo: number }[];
  /** The openings note, when the vault has it. */
  openings: string | null;
}

interface Saved {
  board: string;
  level: string;
  white: boolean;
  myTurn: boolean;
  move: number;
  opening: string | null;
}

interface Rec {
  elo: number;
  games: number;
  hist: number[];
}

/** Bot avatar per level, as on /echecs/. */
const BOT_ICON: Record<string, string> = { debutant: "p", facile: "n", moyen: "b", fort: "r", expert: "q" };

const Piece = ({ k }: { k: string }) => (
  <svg viewBox="0 0 45 45" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PIECE_SVG[k] ?? "" }} />
);

function Spark({ values }: { values: number[] }) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(26 - ((v - lo) / (hi - lo || 1)) * 22).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="dash-chess-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} />
    </svg>
  );
}

const Duo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <circle cx="8" cy="8" r="3" />
    <circle cx="16" cy="8" r="3" />
    <path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5" />
  </svg>
);

export function HomeChess({ data }: { data: HomeChessData }) {
  const locale = useLocale();
  const tr = (k: string, v?: Record<string, string | number>) => t(k, v, locale);
  const [rec, setRec] = useState<Rec | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    let raw: { elo: string | null; game: string | null };
    try {
      raw = { elo: localStorage.getItem("gkChessElo"), game: localStorage.getItem("gkChessGame") };
    } catch {
      return;
    }
    if (!raw.elo && !raw.game) return;
    let live = true;
    void import("@/lib/chess-play").then((m) => {
      if (!live) return;
      const r = m.parseElo(raw.elo);
      setRec({ elo: r.elo, games: r.games, hist: r.hist });
      setPick(m.levelFor(r.elo).id);
      const g = m.parseSavedGame(raw.game);
      if (!g) return;
      try {
        const { Chess } = m;
        const c = new Chess(g.start);
        for (const s of g.sans) c.move(s);
        const last = c.history({ verbose: true }).at(-1);
        // Plies before the saved start (a replay from a review starts
        // mid-game), as /echecs/ counts its "coup n".
        const [, side, , , , full] = g.start.split(" ");
        const ply = (Number(full) || 1) * 2 - (side === "b" ? 1 : 2) + g.sans.length;
        setSaved({
          board: m.boardSvg(c.fen(), { flip: g.color === "b", mark: last ? [last.from, last.to] : [] }),
          level: g.level,
          white: g.color === "w",
          myTurn: c.turn() === g.color,
          move: Math.floor(ply / 2) + 1,
          opening: g.start === m.START ? m.openingOf(g.sans, locale) : null,
        });
      } catch {
        /* a game chess.js refuses: show the start instead */
      }
    });
    return () => {
      live = false;
    };
  }, [locale]);

  const level = pick ?? "facile";
  const lv = (id: string) => tr(`chess.lv_${id}`);
  const savedElo = saved ? (data.levels.find((l) => l.id === saved.level)?.elo ?? "") : "";
  const hist = rec && rec.hist.length >= 2 ? rec.hist.slice(-10) : null;
  const trend = hist ? hist[hist.length - 1] - hist[0] : 0;

  return (
    <section className="dash-chess-sec" aria-labelledby="dash-chess-h">
      <div className="dash-row-h">
        <h2 className="dash-h" id="dash-chess-h">
          {tr("dash.chess")}
        </h2>
        <a href="/duel/">{tr("dash.chessDuel")}</a>
      </div>
      <div className="dash-chess">
        <a className="dash-chess-top" href={saved ? "/echecs/#reprendre" : `/echecs/#jouer=${level}`} tabIndex={-1} aria-hidden="true">
          <span
            className={`dash-chess-board${saved ? " is-game" : ""}`}
            dangerouslySetInnerHTML={{ __html: saved ? saved.board : data.startBoard }}
          />
          {saved ? (
            <span className="dash-chess-side">
              <span className="dash-chess-k">{tr("dash.chessInProgress")}</span>
              <span className="dash-chess-bot">
                <span className="dash-chess-av">
                  <Piece k={(saved.white ? "b" : "w") + (BOT_ICON[saved.level] ?? "n")} />
                </span>
                <span>
                  <b>Stockfish · {lv(saved.level)}</b>
                  <small>
                    {savedElo} · {tr(saved.white ? "dash.chessWhite" : "dash.chessBlack")}
                  </small>
                </span>
              </span>
              <span className={`dash-chess-turn${saved.myTurn ? "" : " is-bot"}`}>
                <i />
                {tr(saved.myTurn ? "dash.chessTurn" : "dash.chessBotTurn", { n: saved.move })}
              </span>
              {saved.opening && <span className="dash-chess-txt">{saved.opening}</span>}
            </span>
          ) : (
            <span className="dash-chess-side">
              <span className="dash-chess-k">{rec && rec.games > 0 ? tr("dash.chessAgain") : tr("dash.chessNew")}</span>
              <b className="dash-chess-title">{tr("dash.chessPlayTitle")}</b>
              <span className="dash-chess-txt">{tr("dash.chessPlayText")}</span>
            </span>
          )}
        </a>
        <div className="dash-chess-body">
          {rec && rec.games > 0 && (
            <a className="dash-chess-elo" href="/echecs/">
              <span className="dash-chess-n">
                <small>{tr("dash.chessElo")}</small>
                <b>{rec.elo}</b>
              </span>
              {hist ? <Spark values={hist} /> : <span className="dash-chess-spark" />}
              <span className={`dash-chess-up${trend < 0 ? " is-down" : ""}`}>
                {hist
                  ? tr("dash.chessTrend", { d: trend >= 0 ? `+${trend}` : `−${-trend}`, n: hist.length - 1 })
                  : tr(rec.games === 1 ? "dash.chessGames1" : "dash.chessGames", { n: rec.games })}
              </span>
            </a>
          )}
          {!saved && (
            <div className="dash-chess-lv" role="radiogroup" aria-label={tr("dash.chessLevels")}>
              {data.levels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={l.id === level}
                  className={l.id === level ? "is-on" : undefined}
                  onClick={() => setPick(l.id)}
                >
                  <b>{lv(l.id)}</b>
                  <small>{l.elo}</small>
                </button>
              ))}
            </div>
          )}
          <a className="dash-chess-go" href={saved ? "/echecs/#reprendre" : `/echecs/#jouer=${level}`}>
            {tr(saved ? "dash.chessResume" : "dash.chessPlay")}
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </a>
          <div className="dash-chess-row">
            {saved ? (
              <a href="/echecs/">{tr("dash.chessNewGame")}</a>
            ) : data.openings ? (
              <a href={data.openings}>{tr("dash.chessOpenings")}</a>
            ) : (
              <a href="/echecs/">{tr("dash.chessSetup")}</a>
            )}
            <a href="/duel/">
              <Duo />
              {tr("dash.chessDuelLive")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
