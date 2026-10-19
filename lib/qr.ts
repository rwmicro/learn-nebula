/**
 * A small QR Code encoder (ISO/IEC 18004) — byte mode, error correction L or
 * M, versions 1 to 10 (up to 213 bytes at M): enough for a /duel/ invitation
 * link, without a dependency. Pure; components/Duel.tsx draws the matrix as
 * one SVG path (qrPath).
 *
 * Follows the structure of Project Nayuki's reference encoder: data bits →
 * Reed–Solomon blocks, interleaved → function patterns + zigzag placement →
 * the lowest-penalty of the eight masks, with its format (and, from version
 * 7, version) information.
 */

export type Ecc = "L" | "M";

export interface QrCode {
  version: number;
  size: number;
  ecc: Ecc;
  mask: number;
  /** modules[y][x], true = dark. */
  modules: boolean[][];
}

const MAX_VERSION = 10;
/** Format-info bits of each level. */
const ECC_BITS: Record<Ecc, number> = { L: 1, M: 0 };
/** Per version 1..10: EC codewords per block, and the number of blocks. */
const EC_PER_BLOCK: Record<Ecc, number[]> = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
};
const BLOCKS: Record<Ecc, number[]> = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
};
/** Alignment pattern centres, versions 2..10. */
const ALIGN: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Codewords (data + EC) a version holds, once its function patterns are out. */
export function rawCodewords(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const a = Math.floor(ver / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (ver >= 7) n -= 36;
  }
  return Math.floor(n / 8);
}

export const dataCodewords = (ver: number, ecc: Ecc) =>
  rawCodewords(ver) - EC_PER_BLOCK[ecc][ver - 1] * BLOCKS[ecc][ver - 1];

/** Byte-mode payload capacity in bytes (mode + count header taken out). */
export function capacity(ver: number, ecc: Ecc): number {
  return Math.floor((dataCodewords(ver, ecc) * 8 - 4 - (ver < 10 ? 8 : 16)) / 8);
}

// --- Reed–Solomon over GF(256), polynomial 0x11D -----------------------------

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const r = Array.from({ length: degree }, () => 0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}

/** The `degree` EC codewords of `data`. */
export function rsRemainder(data: number[], degree: number): number[] {
  const div = rsDivisor(degree);
  const r = Array.from({ length: degree }, () => 0);
  for (const b of data) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => (r[i] ^= gfMul(c, f)));
  }
  return r;
}

// --- Data and blocks ----------------------------------------------------------

/** Data codewords: byte mode header, payload, terminator, padding. */
export function dataBits(bytes: Uint8Array, ver: number, ecc: Ecc): number[] {
  const bits: number[] = [];
  const put = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, ver < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver, ecc) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  return out;
}

/** Splits into blocks, adds each one's EC, interleaves. */
export function interleave(data: number[], ver: number, ecc: Ecc): number[] {
  const nBlocks = BLOCKS[ecc][ver - 1];
  const ecLen = EC_PER_BLOCK[ecc][ver - 1];
  const raw = rawCodewords(ver);
  const nShort = nBlocks - (raw % nBlocks);
  const shortData = Math.floor(raw / nBlocks) - ecLen;
  const blocks: { d: number[]; e: number[] }[] = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const len = shortData + (i < nShort ? 0 : 1);
    const d = data.slice(k, k + len);
    k += len;
    blocks.push({ d, e: rsRemainder(d, ecLen) });
  }
  const out: number[] = [];
  for (let i = 0; i <= shortData; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

// --- Matrix ---------------------------------------------------------------------

export function formatBits(ecc: Ecc, mask: number): number {
  const data = (ECC_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

export function versionBits(ver: number): number {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

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

class Matrix {
  readonly m: boolean[][];
  readonly fn: boolean[][];
  constructor(readonly size: number) {
    this.m = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
    this.fn = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  }
  set(x: number, y: number, dark: boolean) {
    this.m[y][x] = dark;
    this.fn[y][x] = true;
  }
}

/** Finder, separators, timing, alignment, dark module, reserved format and
 *  version areas (filled with the real bits later). */
function functionPatterns(ver: number): Matrix {
  const size = ver * 4 + 17;
  const mx = new Matrix(size);
  for (let i = 0; i < size; i++) {
    mx.set(6, i, i % 2 === 0);
    mx.set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        mx.set(x, y, d !== 2 && d !== 4);
      }
  }
  const al = ALIGN[ver - 1];
  for (let i = 0; i < al.length; i++)
    for (let j = 0; j < al.length; j++) {
      // Not over the three finders.
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) mx.set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  drawFormat(mx, 0); // reserve
  drawVersion(mx, ver);
  return mx;
}

function drawFormat(mx: Matrix, bits: number) {
  const s = mx.size;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) mx.set(8, i, bit(i));
  mx.set(8, 7, bit(6));
  mx.set(8, 8, bit(7));
  mx.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) mx.set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) mx.set(s - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) mx.set(8, s - 15 + i, bit(i));
  mx.set(8, s - 8, true); // the dark module
}

