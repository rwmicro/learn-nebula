import { describe, it, expect } from "vitest";
import { levelFor, parseBestMove, parseElo, parseScore, topicOf, updateElo, verdict } from "./chess-play";

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
});
