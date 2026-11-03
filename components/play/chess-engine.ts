import { parseBestMove, parseScore } from "@/lib/chess-play";

// Stockfish in a worker (the lite single-threaded build in public/engine/,
// nothing leaves the browser), one UCI conversation at a time: the bot's
// moves, the evaluation bar, the coach's hints and the review all share it,
// and each job sets its own options first so one never inherits another's
// strength limit.

const ENGINE_URL = "/engine/stockfish-17.1-lite-single-03e3232.js";

/** Full strength: what the bar, the hints and the review use. */
export const FULL_STRENGTH = { UCI_LimitStrength: "false", "Skill Level": 20 };

export interface EngineResult {
  best: string | null;
  /** Centipawns for the side to move (a mate is ±10000 less its distance). */
  score: number;
}

export class Engine {
  private w: Worker;
  private lines: ((l: string) => void)[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private options = "";
  constructor() {
    this.w = new Worker(ENGINE_URL);
    this.w.onmessage = (e: MessageEvent) => {
      const line = String(e.data);
      for (const f of this.lines.slice()) f(line);
    };
  }
  private until(test: (l: string) => boolean, onLine?: (l: string) => void): Promise<string> {
    return new Promise((resolve) => {
      const f = (l: string) => {
        onLine?.(l);
        if (test(l)) {
          this.lines = this.lines.filter((x) => x !== f);
          resolve(l);
        }
      };
      this.lines.push(f);
    });
  }
  private run<T>(job: () => Promise<T>): Promise<T> {
    const p = this.queue.then(job);
    this.queue = p.catch(() => undefined);
    return p;
  }
  init(): Promise<void> {
    return this.run(async () => {
      const ok = this.until((l) => l === "uciok");
      this.w.postMessage("uci");
      await ok;
    });
  }
  /** Search `fen` with these options (sent only when they change). */
  go(
    fen: string,
    search: { depth?: number; movetime?: number },
    options: Record<string, string | number> = FULL_STRENGTH,
  ): Promise<EngineResult> {
    return this.run(async () => {
      const key = JSON.stringify(options);
      if (key !== this.options) {
        for (const [k, v] of Object.entries(options)) this.w.postMessage(`setoption name ${k} value ${v}`);
        const ready = this.until((l) => l === "readyok");
        this.w.postMessage("isready");
        await ready;
        this.options = key;
      }
      let score = 0;
      const done = this.until(
        (l) => l.startsWith("bestmove"),
        (l) => {
          const s = parseScore(l);
          if (s !== null) score = s;
        },
      );
      this.w.postMessage(`position fen ${fen}`);
      this.w.postMessage(search.depth ? `go depth ${search.depth}` : `go movetime ${search.movetime ?? 500}`);
      const line = await done;
      return { best: parseBestMove(line), score };
    });
  }
  stop() {
    this.w.terminate();
  }
}
