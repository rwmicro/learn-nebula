// The sequencing of "Écouter": one passage after the other, each with the
// voice of its language, a passage nobody can read skipped, a voice that
// fails replaced once. Knows nothing of the DOM, SpeechSynthesis or Web
// Audio: public/js/audio.js gives it its engines, tests give it fake ones.
import type { VoiceEngine, VoiceOption } from "./read-aloud";

export type PlayerState = "idle" | "loading" | "playing" | "paused";

/** One passage being said. */
export interface SpeechHandle {
  pause(): void;
  resume(): void;
  stop(): void;
}

export interface SpeakCallbacks {
  /** Sound has started (after a download, a synthesis…). */
  onStart(): void;
  onEnd(): void;
  onError(): void;
  /** 0–100 while a voice downloads. */
  onProgress?(pct: number): void;
}

/** Says `text` in `lang` with `voice`. A null handle is a failure. */
export type SpeakFn = (
  text: string,
  lang: string,
  voice: VoiceOption,
  cb: SpeakCallbacks,
) => SpeechHandle | null | Promise<SpeechHandle | null>;

export interface PlayerPassage {
  lang: string;
  text: string;
}

export interface PlayerSnapshot {
  state: PlayerState;
  /** The passage being read, -1 when idle. */
  index: number;
  voice: VoiceOption | null;
  /** 0–100 while the voice of the current passage downloads, else null. */
  loading: number | null;
}

export interface PlayerOptions {
  passages: PlayerPassage[];
  /** The voice for a language now (the reader may change it while it
   *  plays); null skips the language. */
  voiceFor(lang: string): VoiceOption | null;
  /** Another voice for the language after `failed` could not read. */
  fallbackFor?(lang: string, failed: VoiceOption): VoiceOption | null;
  engines: Partial<Record<VoiceEngine, SpeakFn>>;
  onChange(snapshot: PlayerSnapshot): void;
}

export interface Player {
  snapshot(): PlayerSnapshot;
  /** idle → play from the start; playing → pause; paused → resume;
   *  loading → stop. The one button of the note. */
  toggle(): void;
  play(from?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  /** The next / previous passage that has a voice. */
  next(): void;
  prev(): void;
  /** The voice of a language changed: the current passage starts over with
   *  it when it is in that language. */
  voiceChanged(lang: string): void;
}

export function createPlayer(opts: PlayerOptions): Player {
  const { passages } = opts;
  let state: PlayerState = "idle";
  let index = -1;
  let voice: VoiceOption | null = null;
  let loading: number | null = null;
  let handle: SpeechHandle | null = null;
  // Every start gets a number: what an older one still calls back is ignored.
  let run = 0;
  // Paused while the voice was still loading: pause as soon as it speaks.
  let pauseWhenReady = false;

  const emit = () => opts.onChange({ state, index, voice, loading });
  const set = (s: PlayerState) => {
    state = s;
    emit();
  };
  const halt = () => {
    run++;
    const h = handle;
    handle = null;
    pauseWhenReady = false;
    try {
      h?.stop();
    } catch {
      /* an engine already gone */
    }
  };
  const reset = () => {
    halt();
    index = -1;
    voice = null;
    loading = null;
    set("idle");
  };
  const usable = (i: number) => {
    const v = opts.voiceFor(passages[i].lang);
    return v && opts.engines[v.engine] ? v : null;
  };

  function start(
    i: number,
    step: 1 | -1,
    forced?: VoiceOption | null,
    tried?: Set<string>,
  ): void {
    halt();
    let v: VoiceOption | null = null;
    while (i >= 0 && i < passages.length) {
      v = forced ?? usable(i);
      if (v) break;
      forced = undefined;
      i += step;
    }
    if (!v || i < 0 || i >= passages.length) {
      // Going back past the first readable passage stays on it.
      if (step === -1 && index >= 0 && usable(index)) return start(index, 1);
      return reset();
    }
    const me = ++run;
    const picked = v;
    const seen = tried ?? new Set<string>();
    seen.add(picked.id);
    index = i;
    voice = picked;
    loading = null;
    set("loading");
    const live = () => me === run;
    const fail = () => {
      if (!live()) return;
      const other = opts.fallbackFor?.(passages[i].lang, picked) ?? null;
      if (other && !seen.has(other.id) && opts.engines[other.engine])
        start(i, 1, other, seen);
      else start(i + 1, 1);
    };
    const cb: SpeakCallbacks = {
      onStart() {
        if (!live() || state !== "loading") return;
        loading = null;
        if (pauseWhenReady) {
          pauseWhenReady = false;
          handle?.pause();
          set("paused");
        } else set("playing");
      },
      onEnd() {
        if (live()) start(i + 1, 1);
      },
      onError: fail,
      onProgress(pct) {
        if (!live() || state !== "loading") return;
        loading = Math.max(0, Math.min(100, Math.round(pct)));
        emit();
      },
    };
    let res: ReturnType<SpeakFn>;
    try {
      res = opts.engines[picked.engine]!(
        passages[i].text,
        passages[i].lang,
        picked,
        cb,
      );
    } catch {
      return fail();
    }
    const got = (h: SpeechHandle | null) => {
      if (!live()) {
        // Stopped while the engine was getting ready.
        try {
          h?.stop();
        } catch {
          /* already gone */
        }
        return;
      }
      if (!h) return fail();
      handle = h;
      if (state === "paused") h.pause();
    };
    if (res && typeof (res as Promise<SpeechHandle | null>).then === "function")
      (res as Promise<SpeechHandle | null>).then(got, fail);
    else got(res as SpeechHandle | null);
  }

  const api: Player = {
    snapshot: () => ({ state, index, voice, loading }),
    toggle() {
      if (state === "idle") api.play();
      else if (state === "playing") api.pause();
      else if (state === "paused") api.resume();
      else api.stop();
    },
    play(from = 0) {
      start(Math.max(0, Math.min(from, passages.length)), 1);
    },
    pause() {
      if (state === "playing") {
        handle?.pause();
        set("paused");
      } else if (state === "loading") pauseWhenReady = true;
    },
    resume() {
      pauseWhenReady = false;
      if (state !== "paused") return;
      handle?.resume();
      set("playing");
    },
    stop: reset,
    next() {
      if (state !== "idle") start(index + 1, 1);
    },
    prev() {
      if (state !== "idle") start(index - 1, -1);
    },
    voiceChanged(lang) {
      if (state === "idle" || index < 0 || passages[index].lang !== lang)
        return;
      const wasPaused = state === "paused";
      start(index, 1);
      if (wasPaused && state === "loading") pauseWhenReady = true;
    },
  };
  return api;
}
