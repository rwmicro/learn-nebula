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

  function speak() {
    const text = articleText();
    if (!text) return;
    utterance = new SpeechSynthesisUtterance(text);
    const lang = currentLang();
    const v = pickVoice(lang);
    if (v) utterance.voice = v;
    utterance.lang = (v && v.lang) || lang;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      stopKeepAlive();
      setState("idle");
    };
    utterance.onerror = () => {
      stopKeepAlive();
      setState("idle");
    };
    synth.cancel();
    synth.speak(utterance);
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

  window.addEventListener("beforeunload", () => synth.cancel());

  // Voices load asynchronously on some browsers; trigger a load.
  if (typeof synth.getVoices === "function") synth.getVoices();
  if ("onvoiceschanged" in synth) {
    synth.addEventListener("voiceschanged", () => {}, { once: true });
  }
})();