function drawVersion(mx: Matrix, ver: number) {
  if (ver < 7) return;
  const bits = versionBits(ver);
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = mx.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    mx.set(a, b, dark);
    mx.set(b, a, dark);
  }
}

/** Zigzag placement of the codewords, two columns at a time, bottom-right up. */
function placeCodewords(mx: Matrix, cw: number[]) {
  const s = mx.size;
  let i = 0;
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < s; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? s - 1 - v : v;
        if (mx.fn[y][x] || i >= cw.length * 8) continue;
        mx.m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
  }
}

function applyMask(mx: Matrix, mask: number) {
  const f = MASKS[mask];
  for (let y = 0; y < mx.size; y++)
    for (let x = 0; x < mx.size; x++) if (!mx.fn[y][x] && f(x, y)) mx.m[y][x] = !mx.m[y][x];
}

/** The standard mask penalty (runs, 2×2 blocks, finder-like patterns, balance). */
export function penalty(m: boolean[][]): number {
  const s = m.length;
  let p = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= s; i++) {
      if (i < s && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) p += 3 + (run - 5);
        run = 1;
      }
    }
    const pat = [true, false, true, true, true, false, true];
    for (let i = 0; i + 7 <= s; i++) {
      if (!pat.every((d, k) => get(i + k) === d)) continue;
      const lightBefore = [1, 2, 3, 4].every((k) => i - k < 0 || !get(i - k));
      const lightAfter = [0, 1, 2, 3].every((k) => i + 7 + k >= s || !get(i + 7 + k));
      if (lightBefore || lightAfter) p += 40;
    }
  };
  for (let y = 0; y < s; y++) line((x) => m[y][x]);
  for (let x = 0; x < s; x++) line((y) => m[y][x]);
  let dark = 0;
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      if (m[y][x]) dark++;
      if (x + 1 < s && y + 1 < s && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
  const total = s * s;
  p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return p;
}

/** Encodes text (UTF-8) at the smallest version that fits, at `ecc`. Throws
 *  past version 10. */
export function encodeQr(text: string, ecc: Ecc = "M"): QrCode {
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  while (ver <= MAX_VERSION && capacity(ver, ecc) < bytes.length) ver++;
  if (ver > MAX_VERSION) throw new RangeError("qr: text too long");
  const cw = interleave(dataBits(bytes, ver, ecc), ver, ecc);
  let best: { mask: number; m: boolean[][]; p: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const mx = functionPatterns(ver);
    placeCodewords(mx, cw);
    applyMask(mx, mask);
    drawFormat(mx, formatBits(ecc, mask));
    const p = penalty(mx.m);
    if (!best || p < best.p) best = { mask, m: mx.m, p };
  }
  const b = best as { mask: number; m: boolean[][] };
  return { version: ver, size: ver * 4 + 17, ecc, mask: b.mask, modules: b.m };
}

/** Function-module map of a version (for tests: what the zigzag skips). */
export const functionMap = (ver: number) => functionPatterns(ver).fn;

/** The dark modules as one SVG path, in module units, offset by `border`
 *  (draw it in a viewBox of size + 2·border). */
export function qrPath(qr: QrCode, border = 4): string {
  let d = "";
  for (let y = 0; y < qr.size; y++)
    for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) d += `M${x + border} ${y + border}h1v1h-1z`;
  return d;
}
