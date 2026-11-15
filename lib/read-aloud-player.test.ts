import { describe, expect, it } from "vitest";
import {
  createPlayer,
  type PlayerSnapshot,
  type SpeakCallbacks,
  type SpeakFn,
} from "./read-aloud-player";
import type { VoiceOption } from "./read-aloud";

const sys = (name: string): VoiceOption => ({
  id: `system:${name}`,
  engine: "system",
  name,
});
const PIPER: VoiceOption = { id: "piper", engine: "piper", name: "MLS" };

/** An engine driven by hand: every call is kept, with its callbacks. */
function fakeEngine(
  opts: { async?: boolean; refuse?: (text: string) => boolean } = {},
) {
  const calls: {
    text: string;
    lang: string;
    voice: VoiceOption;
    cb: SpeakCallbacks;
    log: string[];
  }[] = [];
  const speak: SpeakFn = (text, lang, voice, cb) => {
    const log: string[] = [];
    calls.push({ text, lang, voice, cb, log });
    const handle = opts.refuse?.(text)
      ? null
      : {
          pause: () => log.push("pause"),
          resume: () => log.push("resume"),
          stop: () => log.push("stop"),
        };
    return opts.async ? Promise.resolve(handle) : handle;
  };
  return { speak, calls, last: () => calls[calls.length - 1] };
}

function setup(
  langs: string[],
  voices: Record<string, VoiceOption | null> = {},
  extra: Partial<Parameters<typeof createPlayer>[0]> = {},
  engine = fakeEngine(),
) {
  const seen: PlayerSnapshot[] = [];
  const passages = langs.map((lang, i) => ({ lang, text: `${lang}${i}` }));
  const player = createPlayer({
    passages,
    voiceFor: (lang) => (lang in voices ? voices[lang] : sys(lang)),
    engines: { system: engine.speak, piper: engine.speak },
    onChange: (s) => seen.push(s),
    ...extra,
  });
  return {
    player,
    engine,
    seen,
    states: () => seen.map((s) => `${s.state}${s.index}`),
  };
}

describe("reading in order", () => {
  it("goes loading → playing, one passage after the other, then idle", () => {
    const { player, engine, states } = setup(["fr", "zh", "fr"]);
    player.toggle();
    expect(engine.last().text).toBe("fr0");
    engine.last().cb.onStart();
    engine.last().cb.onEnd();
    expect(engine.last().text).toBe("zh1");
    expect(engine.last().voice.name).toBe("zh");
    engine.last().cb.onStart();
    engine.last().cb.onEnd();
    engine.last().cb.onStart();
    engine.last().cb.onEnd();
    expect(states()).toEqual([
      "loading0",
      "playing0",
      "loading1",
      "playing1",
      "loading2",
      "playing2",
      "idle-1",
    ]);
    expect(engine.calls).toHaveLength(3);
  });
  it("does nothing surprising with nothing to read", () => {
    const { player, engine, states } = setup([]);
    player.toggle();
    expect(engine.calls).toHaveLength(0);
    expect(states()).toEqual(["idle-1"]);
    player.next();
    player.prev();
    player.pause();
    player.resume();
    expect(player.snapshot().state).toBe("idle");
  });
  it("skips the passages nobody can read", () => {
    const { player, engine } = setup(["nan", "fr", "nan", "zh", "nan"], {
      nan: null,
    });
    player.play();
    expect(engine.last().text).toBe("fr1");
    engine.last().cb.onEnd();
    expect(engine.last().text).toBe("zh3");
    engine.last().cb.onEnd();
    expect(player.snapshot()).toMatchObject({ state: "idle", index: -1 });
    expect(engine.calls).toHaveLength(2);
  });
  it("stays idle when no passage has a voice", () => {
    const { player, engine, states } = setup(["nan", "hak"], {
      nan: null,
      hak: null,
    });
    player.toggle();
    expect(engine.calls).toHaveLength(0);
    expect(states()).toEqual(["idle-1"]);
  });
  it("skips a language whose engine is missing here", () => {
    const engine = fakeEngine();
    const { player } = setup(
      ["fr", "zh"],
      { fr: PIPER },
      { engines: { system: engine.speak } },
      engine,
    );
    player.play();
    expect(engine.last().text).toBe("zh1");
  });
});

