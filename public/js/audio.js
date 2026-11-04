// Text-to-speech for note bodies. Reads the title and the prose of the
// article (lib/speech-text.ts says what is skipped) with the system voice
// (SpeechSynthesis), or with the natural voice once the reader turns it on
// (the "Voix naturelle" switch; lib/piper-voice.ts, fetched on demand as
// natural-voice.bundle.js). A single toggle cycles idle → playing → paused →
// playing, through "loading" while the natural voice downloads. Hidden when
// the browser has neither.
import { noteSpeechText, speechChunks } from "../../lib/speech-text";

const NATURAL_KEY = "gk-piper";

// The natural voice's page side, fetched the first time it is needed.
let piperPromise = null;
function loadPiper() {
  piperPromise ??= new Promise((resolve) => {
    if (window.__gkPiper) return resolve(window.__gkPiper);
    const s = document.createElement("script");
    s.src = "/js/natural-voice.bundle.js";
    s.onload = () => resolve(window.__gkPiper || null);
    s.onerror = () => {
      piperPromise = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return piperPromise;
}

(function () {
  const btn = document.querySelector(".audio-btn");
  if (!btn) return;
  const synth =
    window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function"
      ? window.speechSynthesis
      : null;
  const naturalOk =
    typeof WebAssembly === "object" &&
    typeof Worker === "function" &&
    typeof AudioContext === "function" &&
    typeof caches === "object";
  if (!synth && !naturalOk) return;

  const label = btn.querySelector(".audio-label");
  let keepAliveId = null;
  // The current reading, whichever voice: {pause, resume, stop}.
  let reading = null;

  // Reveal the button only when TTS is actually usable.
  btn.hidden = false;

  function naturalOn() {
    try {
      return naturalOk && localStorage.getItem(NATURAL_KEY) === "1";
    } catch {
      return false;
    }
  }

  function articleText() {
    const main = document.getElementById("main");
    return main ? noteSpeechText(main) : "";
  }

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }
  function setState(s, pct) {
    btn.dataset.state = s;
    btn.setAttribute(
      "aria-label",
      s === "playing"
        ? tt("noteActions.audioAriaPlaying")
        : s === "paused"
          ? tt("noteActions.audioAriaPaused")
          : tt("noteActions.audioAriaIdle"),
    );
    if (label)
      label.textContent =
        s === "playing"
          ? tt("noteActions.audioPause")
          : s === "paused"
            ? tt("noteActions.audioResume")
            : s === "loading"
              ? tt("noteActions.audioLoading").replace("{n}", String(pct ?? 0))
              : tt("noteActions.audioListen");
  }

  // Read the article's current language (translate.js sets `main[lang]` after a
  // translation), so TTS uses a matching voice instead of always French.
  function currentLang() {
    const main = document.getElementById("main");
    return ((main && main.getAttribute("lang")) || "fr").toLowerCase();
  }
  function pickVoice(lang) {
    const base = lang.split("-")[0];
    const voices = synth ? synth.getVoices() : [];
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(base) && v.localService) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(base)) ||
      null
    );
  }

  // Chrome on a computer silently stops SpeechSynthesis after ~15 seconds; a
  // periodic pause/resume keeps it alive there. Only there: Safari (iOS too)
  // and Android Chrome can stall for good on that pause/resume.
  const ua = navigator.userAgent;
  const needsKeepAlive = /Chrome\//.test(ua) && !/Android|Mobile|Edg\//.test(ua);
  function startKeepAlive() {
    stopKeepAlive();
    if (!needsKeepAlive) return;
    keepAliveId = setInterval(() => {
      if (btn.dataset.state !== "playing") return stopKeepAlive();
      synth.pause();
      synth.resume();
    }, 13000);
  }
  function stopKeepAlive() {
    if (keepAliveId) clearInterval(keepAliveId);
    keepAliveId = null;
  }

  // The system voice. Chrome silently truncates a single utterance past ~32k
  // characters: the text goes in chunks, which SpeechSynthesis queues
  // seamlessly.
  //
  // Why it could never start, now handled:
  // - a cancel() just before speak() makes Safari drop the new utterance:
  //   cancel only what is actually queued;
  // - Chrome keeps speechSynthesis paused across pages (a reading paused,
  //   then the note left) and queues every new utterance behind that pause:
  //   resume() right after speak();
  // - long utterances fail silently on some engines (Android, iOS): shorter
  //   chunks;
  // - and if nothing has started after a moment, one retry, then the button
  //   goes back to "écouter" instead of claiming to read.
  function speakSystem(text, lang, retried) {
    if (!synth) return setState("idle");
    const v = pickVoice(lang);
    const chunks = speechChunks(text, 900);
    if (synth.speaking || synth.pending) synth.cancel();
    let started = false;
    const run = (reading = {});
    chunks.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      if (v) u.voice = v;
      u.lang = (v && v.lang) || lang;
      u.rate = 1;
      u.pitch = 1;
      u.onstart = () => {
        started = true;
      };
      // Only the last chunk returns the button to idle; any error stops all.
      if (i === chunks.length - 1) {
        u.onend = () => {
          stopKeepAlive();
          setState("idle");
        };
      }
      u.onerror = (e) => {
        // "interrupted"/"canceled": our own stop or a new reading.
        if (e && (e.error === "interrupted" || e.error === "canceled")) return;
        stopKeepAlive();
        setState("idle");
      };
      synth.speak(u);
    });
    synth.resume();
    setTimeout(() => {
      if (started || reading !== run || btn.dataset.state !== "playing") return;
      if (synth.speaking && !synth.paused) return;
      synth.cancel();
      synth.resume();
      if (!retried) speakSystem(text, lang, true);
      else {
        stopKeepAlive();
        reading = null;
        setState("idle");
      }
    }, 2500);
    Object.assign(run, {
      pause() {
        synth.pause();
        stopKeepAlive();
      },
      resume() {
        synth.resume();
        startKeepAlive();
      },
      stop() {
        synth.cancel();
        // A paused engine stays paused after cancel() (Chrome): the next
        // reading would wait behind it.
        synth.resume();
        stopKeepAlive();
      },
    });
    setState("playing");
    startKeepAlive();
  }

  // The natural voice, short chunks so the first one plays soon. Falls back
  // to the system voice when it can't load (no network for the first
  // download, no room, a language it has no voice for).
  async function speakNatural(text, lang) {
    // Made in the click, and resumed there: iOS only lets a page start audio
    // from a gesture, and a context it creates starts suspended.
    const ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    let cancelled = false;
    reading = {
      pause() {},
      resume() {},
      stop() {
        cancelled = true;
        void ctx.close().catch(() => {});
      },
    };
    setState("loading", 0);
    const piper = await loadPiper();
    const r =
      piper && !cancelled
        ? await piper.readWithPiper({
            ctx,
            lang,
            chunks: speechChunks(text, 320),
            onProgress: (pct) => {
              if (!cancelled && btn.dataset.state === "loading") setState("loading", pct);
            },
            onPlaying: () => {
              if (!cancelled && btn.dataset.state === "loading") setState("playing");
            },
            onEnd: () => setState("idle"),
            onError: () => setState("idle"),
          })
        : null;
    if (cancelled) return r?.stop();
    if (!r) {
      void ctx.close().catch(() => {});
      return speakSystem(text, lang);
    }
    reading = r;
  }

  btn.addEventListener("click", () => {
    const s = btn.dataset.state;
    if (s === "playing") {
      reading?.pause();
      setState("paused");
    } else if (s === "paused") {
      reading?.resume();
      setState("playing");
    } else if (s === "loading") {
      reading?.stop();
      reading = null;
      setState("idle");
    } else {
      const text = articleText();
      if (!text) return;
      const lang = currentLang();
      if (naturalOn()) void speakNatural(text, lang);
      else speakSystem(text, lang);
    }
  });

  // pagehide, not beforeunload: a beforeunload listener can keep the page out
  // of the back/forward cache, and this one fired on every note.
  window.addEventListener("pagehide", () => {
    reading?.stop();
    reading = null;
    if (btn.dataset.state !== "idle") setState("idle");
  });

  // Voices load asynchronously on some browsers; trigger a load.
  if (synth && typeof synth.getVoices === "function") synth.getVoices();

  // "Voix naturelle": a switch in "Affichage". Turning it on downloads the
  // voice of the note's language right away (its progress on the switch);
  // turning it off deletes the downloaded voices.
  const sw = document.querySelector(".voice-btn");
  if (sw && naturalOk) {
    const swLabel = sw.querySelector(".voice-label");
    const paintSwitch = (pct) => {
      sw.setAttribute("aria-checked", naturalOn() ? "true" : "false");
      if (swLabel)
        swLabel.textContent =
          pct == null ? tt("noteActions.voiceNatural") : tt("noteActions.audioLoading").replace("{n}", String(pct));
    };
    sw.hidden = false;
    paintSwitch();
    sw.addEventListener("click", async () => {
      const on = !naturalOn();
      try {
        if (on) localStorage.setItem(NATURAL_KEY, "1");
        else localStorage.removeItem(NATURAL_KEY);
      } catch {
        return;
      }
      if (btn.dataset.state !== "idle") {
        reading?.stop();
        reading = null;
        setState("idle");
      }
      paintSwitch();
      const piper = await loadPiper();
      if (on) {
        const lang = currentLang();
        const rate = piper
          ? await piper.loadPiperVoice(lang, (pct) => naturalOn() && paintSwitch(pct))
          : null;
        // The voice's script or its download failed (network, room, a file
        // the server refused): say so and turn the switch back off, rather
        // than leaving it on over a voice that isn't there. A language with
        // no voice at all isn't a failure: it reads with the system voice.
        if (!rate && naturalOn() && (!piper || piper.piperVoiceFor(lang))) {
          try {
            localStorage.removeItem(NATURAL_KEY);
          } catch {
            /* stays on; "Écouter" falls back to the system voice */
          }
          paintSwitch();
          // Until the next tap on the switch.
          if (swLabel) swLabel.textContent = tt("noteActions.voiceNaturalFailed");
          return;
        }
        paintSwitch();
      } else if (piper) {
        await piper.deletePiperVoices();
      }
    });
  }
})();
