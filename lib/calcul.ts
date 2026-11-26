// Pure models behind the "calcul" widget pack (public/js/calcul/*.js): the
// arithmetic of public-key cryptography (modular powers, RSA, elliptic curves,
// the birthday bound) and the arithmetic of large language models (mixture of
// experts routing, memory of weights, KV cache and fine-tuning). Everything a
// widget shows is computed here, so it can be tested (lib/calcul.test.ts).

// ------------------------------------------------------------ number theory

/** gcd(a, b) for non-negative integers. */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export type EuclidRow = { a: number; b: number; q: number; r: number; u: number; v: number };

/**
 * Extended Euclid, row by row, as taught: each row divides a by b, and the
 * Bézout coefficients (u, v) are filled back up so that a·u + b·v = gcd.
 */
export function euclidSteps(a: number, b: number): { rows: EuclidRow[]; g: number; u: number; v: number } {
  const rows: EuclidRow[] = [];
  let x = a;
  let y = b;
  while (y !== 0) {
    const q = Math.floor(x / y);
    rows.push({ a: x, b: y, q, r: x - q * y, u: 0, v: 0 });
    [x, y] = [y, x - q * y];
  }
  // Back-substitution: on the last row (r = 0) gcd = b, i.e. u=0, v=1.
  let u = 1;
  let v = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (i === rows.length - 1) {
      u = 0;
      v = 1;
    } else {
      const nu = v;
      const nv = u - row.q * v;
      u = nu;
      v = nv;
    }
    row.u = u;
    row.v = v;
  }
  if (!rows.length) return { rows, g: a, u: 1, v: 0 };
  return { rows, g: x, u: rows[0].u, v: rows[0].v };
}

/** Inverse of a modulo n, or null when gcd(a, n) ≠ 1. */
export function modInv(a: number, n: number): number | null {
  const { g, u } = euclidSteps(((a % n) + n) % n, n);
  if (g !== 1) return null;
  return ((u % n) + n) % n;
}

/** a^e mod n, exact for any size through BigInt. */
export function modPow(a: number | bigint, e: number | bigint, n: number | bigint): bigint {
  let base = BigInt(a);
  let exp = BigInt(e);
  const mod = BigInt(n);
  if (mod === 1n) return 0n;
  let r = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}

export type SqmStep = { bit: 0 | 1; squared: bigint; value: bigint };

/**
 * Square-and-multiply, left to right, one step per bit of the exponent:
 * square, then multiply by the base when the bit is 1. A 2048-bit exponent
 * takes about 2048 squarings, not 2^2048 multiplications.
 */
export function squareMultiply(a: number | bigint, e: number | bigint, n: number | bigint): SqmStep[] {
  const mod = BigInt(n);
  const base = ((BigInt(a) % mod) + mod) % mod;
  const bits = BigInt(e).toString(2);
  const steps: SqmStep[] = [];
  let r = 1n;
  for (const ch of bits) {
    const squared = (r * r) % mod;
    r = ch === "1" ? (squared * base) % mod : squared;
    steps.push({ bit: ch === "1" ? 1 : 0, squared, value: r });
  }
  return steps;
}

export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0) return false;
  for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
  return true;
}

/** Euler's totient by trial factorisation (small n only). */
export function phi(n: number): number {
  let r = n;
  let m = n;
  for (let p = 2; p * p <= m; p++) {
    if (m % p === 0) {
      while (m % p === 0) m /= p;
      r -= r / p;
    }
  }
  if (m > 1) r -= r / m;
  return r;
}

/** Successive powers g^1, g^2… mod n until they come back to 1 (or repeat). */
export function powers(g: number, n: number): number[] {
  const out: number[] = [];
  let x = 1;
  const seen = new Set<number>();
  for (let k = 1; k <= n; k++) {
    x = (x * g) % n;
    if (seen.has(x)) break;
    seen.add(x);
    out.push(x);
    if (x === 1) break;
  }
  return out;
}

/** Multiplicative order of g mod n, or 0 when g is not invertible mod n. */
export function order(g: number, n: number): number {
  if (gcd(g, n) !== 1) return 0;
  const p = powers(g, n);
  return p[p.length - 1] === 1 ? p.length : 0;
}

/** Smallest k ≥ 1 with g^k ≡ y (mod n), or -1. Brute force, small n. */
export function discreteLog(g: number, y: number, n: number): number {
  const p = powers(g, n);
  const i = p.indexOf(((y % n) + n) % n);
  return i < 0 ? -1 : i + 1;
}

/** Baby-step giant-step cost against brute force, in group operations. */
export function bsgsCost(groupOrder: number): { brute: number; bsgs: number } {
  return { brute: groupOrder, bsgs: 2 * Math.ceil(Math.sqrt(groupOrder)) };
}

