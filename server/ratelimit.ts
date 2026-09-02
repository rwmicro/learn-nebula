// In-memory replacements for the Cloudflare Cache-API rate-limit and the
// per-IP in-flight dedupe the Pages Functions used. A single long-lived Node
// process holds real state, so this is actually *stronger* than the per-colo
// best-effort version — but it's per-instance (fine for a single container).

/** Per-key cooldown: returns true if the key was used within `seconds`. */
export class Cooldown {
  private hits = new Map<string, number>();
  private readonly seconds: number;
  constructor(seconds: number) {
    this.seconds = seconds;
    // Sweep expired entries occasionally so the map can't grow unbounded.
    const t = setInterval(() => this.sweep(), 60_000);
    if (typeof t.unref === "function") t.unref();
  }
  limited(key: string): boolean {
    const now = Date.now();
    const until = this.hits.get(key);
    if (until && until > now) return true;
    this.hits.set(key, now + this.seconds * 1000);
    return false;
  }
  private sweep() {
    const now = Date.now();
    for (const [k, until] of this.hits) if (until <= now) this.hits.delete(k);
  }
}

/** Per-key rolling quota: a hard cap of `max` requests within `windowMs`. This
 *  is the cost guard on top of the short Cooldown — a determined caller can't
 *  just wait out the cooldown to run up the LLM bill. In-memory and per-instance
 *  (per container) and keyed by IP, so it's best-effort, not a global ledger. */
export class Quota {
  private hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
    const t = setInterval(() => this.sweep(), windowMs);
    if (typeof t.unref === "function") t.unref();
  }
  /** True if the key is at/over its quota (reject); otherwise records the hit. */
  exceeded(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return true;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return false;
  }
  private sweep() {
    const now = Date.now();
    for (const [k, arr] of this.hits) {
      const kept = arr.filter((t) => now - t < this.windowMs);
      if (kept.length) this.hits.set(k, kept);
      else this.hits.delete(k);
    }
  }
}

/** Refuses a second concurrent request for the same key until the first frees it. */
export class InFlight {
  private set = new Set<string>();
  has(key: string): boolean {
    return this.set.has(key);
  }
  add(key: string): void {
    this.set.add(key);
  }
  delete(key: string): void {
    this.set.delete(key);
  }
}
