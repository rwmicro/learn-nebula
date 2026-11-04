/**
 * Playing chess against Stockfish (/echecs/, components/play/ChessPlay.tsx): the
 * levels, the reader's own Elo, and the game review that links each mistake
 * to the vault note that teaches what was missed. Pure: the board rules come
 * from chess.js, the engine runs in a worker (public/engine/).
 */

import { Chess } from "chess.js";
import { PIECE_SVG } from "./chess-pieces";

/** chess.js, for the home's chess card, which loads this module lazily. */
export { Chess };

/** The usual start position. */
export const START = new Chess().fen();

export interface Level {
  id: string;
  /** Rating the level plays at, for the reader's Elo. */
  elo: number;
  /** UCI options for the engine. Stockfish's own strength limit starts at
   *  1320; under it, a low skill level and a shallow search. */
  options: Record<string, string | number>;
  /** Search per move: depth or milliseconds. */
  depth?: number;
  movetime?: number;
}

export const LEVELS: Level[] = [
  { id: "debutant", elo: 600, options: { "Skill Level": 0 }, depth: 1 },
  { id: "facile", elo: 900, options: { "Skill Level": 3 }, depth: 3 },
  {
    id: "moyen",
    elo: 1400,
    options: { UCI_LimitStrength: "true", UCI_Elo: 1400 },
    movetime: 400,
  },
  {
    id: "fort",
    elo: 1800,
    options: { UCI_LimitStrength: "true", UCI_Elo: 1800 },
    movetime: 600,
  },
  {
    id: "expert",
    elo: 2300,
    options: { UCI_LimitStrength: "false", "Skill Level": 20 },
    movetime: 800,
  },
];

export const ELO_KEY = "gkChessElo";
export const START_ELO = 800;

export interface EloRecord {
  elo: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** The rating after each of the last games, oldest first (at most
   *  HIST_MAX): the line on the setup screen. Older records have none. */
  hist: number[];
}

export const HIST_MAX = 30;

export function parseElo(raw: string | null): EloRecord {
  const base: EloRecord = {
    elo: START_ELO,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    hist: [],
  };
  try {
    const o = raw ? (JSON.parse(raw) as Partial<EloRecord>) : null;
    if (!o || typeof o !== "object") return base;
    const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : d);
    return {
      elo: Math.min(3200, Math.max(100, n(o.elo, START_ELO))),
      games: n(o.games, 0),
      wins: n(o.wins, 0),
      draws: n(o.draws, 0),
      losses: n(o.losses, 0),
      hist: Array.isArray(o.hist)
        ? o.hist
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
            .map((v) => Math.min(3200, Math.max(100, Math.round(v))))
            .slice(-HIST_MAX)
        : [],
    };
  } catch {
    return base;
  }
}

/** The usual Elo update; K 40 for the first 20 games, then 20. `score` is
 *  1 (won), 0.5 (draw) or 0 (lost). */
export function updateElo(rec: EloRecord, opponent: number, score: 0 | 0.5 | 1): EloRecord {
  const expected = 1 / (1 + 10 ** ((opponent - rec.elo) / 400));
  const k = rec.games < 20 ? 40 : 20;
  const elo = Math.max(100, Math.round(rec.elo + k * (score - expected)));
  return {
    elo,
    games: rec.games + 1,
    wins: rec.wins + (score === 1 ? 1 : 0),
    draws: rec.draws + (score === 0.5 ? 1 : 0),
    losses: rec.losses + (score === 0 ? 1 : 0),
    hist: [...(rec.hist.length ? rec.hist : [rec.elo]), elo].slice(-HIST_MAX),
  };
}

/** The level closest to a rating: where a new game starts. */
export function levelFor(elo: number): Level {
  return LEVELS.reduce((a, b) => (Math.abs(b.elo - elo) < Math.abs(a.elo - elo) ? b : a));
}

// ---------------------------------------------------------------------------
// Engine output
// ---------------------------------------------------------------------------

/** Score of an `info … score cp N | mate N` line, in centipawns for the side
 *  to move (a mate is ±10000 less the distance); null on another line. */
export function parseScore(line: string): number | null {
  const m = line.match(/\bscore (cp|mate) (-?\d+)/);
  if (!m) return null;
  const v = Number(m[2]);
  if (m[1] === "cp") return v;
  return v > 0 ? 10000 - v : v < 0 ? -10000 - v : -10000;
}

