/**
 * Playing chess against Stockfish (/echecs/, components/play/ChessPlay.tsx): the
 * levels, the reader's own Elo, and the game review that links each mistake
 * to the vault note that teaches what was missed. Pure: the board rules come
 * from chess.js, the engine runs in a worker (public/engine/).
 */

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
  { id: "moyen", elo: 1400, options: { UCI_LimitStrength: "true", UCI_Elo: 1400 }, movetime: 400 },
  { id: "fort", elo: 1800, options: { UCI_LimitStrength: "true", UCI_Elo: 1800 }, movetime: 600 },
  { id: "expert", elo: 2300, options: { UCI_LimitStrength: "false", "Skill Level": 20 }, movetime: 800 },
];

export const ELO_KEY = "gkChessElo";
export const START_ELO = 800;

export interface EloRecord {
  elo: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

export function parseElo(raw: string | null): EloRecord {
  const base: EloRecord = { elo: START_ELO, games: 0, wins: 0, draws: 0, losses: 0 };
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
  return {
    elo: Math.max(100, Math.round(rec.elo + k * (score - expected))),
    games: rec.games + 1,
    wins: rec.wins + (score === 1 ? 1 : 0),
    draws: rec.draws + (score === 0.5 ? 1 : 0),
    losses: rec.losses + (score === 0 ? 1 : 0),
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
export function material(fen: string): { queens: number; rooks: number; minors: number; pawns: number } {
  const board = fen.split(" ")[0];
  const count = (re: RegExp) => (board.match(re) ?? []).length;
  return { queens: count(/[qQ]/g), rooks: count(/[rR]/g), minors: count(/[bBnN]/g), pawns: count(/[pP]/g) };
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