// --------------------------------------------------------------------- RSA

export type RsaResult = {
  ok: boolean;
  errors: string[];
  n: number;
  phi: number;
  d: number;
  euclid: EuclidRow[];
  c: number;
  back: number;
  encrypt: SqmStep[];
  decrypt: SqmStep[];
};

/** Textbook RSA on small primes, with every reason it can refuse the keys. */
export function rsa(p: number, q: number, e: number, m: number): RsaResult {
  const errors: string[] = [];
  if (!isPrime(p)) errors.push(`p = ${p} n'est pas premier.`);
  if (!isPrime(q)) errors.push(`q = ${q} n'est pas premier.`);
  if (p === q) errors.push("p et q doivent être différents : sinon n = p² se factorise d'une racine carrée.");
  const n = p * q;
  const f = (p - 1) * (q - 1);
  if (!(e > 1 && e < f)) errors.push(`e doit être compris entre 2 et φ(n) − 1 = ${f - 1}.`);
  else if (gcd(e, f) !== 1) errors.push(`e = ${e} a un facteur commun avec φ(n) = ${f} (pgcd = ${gcd(e, f)}) : pas d'inverse, donc pas de clé privée.`);
  if (!(m >= 0 && m < n)) errors.push(`Le message doit être un nombre entre 0 et n − 1 = ${n - 1}.`);
  const eu = euclidSteps(f, e);
  const inv = modInv(e, f);
  const d = inv ?? 0;
  const ok = errors.length === 0 && inv != null;
  const c = ok ? Number(modPow(m, e, n)) : 0;
  const back = ok ? Number(modPow(c, d, n)) : 0;
  return {
    ok,
    errors,
    n,
    phi: f,
    d,
    euclid: eu.rows,
    c,
    back,
    encrypt: ok ? squareMultiply(m, e, n) : [],
    decrypt: ok ? squareMultiply(c, d, n) : [],
  };
}

// ---------------------------------------------------------- elliptic curves

export type Pt = { x: number; y: number } | null; // null = point at infinity O

const md = (a: number, p: number) => ((a % p) + p) % p;

/** 4a³ + 27b² ≢ 0 (mod p): the curve has no cusp or self-crossing. */
export function curveOk(a: number, b: number, p: number): boolean {
  return md(4 * a * a * a + 27 * b * b, p) !== 0;
}

/** Every affine point of y² = x³ + ax + b over F_p (O not included). */
export function curvePoints(a: number, b: number, p: number): { x: number; y: number }[] {
  const sq = new Map<number, number[]>();
  for (let y = 0; y < p; y++) {
    const s = (y * y) % p;
    (sq.get(s) ?? sq.set(s, []).get(s)!).push(y);
  }
  const out: { x: number; y: number }[] = [];
  for (let x = 0; x < p; x++) {
    const r = md(x * x * x + a * x + b, p);
    for (const y of sq.get(r) ?? []) out.push({ x, y });
  }
  return out;
}

export function onCurve(P: Pt, a: number, b: number, p: number): boolean {
  if (!P) return true;
  return md(P.y * P.y - (P.x * P.x * P.x + a * P.x + b), p) === 0;
}

/** P + Q on the curve over F_p, with the slope used (null for O or vertical). */
export function ecAdd(P: Pt, Q: Pt, a: number, p: number): { R: Pt; slope: number | null; kind: string } {
  if (!P) return { R: Q, slope: null, kind: "O + Q = Q" };
  if (!Q) return { R: P, slope: null, kind: "P + O = P" };
  if (P.x === Q.x && md(P.y + Q.y, p) === 0) return { R: null, slope: null, kind: "droite verticale : P + (−P) = O" };
  let l: number;
  let kind: string;
  if (P.x === Q.x && P.y === Q.y) {
    const inv = modInv(md(2 * P.y, p), p)!;
    l = md((3 * P.x * P.x + a) * inv, p);
    kind = "doublement (tangente)";
  } else {
    const inv = modInv(md(Q.x - P.x, p), p)!;
    l = md((Q.y - P.y) * inv, p);
    kind = "addition (sécante)";
  }
  const x = md(l * l - P.x - Q.x, p);
  const y = md(l * (P.x - x) - P.y, p);
  return { R: { x, y }, slope: l, kind };
}

/** Multiples P, 2P, 3P… kP, by repeated addition (what the figure draws). */
export function multiples(P: Pt, k: number, a: number, p: number): Pt[] {
  const out: Pt[] = [];
  let R: Pt = null;
  for (let i = 1; i <= k; i++) {
    R = ecAdd(R, P, a, p).R;
    out.push(R);
  }
  return out;
}