/** The move of a `bestmove e2e4` line, or null. */
export function parseBestMove(line: string): string | null {
  const m = line.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export type Verdict = "good" | "inaccuracy" | "mistake" | "blunder";

/** How much a move lost, in centipawns from the mover's side (before minus
 *  after, both from the mover's view), and what that makes it. Scores are
 *  capped so a won position stays won whatever the margin. */
export function verdict(before: number, after: number): { loss: number; verdict: Verdict } {
  const cap = (v: number) => Math.max(-1500, Math.min(1500, v));
  const loss = Math.max(0, cap(before) - cap(after));
  return {
    loss,
    verdict: loss >= 300 ? "blunder" : loss >= 120 ? "mistake" : loss >= 60 ? "inaccuracy" : "good",
  };
}

/** The vault's chess notes the review points to (slugs under /posts/). */
export const CHESS_NOTES = {
  openings: "applied-sciences/echecs/ouvertures/ouvertures",
  tactics: "applied-sciences/echecs/tactiques/milieu-de-partie-et-tactiques",
  puzzles: "applied-sciences/echecs/tactiques/puzzles-et-entrainement-tactique",
  kingAttack: "applied-sciences/echecs/strategie/attaque-au-roi",
  strategy: "applied-sciences/echecs/strategie/strategie-positionnelle",
  endgames: "applied-sciences/echecs/finales/finales",
  rookEndgames: "applied-sciences/echecs/finales/finales-de-tours",
  pawnEndgames: "applied-sciences/echecs/finales/finales-de-pions",
} as const;
export type ChessTopic = keyof typeof CHESS_NOTES;

/** Pieces left on the board, from the FEN's placement field. */
export function material(fen: string): {
  queens: number;
  rooks: number;
  minors: number;
  pawns: number;
} {
  const board = fen.split(" ")[0];
  const count = (re: RegExp) => (board.match(re) ?? []).length;
  return {
    queens: count(/[qQ]/g),
    rooks: count(/[rR]/g),
    minors: count(/[bBnN]/g),
    pawns: count(/[pP]/g),
  };
}

/**
 * What a mistake was about, to send the reader to the right note:
 * - in the first ten moves, the opening;
 * - in an endgame (no queens and little left), pawn or rook endgames, or
 *   endgames in general;
 * - one that let a mate in (or missed one), the attack on the king;
 * - a large swing, tactics; a smaller one, positional play.
 * `missed` is a move that let the opponent's blunder go unpunished: the
 * tactics puzzles.
 */
export function topicOf(
  fenBefore: string,
  moveNumber: number,
  before: number,
  after: number,
  missed = false,
): ChessTopic {
  const m = material(fenBefore);
  if (moveNumber <= 10) return "openings";
  if (m.queens === 0 && m.rooks + m.minors <= 3) {
    if (m.rooks === 0 && m.minors === 0) return "pawnEndgames";
    if (m.minors === 0) return "rookEndgames";
    return "endgames";
  }
  if (Math.abs(after) >= 9000 || Math.abs(before) >= 9000) return "kingAttack";
  if (missed) return "puzzles";
  return before - after >= 250 ? "tactics" : "strategy";
}

// ---------------------------------------------------------------------------
// The table: opening name, captured pieces, hints, the card board
// ---------------------------------------------------------------------------

/** Common openings by their first moves (chess.js SAN), longest match wins.
 *  French and English names: the other locales use the English one, the
 *  name most chess sites show. */
export const OPENINGS: [string, string, string][] = [
  ["e4", "Ouverture du pion roi", "King's Pawn Opening"],
  ["e4 e5", "Partie ouverte", "Open Game"],
  ["e4 e5 Nf3 Nc6 Bc4", "Partie italienne", "Italian Game"],
  ["e4 e5 Nf3 Nc6 Bc4 Bc5", "Giuoco piano", "Giuoco Piano"],
  ["e4 e5 Nf3 Nc6 Bc4 Bc5 b4", "Gambit Evans", "Evans Gambit"],
  ["e4 e5 Nf3 Nc6 Bc4 Nf6", "Défense des deux cavaliers", "Two Knights Defense"],
  ["e4 e5 Nf3 Nc6 Bb5", "Partie espagnole", "Ruy Lopez"],
  ["e4 e5 Nf3 Nc6 Bb5 a6", "Partie espagnole, défense Morphy", "Ruy Lopez, Morphy Defense"],
  ["e4 e5 Nf3 Nc6 Bb5 Nf6", "Partie espagnole, défense berlinoise", "Ruy Lopez, Berlin Defense"],
  ["e4 e5 Nf3 Nc6 d4", "Partie écossaise", "Scotch Game"],
  ["e4 e5 Nf3 Nc6 Nc3 Nf6", "Partie des quatre cavaliers", "Four Knights Game"],
  ["e4 e5 Nf3 Nf6", "Défense russe (Petrov)", "Petrov's Defense"],
  ["e4 e5 Nf3 d6", "Défense Philidor", "Philidor Defense"],
  ["e4 e5 f4", "Gambit du roi", "King's Gambit"],
  ["e4 e5 Nc3", "Partie viennoise", "Vienna Game"],
  ["e4 e5 Qh5", "Attaque Parham", "Parham Attack"],
  ["e4 e5 Bc4", "Ouverture du fou", "Bishop's Opening"],
  ["e4 c5", "Défense sicilienne", "Sicilian Defense"],
  ["e4 c5 Nf3 d6", "Sicilienne, variante classique", "Sicilian Defense, Modern Variations"],
  ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", "Sicilienne Najdorf", "Sicilian Najdorf"],
  ["e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6", "Sicilienne du dragon", "Sicilian Dragon"],
  ["e4 c5 Nf3 Nc6", "Sicilienne, Nc6", "Sicilian Defense, Old Sicilian"],
  ["e4 c5 Nf3 e6", "Sicilienne, e6", "Sicilian Defense, French Variation"],
  ["e4 c5 Nc3", "Sicilienne fermée", "Closed Sicilian"],
  ["e4 c5 c3", "Sicilienne Alapine", "Sicilian Alapin"],
  ["e4 e6", "Défense française", "French Defense"],
  ["e4 e6 d4 d5 e5", "Française, variante d'avance", "French Defense, Advance Variation"],
  ["e4 e6 d4 d5 exd5", "Française, variante d'échange", "French Defense, Exchange Variation"],
  ["e4 e6 d4 d5 Nc3", "Française, variante Paulsen", "French Defense, Paulsen Variation"],
  ["e4 e6 d4 d5 Nd2", "Française, variante Tarrasch", "French Defense, Tarrasch Variation"],
  ["e4 c6", "Défense Caro-Kann", "Caro-Kann Defense"],
  ["e4 c6 d4 d5 e5", "Caro-Kann, variante d'avance", "Caro-Kann Defense, Advance Variation"],
  ["e4 d5", "Défense scandinave", "Scandinavian Defense"],
  ["e4 d6", "Défense Pirc", "Pirc Defense"],
  ["e4 g6", "Défense moderne", "Modern Defense"],
  ["e4 Nf6", "Défense Alekhine", "Alekhine's Defense"],
  ["e4 Nc6", "Défense Nimzowitsch", "Nimzowitsch Defense"],
  ["d4", "Ouverture du pion dame", "Queen's Pawn Opening"],
  ["d4 d5", "Partie fermée", "Closed Game"],
  ["d4 d5 c4", "Gambit dame", "Queen's Gambit"],
  ["d4 d5 c4 dxc4", "Gambit dame accepté", "Queen's Gambit Accepted"],
  ["d4 d5 c4 e6", "Gambit dame refusé", "Queen's Gambit Declined"],
  ["d4 d5 c4 c6", "Défense slave", "Slav Defense"],
  ["d4 d5 c4 e5", "Contre-gambit Albin", "Albin Countergambit"],
  ["d4 d5 Bf4", "Système de Londres", "London System"],
  ["d4 d5 Nf3 Nf6 Bf4", "Système de Londres", "London System"],
  ["d4 Nf6 Bf4", "Système de Londres", "London System"],
  ["d4 Nf6 Nf3 d5 Bf4", "Système de Londres", "London System"],
  ["d4 Nf6", "Défense indienne", "Indian Defense"],
  ["d4 Nf6 c4 g6", "Défense est-indienne", "King's Indian Defense"],
  ["d4 Nf6 c4 g6 Nc3 d5", "Défense Grünfeld", "Grünfeld Defense"],
  ["d4 Nf6 c4 e6 Nc3 Bb4", "Défense nimzo-indienne", "Nimzo-Indian Defense"],
  ["d4 Nf6 c4 e6 Nf3 b6", "Défense ouest-indienne", "Queen's Indian Defense"],
  ["d4 Nf6 c4 c5", "Défense Benoni", "Benoni Defense"],
  ["d4 Nf6 c4 c5 d5 b5", "Gambit Benko", "Benko Gambit"],
  ["d4 f5", "Défense hollandaise", "Dutch Defense"],
  ["c4", "Ouverture anglaise", "English Opening"],
  ["Nf3", "Ouverture Réti", "Réti Opening"],
  ["f4", "Ouverture Bird", "Bird's Opening"],
  ["b3", "Ouverture Larsen", "Nimzo-Larsen Attack"],
  ["g3", "Ouverture du fianchetto", "Hungarian Opening"],
];

/** The name of the opening the moves are in (the longest known prefix), or
 *  null off the table. */
export function openingOf(sans: readonly string[], locale = "fr"): string | null {
  let best: [string, string, string] | null = null;
  let bestLen = 0;
  for (const o of OPENINGS) {
    const seq = o[0].split(" ");
    if (seq.length <= bestLen || seq.length > sans.length) continue;
    if (seq.every((m, i) => sans[i] === m)) {
      best = o;
      bestLen = seq.length;
    }
  }
  return best ? (locale === "fr" ? best[1] : best[2]) : null;
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FULL: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

/** The pieces each side has taken (`w`: black pieces white took, most
 *  valuable first) and white's lead in material, in pawns. A promoted
 *  piece counts as one more of its kind, so nothing goes negative. */
export function captured(fen: string): {
  w: string[];
  b: string[];
  lead: number;
} {
  const board = fen.split(" ")[0];
  const left: Record<string, number> = {};
  for (const ch of board) if (/[a-zA-Z]/.test(ch)) left[ch] = (left[ch] ?? 0) + 1;
  const taken = (side: "w" | "b") => {
    const out: string[] = [];
    for (const p of ["q", "r", "b", "n", "p"]) {
      const ch = side === "w" ? p : p.toUpperCase();
      for (let i = left[ch] ?? 0; i < FULL[p]; i++) out.push(p);
    }
    return out;
  };
  let lead = 0;
  for (const [ch, n] of Object.entries(left)) lead += (ch === ch.toUpperCase() ? 1 : -1) * VALUE[ch.toLowerCase()] * n;
  return { w: taken("w"), b: taken("b"), lead };
}

/** A score for the side to move, as white's: what the evaluation bar and
 *  the game's curve draw. */
export function whiteScore(score: number, turn: "w" | "b"): number {
  return turn === "w" ? score : -score;
}

/** Height of white's part of the evaluation bar, 0–100: a pawn moves it
 *  about 9 points, a mate fills it. */
export function evalShare(white: number): number {
  if (white >= 9000) return 100;
  if (white <= -9000) return 0;
  return Math.round(50 + 50 * (2 / (1 + Math.exp(-white / 280)) - 1));
}

/** "+0,6", "−3,1", "M3": the number the bar prints (decimal comma). */
export function evalLabel(white: number, locale = "fr"): string {
  if (Math.abs(white) >= 9000) return `${white > 0 ? "" : "−"}M${10000 - Math.abs(white)}`;
  const v = (Math.abs(white) / 100).toFixed(1);
  const n = locale === "fr" || locale === "es" ? v.replace(".", ",") : v;
  return `${white > 0 ? "+" : white < 0 ? "−" : ""}${n}`;
}

export type HintKind = "mate" | "promote" | "capture" | "check" | "quiet";

/** What the coach's first hint says about the best move: a mate, a
 *  promotion, a capture, a check, or else which piece to look at. */
export function hintOf(
  fen: string,
  uci: string,
  score: number,
): {
  kind: HintKind;
  piece: string;
  from: string;
  to: string;
  mateIn: number;
} | null {
  let c: Chess;
  try {
    c = new Chess(fen);
  } catch {
    return null;
  }
  let m;
  try {
    m = c.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] ?? "q",
    });
  } catch {
    return null;
  }
  const mateIn = score >= 9000 ? 10000 - score : 0;
  const kind: HintKind = mateIn
    ? "mate"
    : m.promotion
      ? "promote"
      : m.captured
        ? "capture"
        : c.inCheck()
          ? "check"
          : "quiet";
  return { kind, piece: m.piece, from: m.from, to: m.to, mateIn };
}

