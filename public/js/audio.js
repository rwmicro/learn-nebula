// "Écouter", the part every note loads: shows the button when the browser
// can read aloud (SpeechSynthesis, or what the natural voice needs), and
// fetches the reader itself, read-aloud.bundle.js (public/js/read-aloud.js),
// the first time the reader goes for the button. It is warmed on the first
// hover, touch or focus, so the click usually finds it there.
(function () {
  const btn = document.querySelector(".audio-btn");
  if (!btn) return;
  const synth =
    window.speechSynthesis &&
    typeof window.SpeechSynthesisUtterance === "function"
      ? window.speechSynthesis
      : null;
  const naturalOk =
    typeof WebAssembly === "object" &&
    typeof Worker === "function" &&
    typeof AudioContext === "function" &&
    typeof caches === "object";
  if (!synth && !naturalOk) return;
  btn.hidden = false;

  const stored = (key) => {
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  };
  // "Voix naturelle", in "Affichage": shown in its stored state.
  const sw = naturalOk ? document.querySelector(".voice-btn") : null;
  if (sw) {
    sw.hidden = false;
    sw.setAttribute(
      "aria-checked",
      stored("gk-piper") === "1" ? "true" : "false",
    );
  }
  // Voices load asynchronously on some browsers; trigger a load.
  if (synth && typeof synth.getVoices === "function") synth.getVoices();

  let loading = null;
  function load() {
    loading ??= new Promise((resolve) => {
      if (window.__gkReadAloud) return resolve(true);
      const s = document.createElement("script");
      s.src = "/js/read-aloud.bundle.js";
      s.onload = () => resolve(!!window.__gkReadAloud);
      s.onerror = () => {
        loading = null;
        s.remove();
        resolve(false);
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  // A tap that comes before the script: keep what only a tap can start (iOS
  // lets a page speak, or open an audio context, from a gesture only), fetch
  // the script, then hand the tap over.
  function unlock() {
    try {
      if (synth) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        synth.speak(u);
      }
    } catch {
      /* the reader's own start will say if it can't */
    }
    try {
      if (
        naturalOk &&
        (stored("gk-piper") === "1" || stored("gk-voices").includes('"piper"'))
      ) {
        window.__gkAudioCtx = new AudioContext();
        void window.__gkAudioCtx.resume().catch(() => {});
      }
    } catch {
      /* no audio context: the installed voices read */
    }
  }
  let waiting = false;
  function handOver(el, prime) {
    if (!el) return;
    for (const type of ["pointerenter", "pointerdown", "touchstart", "focus"])
      el.addEventListener(type, () => void load(), {
        passive: true,
        once: true,
      });
    el.addEventListener(
      "click",
      (e) => {
        if (window.__gkReadAloud) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (waiting) return;
        waiting = true;
        if (prime) prime();
        void load().then((ok) => {
          waiting = false;
          if (ok) el.click();
        });
      },
      true,
    );
  }
  handOver(btn, unlock);
  handOver(sw);
  // The phone toolbar's "Écouter" clicks the button above: warm on it too.
  const tab = document.querySelector("[data-na-listen]");
  if (tab)
    tab.addEventListener("pointerdown", () => void load(), {
      passive: true,
      once: true,
    });
})();
