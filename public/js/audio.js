// Browser-native text-to-speech for note bodies. Reads the article (skipping
// the header, sidebar, signature and footer nav) via SpeechSynthesis. A single
// toggle cycles idle → playing → paused → playing. Hidden if the browser
// has no SpeechSynthesis support (e.g. Firefox without a voice installed).
(function () {
  const btn = document.querySelector(".audio-btn");
  if (!btn) return;
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance !== "function") return;

  const label = btn.querySelector(".audio-label");
  let utterance = null;
  let keepAliveId = null;

  // Reveal the button only when TTS is actually usable.
  btn.hidden = false;

  function articleText() {
    const main = document.getElementById("main");
    if (!main) return "";
    const skipSel =
      ".note-aside, .note-header, .signature, .siblings, .site-nav, " +
      ".subtitle, .audio-btn, .toc, .anchor, [data-pagefind-ignore]";
    const skip = new Set(main.querySelectorAll(skipSel));
    const out = [];
    (function walk(node) {
      if (skip.has(node)) return;
      if (node.nodeType === Node.TEXT_NODE) {
        out.push(node.textContent);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      for (const child of node.childNodes) walk(child);
    })(main);
    return out.join(" ").replace(/\s+/g, " ").trim();
  }

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }
  function setState(s) {
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
    const voices = synth.getVoices();
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(base) && v.localService) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(base)) ||
      null
    );
  }

  // Chrome silently stops SpeechSynthesis after ~15 seconds; a periodic
  // pause/resume keeps it alive without audible artefacts.
  function startKeepAlive() {
    stopKeepAlive();
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

  // Chrome silently truncates a single utterance past ~32k characters, which
  // would cut long notes off mid-read. Split on sentence boundaries into safe
  // chunks and queue them — SpeechSynthesis plays a queue seamlessly.
  const CHUNK_CHARS = 2000;
  function chunkText(text) {
    const parts = [];
    let buf = "";
    for (const piece of text.split(/(?<=[.!?…])\s+/)) {
      if (buf && (buf + " " + piece).length > CHUNK_CHARS) {
        parts.push(buf);
        buf = piece;
      } else {
        buf = buf ? `${buf} ${piece}` : piece;
      }
    }
    if (buf.trim()) parts.push(buf);
    // A single sentence longer than the budget still needs hard splitting.
    return parts.flatMap((p) =>
      p.length <= CHUNK_CHARS
        ? [p]
        : (p.match(new RegExp(`[\\s\\S]{1,${CHUNK_CHARS}}`, "g")) ?? [p]),
    );
  }

  function speak() {
    const text = articleText();
    if (!text) return;
    const lang = currentLang();
    const v = pickVoice(lang);
    const chunks = chunkText(text);
    synth.cancel();
    chunks.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      if (v) u.voice = v;
      u.lang = (v && v.lang) || lang;
      u.rate = 1;
      u.pitch = 1;
      // Only the last chunk returns the button to idle; any error stops all.
      if (i === chunks.length - 1) {
        u.onend = () => {
          stopKeepAlive();
          setState("idle");
        };
      }
      u.onerror = () => {
        stopKeepAlive();
        setState("idle");
      };
      if (i === 0) utterance = u;
      synth.speak(u);
    });
    setState("playing");
    startKeepAlive();
  }

  btn.addEventListener("click", () => {
    const s = btn.dataset.state;
    if (s === "playing") {
      synth.pause();
      stopKeepAlive();
      setState("paused");
    } else if (s === "paused") {
      synth.resume();
      setState("playing");
      startKeepAlive();
    } else {
      speak();
    }
  });

  // pagehide, not beforeunload: a beforeunload listener can keep the page out
  // of the back/forward cache, and this one fired on every note.
  window.addEventListener("pagehide", () => synth.cancel());

  // Voices load asynchronously on some browsers; trigger a load.
  if (typeof synth.getVoices === "function") synth.getVoices();
  if ("onvoiceschanged" in synth) {
    synth.addEventListener("voiceschanged", () => {}, { once: true });
  }
})();