/** The note a hint points to: the opening early on, tactics for a forcing
 *  move, the attack on the king for a mate, otherwise positional play. */
export function hintTopic(kind: HintKind, moveNumber: number): ChessTopic {
  if (kind === "mate") return "kingAttack";
  if (kind === "capture" || kind === "check" || kind === "promote") return "tactics";
  return moveNumber <= 10 ? "openings" : "strategy";
}

const FILES = "abcdefgh";

/**
 * A small board as one inline SVG, for a review card (the card's question is
 * stored HTML, lib/note-quiz.ts, and must stand on its own). `mark` tints
 * squares; `arrow` draws a move. Fixed light colours: a card is read in both
 * themes and a board has its own.
 */
export function boardSvg(
  fen: string,
  opts: { flip?: boolean; mark?: string[]; arrow?: [string, string] } = {},
): string {
  const placement = fen.split(" ")[0].split("/");
  const at = (sq: string) => {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]);
    return opts.flip ? [7 - f, r - 1] : [f, 8 - r];
  };
  const parts: string[] = [];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const sq = `${FILES[f]}${8 - r}`;
      const [x, y] = at(sq);
      const dark = (f + r) % 2 === 1;
      parts.push(`<rect x="${x * 45}" y="${y * 45}" width="45" height="45" fill="${dark ? "#b59a74" : "#eee6d3"}"/>`);
      if (opts.mark?.includes(sq))
        parts.push(`<rect x="${x * 45}" y="${y * 45}" width="45" height="45" fill="rgb(214 120 62 / .45)"/>`);
    }
  placement.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        f += Number(ch);
        continue;
      }
      const key = (ch === ch.toUpperCase() ? "w" : "b") + ch.toLowerCase();
      const [x, y] = at(`${FILES[f]}${8 - r}`);
      if (PIECE_SVG[key]) parts.push(`<g transform="translate(${x * 45} ${y * 45})">${PIECE_SVG[key]}</g>`);
      f++;
    }
  });
  if (opts.arrow) {
    const [x1, y1] = at(opts.arrow[0]).map((v) => v * 45 + 22.5);
    const [x2, y2] = at(opts.arrow[1]).map((v) => v * 45 + 22.5);
    const a = Math.atan2(y2 - y1, x2 - x1);
    const ex = x2 - Math.cos(a) * 14;
    const ey = y2 - Math.sin(a) * 14;
    const hx = (d: number) => (x2 + Math.cos(a + d) * -16).toFixed(1);
    const hy = (d: number) => (y2 + Math.sin(a + d) * -16).toFixed(1);
    parts.push(
      `<g fill="rgb(40 120 60 / .8)" stroke="rgb(40 120 60 / .8)"><line x1="${x1}" y1="${y1}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke-width="8" stroke-linecap="round"/>` +
        `<path stroke="none" d="M${x2} ${y2}L${hx(0.5)} ${hy(0.5)}L${hx(-0.5)} ${hy(-0.5)}Z"/></g>`,
    );
  }
  return `<svg class="chess-card-board" viewBox="0 0 360 360" width="240" height="240" role="img">${parts.join("")}</svg>`;
}

