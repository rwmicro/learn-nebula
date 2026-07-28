// Pronunciation clips embedded as `![word](clip.mp3)`, rendered by
// rehypeVaultAssets (lib/markdown.ts) as `.pron-btn` inside a `.pron` span.
// Same idle → playing → paused → playing cycle as the whole-article "listen"
// button (/js/audio.js), so the interaction is consistent across the site.
// Only one clip is active at a time: starting one fully stops (not just
// pauses) whichever else was playing or paused, and rewinds it to the start.
//
// Delegated on `document` (like lightbox.js) rather than bound per-button, so
// clips still work after /js/translate.js swaps .article-body's innerHTML for
// a translated render.
(function () {
  if (!document.querySelector(".pron-btn")) return;

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }

  const audios = new WeakMap(); // button -> <audio>
  let current = null; // button currently playing/paused/loading

  function ariaFor(state) {
    if (state === "playing") return tt("pronunciation.pauseAria");
    if (state === "paused") return tt("pronunciation.playAria");
    if (state === "loading") return tt("pronunciation.loadingAria");
    if (state === "error") return tt("pronunciation.errorAria");
    return tt("pronunciation.playAria");
  }

  function setState(btn, state) {
    btn.dataset.state = state;
    btn.setAttribute("aria-label", ariaFor(state));
  }

  function resetToIdle(btn) {
    const audio = audios.get(btn);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setState(btn, "idle");
  }

  function audioFor(btn, src) {
    let audio = audios.get(btn);
    if (audio) return audio;
    audio = new Audio(src);
    audio.preload = "none";
    audio.addEventListener("waiting", () => {
      if (current === btn) setState(btn, "loading");
    });
    audio.addEventListener("playing", () => {
      if (current === btn) setState(btn, "playing");
    });
    audio.addEventListener("ended", () => {
      audio.currentTime = 0;
      if (current === btn) current = null;
      setState(btn, "idle");
    });
    audio.addEventListener("error", () => {
      if (current === btn) current = null;
      setState(btn, "error");
    });
    audios.set(btn, audio);
    return audio;
  }

  function play(btn, audio) {
    current = btn;
    setState(btn, "loading");
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        if (current === btn) current = null;
        setState(btn, "error");
      });
    }
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".pron-btn");
    if (!btn) return;
    const src = btn.dataset.pronSrc;
    if (!src) return;

    if (current && current !== btn) resetToIdle(current);

    const state = btn.dataset.state;
    if (state === "playing") {
      audios.get(btn).pause();
      setState(btn, "paused");
    } else if (state === "paused") {
      play(btn, audios.get(btn));
    } else {
      // idle or error: (re)play from the start.
      const audio = audioFor(btn, src);
      audio.currentTime = 0;
      play(btn, audio);
    }
  });

  window.addEventListener("beforeunload", () => {
    if (current) resetToIdle(current);
  });
})();
