"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";

// The chess half of the phone home's "Jouer et pratiquer" row
// (components/home/HomeDashboard.tsx, beside HomeTalk): a board in miniature
// on a wood band, then the level or the reader's Elo and the way in. With a
// game saved by /echecs/ it shows that game (its position and last move,
// whose turn) and "Reprendre"; otherwise the start position and "Jouer" at
// the level nearest the reader's Elo. The start board and the levels come
// from the build (app/page.tsx), so the first paint needs no chess code;
// chess.js is only fetched, as its own chunk, to draw a saved game.

export interface HomeChessData {
  /** The start position, drawn at build by lib/chess-play.ts boardSvg(). */
  startBoard: string;
  levels: { id: string; elo: number }[];
}

interface Saved {
  board: string;
  myTurn: boolean;
  move: number;
}

interface Rec {
  elo: number;
  games: number;
}

/** The chess card's state, shared with the desktop home (HomeDesk): the
 *  game in progress or the level to play, and the line under the title. */
export function useChessCard(data: HomeChessData) {
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
      setRec({ elo: r.elo, games: r.games });
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
          myTurn: c.turn() === g.color,
          move: Math.floor(ply / 2) + 1,
        });
      } catch {
        /* a game chess.js refuses: show the start instead */
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const level = pick ?? "facile";
  const lv = (id: string) => tr(`chess.lv_${id}`);
  const elo = data.levels.find((l) => l.id === level)?.elo ?? "";
  const href = saved ? "/echecs/#reprendre" : `/echecs/#jouer=${level}`;
  const sub = saved
    ? `${tr("dash.chessInProgress")} · ${tr(saved.myTurn ? "dash.chessTurn" : "dash.chessBotTurn", { n: saved.move })}`
    : rec && rec.games > 0
      ? tr("dash.chessYourElo", { elo: rec.elo, lv: lv(level) })
      : tr("dash.chessBot", { lv: lv(level), elo });
  return { href, sub, level, saved: !!saved, board: saved ? saved.board : data.startBoard, tr };
}

export function HomeChess({ data }: { data: HomeChessData }) {
  const { href, sub, saved, board, tr } = useChessCard(data);
  return (
    <a className="dash-play-card dash-play-chess" href={href}>
      <span className="dash-play-band" aria-hidden="true">
        <span
          className={`dash-chess-board${saved ? " is-game" : ""}`}
          dangerouslySetInnerHTML={{ __html: board }}
        />
      </span>
      <span className="dash-play-body">
        <b>{tr("dash.chess")}</b>
        <small>{sub}</small>
        <span className="dash-play-go">
          {tr(saved ? "dash.chessResumeShort" : "dash.chessGo")}
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </span>
      </span>
    </a>
  );
}
