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