// ---------------------------------------------------------------------------
// The game in progress and the reader's settings, kept in this browser
// ---------------------------------------------------------------------------

export const GAME_KEY = "gkChessGame";
export const PREFS_KEY = "gkChessPrefs";

export interface SavedGame {
  level: string;
  color: "w" | "b";
  /** Position the game started from (a replay from a review starts mid-game). */
  start: string;
  sans: string[];
  /** No Elo change: a replay, a take-back, a hint used. */
  unrated: boolean;
}

export function parseSavedGame(raw: string | null): SavedGame | null {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<SavedGame>) : null;
    if (!o || typeof o !== "object") return null;
    if (!LEVELS.some((l) => l.id === o.level)) return null;
    if (o.color !== "w" && o.color !== "b") return null;
    if (typeof o.start !== "string" || !Array.isArray(o.sans)) return null;
    const c = new Chess(o.start);
    for (const m of o.sans) if (typeof m !== "string" || !c.move(m)) return null;
    if (c.isGameOver()) return null;
    return {
      level: o.level as string,
      color: o.color,
      start: o.start,
      sans: o.sans as string[],
      unrated: !!o.unrated,
    };
  } catch {
    return null;
  }
}

export interface ChessPrefs {
  /** The evaluation bar during the game. */
  eval: boolean;
  color: "w" | "b" | "random";
}

export function parsePrefs(raw: string | null): ChessPrefs {
  const base: ChessPrefs = { eval: true, color: "w" };
  try {
    const o = raw ? (JSON.parse(raw) as Partial<ChessPrefs>) : null;
    if (!o || typeof o !== "object") return base;
    return {
      eval: typeof o.eval === "boolean" ? o.eval : base.eval,
      color: o.color === "b" || o.color === "random" ? o.color : "w",
    };
  } catch {
    return base;
  }
}

/** Piece letters of the move notation in each language (chess.js writes
 *  English: K Q R B N). French: R D T F C; Spanish: R D T A C. The other
 *  locales keep the English letters, the ones their chess books use. */
const SAN_LETTERS: Record<string, Record<string, string>> = {
  fr: { K: "R", Q: "D", R: "T", B: "F", N: "C" },
  es: { K: "R", Q: "D", R: "T", B: "A", N: "C" },
};

export function sanFor(san: string, locale = "fr"): string {
  const map = SAN_LETTERS[locale];
  return map ? san.replace(/[KQRBN]/g, (c) => map[c]) : san;
}
