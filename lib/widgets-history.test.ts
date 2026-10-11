import { describe, expect, it } from "vitest";
// Plain JS from the data pack: the pure parts of the chess replay and the
// empire durations.
import { boardAt, parseDurees } from "../public/js/data/histoire.js";
import { isOwidView } from "./owid";

const OPERA =
  "e2e4 e7e5 g1f3 d7d6 d2d4 c8g4 d4e5 g4f3 d1f3 d6e5 f1c4 g8f6 f3b3 d8e7 b1c3 c7c6 c1g5 b7b5 c3b5 c6b5 c4b5 b8d7 e1c1 a8d8 d1d7 d8d7 h1d1 e7e6 b5d7 f6d7 b3b8 d7b8 d1d8".split(
    " ",
  );
const row = (b: string[][], r: number) => b[r].map((p) => p || ".").join("");

describe("boardAt", () => {
  it("starts from the initial position", () => {
    const b = boardAt(OPERA, 0);
    expect(row(b, 0)).toBe("rnbqkbnr");
    expect(row(b, 7)).toBe("RNBQKBNR");
  });
  it("castles queenside by moving the rook too", () => {
    const b = boardAt(OPERA, 23); // 12.O-O-O
    expect(row(b, 7).slice(0, 5)).toBe("..KR.");
  });
  it("ends the Opera game in mate on d8", () => {
    const b = boardAt(OPERA, OPERA.length);
    expect(b[0][3]).toBe("R");
    expect(b[0][4]).toBe("k");
    expect(b[0][1]).toBe("n");
  });
  it("takes en passant and promotes", () => {
    const ep = boardAt("e2e4 a7a6 e4e5 d7d5 e5d6".split(" "), 5);
    expect(ep[2][3]).toBe("P");
    expect(ep[3][3]).toBe("");
    const promo = boardAt(["a7a8q"], 1, "8/P7/8/8/8/8/8/k6K w - - 0 1");
    expect(promo[0][0]).toBe("Q");
  });
});

describe("parseDurees", () => {
  it("reads numbered rows in order, with BC years and a note", () => {
    const rows = parseDurees({
      ligne2: "Empire byzantin | 395 | 1453",
      ligne1: "Empire romain | -27 | 476 | d'Auguste à 476",
      ligne3: "à l'envers | 1500 | 1400",
      titre: "x",
    });
    expect(rows.map((r: { name: string }) => r.name)).toEqual(["Empire romain", "Empire byzantin"]);
    expect(rows[0]).toMatchObject({ from: -27, to: 476, note: "d'Auguste à 476" });
  });
});

describe("isOwidView", () => {
  it("lets key=value pairs through and nothing else", () => {
    expect(isOwidView("quantile=_10&welfare_type=before_tax")).toBe(true);
    expect(isOwidView("a=b&c")).toBe(false);
    expect(isOwidView("a=b/../x")).toBe(false);
    expect(isOwidView("a=b&c=d#")).toBe(false);
  });
});