describe("pause, resume, stop", () => {
  it("pauses and resumes the passage being said", () => {
    const { player, engine, states } = setup(["fr"]);
    player.toggle();
    engine.last().cb.onStart();
    player.toggle();
    player.toggle();
    expect(engine.last().log).toEqual(["pause", "resume"]);
    expect(states().slice(-2)).toEqual(["paused0", "playing0"]);
  });
  it("a click while the voice loads stops everything", () => {
    const { player, engine } = setup(["fr", "zh"]);
    player.toggle();
    player.toggle();
    expect(engine.last().log).toEqual(["stop"]);
    expect(player.snapshot().state).toBe("idle");
    // What the engine still says afterwards is ignored.
    engine.last().cb.onStart();
    engine.last().cb.onEnd();
    engine.last().cb.onError();
    expect(player.snapshot().state).toBe("idle");
    expect(engine.calls).toHaveLength(1);
  });
  it("a pause asked while loading holds as soon as the voice is ready", () => {
    const { player, engine } = setup(["fr"]);
    player.play();
    player.pause();
    expect(player.snapshot().state).toBe("loading");
    engine.last().cb.onStart();
    expect(player.snapshot().state).toBe("paused");
    expect(engine.last().log).toEqual(["pause"]);
    player.resume();
    expect(player.snapshot().state).toBe("playing");
  });
  it("stops the engine that was still getting ready", async () => {
    const engine = fakeEngine({ async: true });
    const { player } = setup(["fr"], {}, {}, engine);
    player.play();
    player.stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.last().log).toEqual(["stop"]);
    expect(player.snapshot().state).toBe("idle");
  });
  it("stop is safe at any time, even twice", () => {
    const { player } = setup(["fr"]);
    player.stop();
    player.play();
    player.stop();
    player.stop();
    expect(player.snapshot()).toEqual({
      state: "idle",
      index: -1,
      voice: null,
      loading: null,
    });
  });
  it("an engine that throws on stop does not break the player", () => {
    const speak: SpeakFn = (_t, _l, _v, cb) => {
      queueMicrotask(() => cb.onStart());
      return {
        pause() {},
        resume() {},
        stop() {
          throw new Error("gone");
        },
      };
    };
    const { player } = setup(["fr"], {}, { engines: { system: speak } });
    player.play();
    expect(() => player.stop()).not.toThrow();
  });
});

describe("moving around", () => {
  it("goes to the next and the previous readable passage", () => {
    const { player, engine } = setup(["fr", "nan", "zh", "fr"], { nan: null });
    player.play();
    player.next();
    expect(engine.last().text).toBe("zh2");
    expect(engine.calls[0].log).toEqual(["stop"]);
    player.prev();
    expect(engine.last().text).toBe("fr0");
    player.prev();
    expect(engine.last().text).toBe("fr0");
    expect(player.snapshot().index).toBe(0);
  });
  it("next past the end ends the reading", () => {
    const { player } = setup(["fr"]);
    player.play();
    player.next();
    expect(player.snapshot().state).toBe("idle");
  });
  it("play(from) starts where asked, and clamps", () => {
    const { player, engine } = setup(["fr", "zh", "fr"]);
    player.play(2);
    expect(engine.last().text).toBe("fr2");
    player.play(-5);
    expect(engine.last().text).toBe("fr0");
    player.play(99);
    expect(player.snapshot().state).toBe("idle");
  });
  it("ignores what an abandoned passage still reports", () => {
    const { player, engine } = setup(["fr", "zh", "fr"]);
    player.play();
    const first = engine.last();
    player.next();
    first.cb.onEnd();
    first.cb.onError();
    expect(player.snapshot().index).toBe(1);
    expect(engine.calls).toHaveLength(2);
  });
});

