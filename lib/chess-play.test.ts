import { describe, it, expect } from "vitest";
import {
  HIST_MAX,
  boardSvg,
  captured,
  evalLabel,
  evalShare,
  hintOf,
  hintTopic,
  levelFor,
  openingOf,
  parseBestMove,
  parseElo,
  parsePrefs,
  parseSavedGame,
  parseScore,
  sanFor,
  topicOf,
  updateElo,
  verdict,
} from "./chess-play";

describe("chess play", () => {
  it("updates the Elo both ways", () => {
    const r = parseElo(null);
    expect(r.elo).toBe(800);
    const won = updateElo(r, 800, 1);
    expect(won.elo).toBe(820);
    expect(won.wins).toBe(1);
    expect(updateElo(r, 1400, 0).elo).toBeGreaterThan(790);
    expect(parseElo('{"elo":"x"}').elo).toBe(800);
  });
  it("picks the nearest level", () => {
    expect(levelFor(820).id).toBe("facile");
    expect(levelFor(2000).id).toBe("fort");
  });
  it("reads engine lines", () => {
    expect(parseScore("info depth 10 score cp -35 nodes 1")).toBe(-35);
    expect(parseScore("info depth 10 score mate 3 pv e2e4")).toBe(9997);
    expect(parseScore("info depth 10 score mate -2")).toBe(-9998);
    expect(parseScore("info string x")).toBeNull();
    expect(parseBestMove("bestmove e7e8q ponder a1a2")).toBe("e7e8q");
    expect(parseBestMove("bestmove (none)")).toBeNull();
  });
  it("grades a move by what it lost", () => {
    expect(verdict(50, 30).verdict).toBe("good");
    expect(verdict(50, -100).verdict).toBe("mistake");
    expect(verdict(200, -400).verdict).toBe("blunder");
    expect(verdict(5000, 3000).verdict).toBe("good");
  });
  it("sends a mistake to the right note", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(topicOf(start, 4, 0, -200)).toBe("openings");
    expect(topicOf("8/5k2/8/3p4/3P4/8/5K2/8 w - - 0 40", 40, 0, -300)).toBe("pawnEndgames");
    expect(topicOf("8/5k2/8/3r4/3P4/8/5K2/4R3 w - - 0 40", 40, 0, -300)).toBe("rookEndgames");
    expect(topicOf(start, 20, 100, -9990)).toBe("kingAttack");
    expect(topicOf(start, 20, 100, -300)).toBe("tactics");
    expect(topicOf(start, 20, 100, -40)).toBe("strategy");
  });
  it("keeps the rating's line", () => {
    let r = parseElo(null);
    expect(r.hist).toEqual([]);
    r = updateElo(r, 800, 1);
    expect(r.hist).toEqual([800, 820]);
    for (let i = 0; i < 40; i++) r = updateElo(r, 800, 0.5);
    expect(r.hist.length).toBe(HIST_MAX);
    expect(parseElo(JSON.stringify({ elo: 900, hist: [850, "x", 5000] })).hist).toEqual([850, 3200]);
  });
  it("names the opening by its longest known prefix", () => {
    expect(openingOf([])).toBeNull();
    expect(openingOf(["e4", "e5", "Nf3", "Nc6", "Bc4"])).toBe("Partie italienne");
    expect(openingOf(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3"])).toBe("Giuoco piano");
    expect(openingOf(["e4", "c5", "Nf3"], "en")).toBe("Sicilian Defense");
    expect(openingOf(["a3"])).toBeNull();
  });
  it("counts what each side took", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(captured(start)).toEqual({ w: [], b: [], lead: 0 });
    // White took a knight, black a pawn.
    const c = captured("r1bqkbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNR w KQkq - 0 5");
    expect(c.w).toEqual(["n"]);
    expect(c.b).toEqual(["p"]);
    expect(c.lead).toBe(2);
  });
  it("draws the evaluation", () => {
    expect(evalShare(0)).toBe(50);
    expect(evalShare(9990)).toBe(100);
    expect(evalShare(-9990)).toBe(0);
    expect(evalShare(300)).toBeGreaterThan(70);
    expect(evalLabel(64)).toBe("+0,6");
    expect(evalLabel(-310, "en")).toBe("−3.1");
    expect(evalLabel(9997)).toBe("M3");
    expect(evalLabel(0)).toBe("0,0");
  });
  it("says what kind of move the hint is", () => {
    // Scholar's mate: Qxf7#.
    const fen = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
    expect(hintOf(fen, "h5f7", 9999)).toMatchObject({ kind: "mate", piece: "q", from: "h5", to: "f7", mateIn: 1 });
    expect(hintOf(fen, "h5f7", 500)?.kind).toBe("capture");
    expect(hintOf(fen, "g1f3", 20)?.kind).toBe("quiet");
    expect(hintOf(fen, "a1a8", 0)).toBeNull();
    expect(hintTopic("mate", 30)).toBe("kingAttack");
    expect(hintTopic("capture", 3)).toBe("tactics");
    expect(hintTopic("quiet", 5)).toBe("openings");
    expect(hintTopic("quiet", 25)).toBe("strategy");
  });
  it("writes the moves in the reader's language", () => {
    expect(sanFor("Nxe5+", "fr")).toBe("Cxe5+");
    expect(sanFor("Bb5", "es")).toBe("Ab5");
    expect(sanFor("e8=Q#", "fr")).toBe("e8=D#");
    expect(sanFor("O-O", "fr")).toBe("O-O");
    expect(sanFor("Qd1", "zh")).toBe("Qd1");
  });
  it("only resumes a game that still makes sense", () => {
    const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const ok = { level: "facile", color: "w", start, sans: ["e4", "e5"], unrated: false };
    expect(parseSavedGame(JSON.stringify(ok))?.sans).toEqual(["e4", "e5"]);
    expect(parseSavedGame(JSON.stringify({ ...ok, sans: ["e4", "e4"] }))).toBeNull();
    expect(parseSavedGame(JSON.stringify({ ...ok, level: "x" }))).toBeNull();
    // Fool's mate: over, nothing to resume.
    expect(parseSavedGame(JSON.stringify({ ...ok, sans: ["f3", "e5", "g4", "Qh4#"] }))).toBeNull();
    expect(parseSavedGame("{")).toBeNull();
    expect(parsePrefs(null)).toEqual({ eval: true, color: "w" });
    expect(parsePrefs('{"eval":false,"color":"random"}')).toEqual({ eval: false, color: "random" });
  });
  it("draws a card's board as one SVG", () => {
    const svg = boardSvg("8/8/8/8/8/8/8/4K3 w - - 0 1", { arrow: ["e1", "e2"], mark: ["e1"] });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/<rect /g)?.length).toBe(65);
    expect(svg).toContain("translate(180 315)");
    expect(svg).toContain("<line");
  });
});