/** Order of P: smallest n ≥ 1 with nP = O. */
export function pointOrder(P: Pt, a: number, p: number): number {
  if (!P) return 1;
  let R: Pt = P;
  for (let n = 1; n <= 4 * p + 4; n++) {
    if (!R) return n;
    R = ecAdd(R, P, a, p).R;
  }
  return 0;
}

export type DaStep = { bit: 0 | 1; op: string; R: Pt };

/** Double-and-add for kP: the elliptic twin of square-and-multiply. */
export function doubleAndAdd(P: Pt, k: number, a: number, p: number): DaStep[] {
  const steps: DaStep[] = [];
  let R: Pt = null;
  for (const ch of k.toString(2)) {
    R = ecAdd(R, R, a, p).R;
    let op = "doubler";
    if (ch === "1") {
      R = ecAdd(R, P, a, p).R;
      op = "doubler puis ajouter P";
    }
    steps.push({ bit: ch === "1" ? 1 : 0, op, R });
  }
  return steps;
}

/** Real points of y² = x³ + ax + b: the upper branch y(x) where defined. */
export function realY(x: number, a: number, b: number): number | null {
  const r = x * x * x + a * x + b;
  return r < 0 ? null : Math.sqrt(r);
}

/** Chord-and-tangent sum over the reals, for the geometric picture. */
export function realAdd(
  P: { x: number; y: number },
  Q: { x: number; y: number },
  a: number,
): { R: { x: number; y: number }; third: { x: number; y: number }; slope: number } | null {
  let l: number;
  if (Math.abs(P.x - Q.x) < 1e-9) {
    if (Math.abs(P.y + Q.y) < 1e-9) return null;
    l = (3 * P.x * P.x + a) / (2 * P.y);
  } else l = (Q.y - P.y) / (Q.x - P.x);
  const x = l * l - P.x - Q.x;
  const yThird = P.y + l * (x - P.x);
  return { R: { x, y: -yThird }, third: { x, y: yThird }, slope: l };
}

// ---------------------------------------------------------- birthday bound

/** Probability that k random values among N collide (exact product for small k). */
export function collisionProb(k: number, N: number): number {
  if (k < 2) return 0;
  if (k > N) return 1;
  if (k < 5000 && N < 1e15) {
    let logNo = 0;
    for (let i = 1; i < k; i++) logNo += Math.log1p(-i / N);
    return 1 - Math.exp(logNo);
  }
  return -Math.expm1((-k * (k - 1)) / (2 * N));
}

/** Draws for a 50 % chance of collision: ≈ 1.1774 √N. */
export function halfChance(N: number): number {
  return Math.sqrt(2 * Math.LN2 * N);
}

// ------------------------------------------------------- mixture of experts

/** Small deterministic hash (FNV-1a) → [0, 1). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Router logits of one token for E experts: stable per word, with a skew
 *  that favours the first experts (what an untrained router tends to do). */
export function routerLogits(word: string, E: number, skew = 0): number[] {
  return Array.from({ length: E }, (_, e) => {
    const base = hash01(word.toLowerCase() + "#" + e) * 4;
    return base + skew * (1 - e / Math.max(1, E - 1));
  });
}