describe("failures", () => {
  it("replaces a voice that fails, once, then moves on", () => {
    const { player, engine } = setup(
      ["fr", "zh"],
      { fr: PIPER },
      { fallbackFor: () => sys("Thomas") },
    );
    player.play();
    expect(engine.last().voice).toBe(PIPER);
    engine.last().cb.onError();
    expect(engine.last().text).toBe("fr0");
    expect(engine.last().voice.name).toBe("Thomas");
    engine.last().cb.onError();
    expect(engine.last().text).toBe("zh1");
  });
  it("never loops on a fallback that is the voice that failed", () => {
    const { player, engine } = setup(
      ["fr"],
      { fr: PIPER },
      { fallbackFor: () => PIPER },
    );
    player.play();
    engine.last().cb.onError();
    expect(engine.calls).toHaveLength(1);
    expect(player.snapshot().state).toBe("idle");
  });
  it("treats a refused handle as a failure, sync or async", async () => {
    for (const async of [false, true]) {
      const engine = fakeEngine({ async, refuse: (t) => t === "fr0" });
      const { player } = setup(["fr", "zh"], {}, {}, engine);
      player.play();
      await Promise.resolve();
      await Promise.resolve();
      expect(engine.last().text).toBe("zh1");
    }
  });
  it("survives an engine that throws", () => {
    let n = 0;
    const speak: SpeakFn = () => {
      if (n++ === 0) throw new Error("boom");
      return { pause() {}, resume() {}, stop() {} };
    };
    const { player } = setup(["fr", "zh"], {}, { engines: { system: speak } });
    player.play();
    expect(player.snapshot()).toMatchObject({ state: "loading", index: 1 });
  });
  it("ends when every voice fails", () => {
    const { player, engine } = setup(["fr", "zh"]);
    player.play();
    engine.last().cb.onError();
    engine.last().cb.onError();
    expect(player.snapshot().state).toBe("idle");
  });
});

describe("download progress and voice changes", () => {
  it("reports the download of the current voice, clamped", () => {
    const { player, engine, seen } = setup(["fr"], { fr: PIPER });
    player.play();
    engine.last().cb.onProgress?.(41.6);
    engine.last().cb.onProgress?.(180);
    expect(seen.map((s) => s.loading)).toEqual([null, 42, 100]);
    engine.last().cb.onStart();
    expect(player.snapshot().loading).toBeNull();
    engine.last().cb.onProgress?.(50);
    expect(player.snapshot().loading).toBeNull();
  });
  it("starts the passage over when its voice changes", () => {
    const voices: Record<string, VoiceOption | null> = { fr: sys("Thomas") };
    const { player, engine } = setup(["fr", "zh"], voices);
    player.play();
    engine.last().cb.onStart();
    voices.fr = PIPER;
    player.voiceChanged("zh");
    expect(engine.calls).toHaveLength(1);
    player.voiceChanged("fr");
    expect(engine.last().voice).toBe(PIPER);
    expect(engine.last().text).toBe("fr0");
  });
  it("keeps a paused reading paused when its voice changes", () => {
    const { player, engine } = setup(["fr"]);
    player.play();
    engine.last().cb.onStart();
    player.pause();
    player.voiceChanged("fr");
    engine.last().cb.onStart();
    expect(player.snapshot().state).toBe("paused");
  });
  it("moves on when the current language loses its voice", () => {
    const voices: Record<string, VoiceOption | null> = {};
    const { player, engine } = setup(["fr", "zh"], voices);
    player.play();
    voices.fr = null;
    player.voiceChanged("fr");
    expect(engine.last().text).toBe("zh1");
  });
  it("does nothing when idle", () => {
    const { player, engine } = setup(["fr"]);
    player.voiceChanged("fr");
    expect(engine.calls).toHaveLength(0);
  });
});
