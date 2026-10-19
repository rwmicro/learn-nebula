import { describe, expect, it } from "vitest";
import {
  capacity,
  dataBits,
  encodeQr,
  formatBits,
  functionMap,
  interleave,
  qrPath,
  rawCodewords,
  rsRemainder,
  versionBits,
  type Ecc,
} from "./qr";

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Reads the codewords back out of a symbol (unmask + reverse zigzag). */
function readCodewords(qr: ReturnType<typeof encodeQr>): number[] {
  const fn = functionMap(qr.version);
  const s = qr.size;
  const bits: number[] = [];
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < s; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? s - 1 - v : v;
        if (fn[y][x]) continue;
        bits.push(+(qr.modules[y][x] !== MASKS[qr.mask](x, y)));
      }
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= rawCodewords(qr.version) * 8; i += 8)
    out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

describe("Reed–Solomon", () => {
  it("matches the ISO 18004 worked example (1-M, \"01234567\")", () => {
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(rsRemainder(data, 10)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });
});

describe("tables", () => {
  it("codeword totals per version", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rawCodewords)).toEqual([
      26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
    ]);
  });
  it("byte capacities match the standard's table", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => capacity(v, "M"))).toEqual([
      14, 26, 42, 62, 84, 106, 122, 152, 180, 213,
    ]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => capacity(v, "L"))).toEqual([
      17, 32, 53, 78, 106, 134, 154, 192, 230, 271,
    ]);
  });
  it("format and version information (spec annex values)", () => {
    expect(formatBits("M", 0).toString(2).padStart(15, "0")).toBe("101010000010010");
    expect(formatBits("L", 4).toString(2).padStart(15, "0")).toBe("110011000101111");
    expect(formatBits("M", 5).toString(2).padStart(15, "0")).toBe("100000011001110");
    expect(versionBits(7).toString(16)).toBe("7c94");
    expect(versionBits(10).toString(16)).toBe("a4d3");
  });
});

describe("encodeQr", () => {
  const cases: [string, Ecc][] = [
    ["https://4d52.net/duel/#vedvuqumnq46gl4agrlijn2w", "M"],
    ["a", "L"],
    ["é".repeat(100), "M"], // 200 bytes → version 10
    ["x".repeat(130), "L"], // version 6, two blocks
  ];
  it.each(cases)("round-trips its payload (%#)", (text, ecc) => {
    const qr = encodeQr(text, ecc);
    const bytes = new TextEncoder().encode(text);
    expect(qr.size).toBe(qr.version * 4 + 17);
    expect(capacity(qr.version, ecc)).toBeGreaterThanOrEqual(bytes.length);
    if (qr.version > 1) expect(capacity(qr.version - 1, ecc)).toBeLessThan(bytes.length);
    expect(readCodewords(qr)).toEqual(interleave(dataBits(bytes, qr.version, ecc), qr.version, ecc));
    // Payload bytes sit right after the mode + length header.
    const data = dataBits(bytes, qr.version, ecc);
    expect(data[0] >> 4).toBe(0b0100);
  });

  it("draws the finders and the dark module", () => {
    const qr = encodeQr("hello");
    const m = qr.modules;
    for (const [x, y] of [
      [0, 0],
      [qr.size - 7, 0],
      [0, qr.size - 7],
    ]) {
      expect(m[y][x] && m[y + 6][x + 6] && m[y + 3][x + 3]).toBe(true);
      expect(m[y + 1][x + 1]).toBe(false);
    }
    expect(m[qr.size - 8][8]).toBe(true);
    // Format copy around the top-left finder holds the chosen mask.
    const f = formatBits("M", qr.mask);
    expect(m[0][8]).toBe(((f >> 0) & 1) === 1);
    expect(m[8][0]).toBe(((f >> 14) & 1) === 1);
  });

  it("refuses what version 10 can't hold", () => {
    expect(() => encodeQr("x".repeat(214), "M")).toThrow(RangeError);
  });

  it("qrPath has one square per dark module", () => {
    const qr = encodeQr("hi");
    const dark = qr.modules.flat().filter(Boolean).length;
    expect(qrPath(qr).match(/M/g)?.length).toBe(dark);
  });
});