export function softmax(xs: number[]): number[] {
  const m = Math.max(...xs);
  const ex = xs.map((x) => Math.exp(x - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / s);
}

/** Top-k experts by score (+ bias for the choice only), weights renormalised
 *  over the chosen ones from the unbiased scores, as in DeepSeek-V3. */
export function topK(scores: number[], k: number, bias?: number[]): { idx: number[]; w: number[] } {
  const order = scores.map((s, i) => [s + (bias?.[i] ?? 0), i]).sort((x, y) => y[0] - x[0]);
  const idx = order.slice(0, k).map((o) => o[1]);
  const tot = idx.reduce((a, i) => a + scores[i], 0) || 1;
  return { idx, w: idx.map((i) => scores[i] / tot) };
}

/** Tokens sent to each expert for a batch, and the imbalance max/mean. */
export function loads(batch: number[][], k: number, bias?: number[]): { load: number[]; imbalance: number } {
  const E = batch[0]?.length ?? 0;
  const load = new Array(E).fill(0);
  for (const s of batch) for (const i of topK(s, k, bias).idx) load[i]++;
  const mean = (batch.length * k) / Math.max(1, E);
  return { load, imbalance: mean ? Math.max(...load) / mean : 0 };
}

/**
 * Auxiliary-loss-free balancing (DeepSeek-V3): after each batch, raise the
 * bias of under-loaded experts and lower the over-loaded ones by γ. The bias
 * changes who is picked, never the weights of the mix.
 */
export function balance(batch: number[][], k: number, steps: number, gamma = 0.25): { bias: number[]; history: number[] } {
  const E = batch[0]?.length ?? 0;
  const bias = new Array(E).fill(0);
  const history: number[] = [loads(batch, k, bias).imbalance];
  let best = { imb: history[0], bias: bias.slice() };
  const mean = (batch.length * k) / Math.max(1, E);
  for (let t = 0; t < steps; t++) {
    // Step in the scores' own unit (≈ 1/E for a softmax), shrinking over
    // time so the loads settle instead of see-sawing.
    const step = (gamma / E) * (1 - t / (steps + 1));
    const { load } = loads(batch, k, bias);
    for (let e = 0; e < E; e++) bias[e] += load[e] < mean ? step : load[e] > mean ? -step : 0;
    const imb = loads(batch, k, bias).imbalance;
    history.push(imb);
    if (imb < best.imb) best = { imb, bias: bias.slice() };
  }
  return { bias: best.bias, history };
}

/** Parameters of a MoE stack, in billions: total stored and active per token. */
export function moeParams(opts: { layers: number; experts: number; k: number; shared: number; expertM: number; otherB: number }): {
  totalB: number;
  activeB: number;
  ratio: number;
} {
  const per = opts.expertM / 1000;
  const totalB = opts.otherB + opts.layers * (opts.experts + opts.shared) * per;
  const activeB = opts.otherB + opts.layers * (opts.k + opts.shared) * per;
  return { totalB, activeB, ratio: activeB / totalB };
}

// ----------------------------------------------------------- LLM memory

export type Attn = "MHA" | "GQA" | "MLA";

export type ModelSpec = {
  name: string;
  paramsB: number;
  layers: number;
  attn: Attn;
  heads: number;
  kvHeads: number;
  headDim: number;
  /** MLA: compressed latent + decoupled RoPE key, per layer and token. */
  latent?: number;
};

/** Published configurations (model cards / papers). */
export const MODELS: ModelSpec[] = [
  { name: "Llama 2 7B", paramsB: 6.7, layers: 32, attn: "MHA", heads: 32, kvHeads: 32, headDim: 128 },
  { name: "Llama 3.1 8B", paramsB: 8.0, layers: 32, attn: "GQA", heads: 32, kvHeads: 8, headDim: 128 },
  { name: "Llama 3.1 70B", paramsB: 70.6, layers: 80, attn: "GQA", heads: 64, kvHeads: 8, headDim: 128 },
  { name: "DeepSeek-V3 (671B, MoE)", paramsB: 671, layers: 61, attn: "MLA", heads: 128, kvHeads: 128, headDim: 128, latent: 512 + 64 },
];

/** Bytes of KV cache per token. */
export function kvBytesPerToken(m: ModelSpec, bytes = 2): number {
  if (m.attn === "MLA") return m.layers * (m.latent ?? 0) * bytes;
  return 2 * m.layers * m.kvHeads * m.headDim * bytes;
}

/** What MHA would cost for the same model (every head keeps its K and V). */
export function kvBytesIfMha(m: ModelSpec, bytes = 2): number {
  return 2 * m.layers * m.heads * m.headDim * bytes;
}

export type Method = "inference" | "full" | "lora" | "qlora";

/**
 * Rough GPU memory, in GB (10^9 bytes), activations left out:
 *  - inference: weights at `bits` + KV cache for `ctx` tokens × `batch`
 *  - full fine-tuning, mixed precision with Adam: 16 bytes per parameter
 *    (bf16 weights 2 + bf16 gradients 2 + fp32 master copy 4 + Adam m 4 + v 4)
 *  - LoRA: frozen bf16 weights (2 bytes/param) + adapters trained with Adam
 *  - QLoRA: frozen 4-bit weights (~0.55 byte/param with the scales) + adapters
 */
export function memoryGB(m: ModelSpec, method: Method, opts: { bits?: number; ctx?: number; batch?: number; loraPct?: number } = {}): {
  weights: number;
  kv: number;
  training: number;
  total: number;
} {
  const P = m.paramsB * 1e9;
  const ctx = opts.ctx ?? 8192;
  const batch = opts.batch ?? 1;
  const loraP = P * ((opts.loraPct ?? 0.5) / 100);
  let weights = 0;
  let training = 0;
  if (method === "inference") weights = (P * (opts.bits ?? 16)) / 8;
  else if (method === "full") {
    weights = P * 2;
    training = P * 14;
  } else if (method === "lora") {
    weights = P * 2;
    training = loraP * 16;
  } else {
    weights = P * 0.55;
    training = loraP * 16;
  }
  const kv = method === "inference" ? kvBytesPerToken(m) * ctx * batch : 0;
  const g = (x: number) => x / 1e9;
  return { weights: g(weights), kv: g(kv), training: g(training), total: g(weights + kv + training) };
}
