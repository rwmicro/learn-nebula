// Pronunciation clips render as `.pron-btn` inside a `.pron` span, produced by
// two build-time sources: `![word](clip.mp3)` in a note (rehypeVaultAssets in
// lib/markdown.ts) and `[sound:clip.mp3]` in an Anki field (rewriteMedia in
// scripts/build-anki.mjs). Loaded site-wide (app/layout.tsx) rather than only
// via <NoteScripts /> so it covers both /posts/* and /cartes/* decks.
//
// Same idle → playing → paused → playing cycle as the whole-article "listen"
// button (/js/audio.js), so the interaction is consistent across the site.
// Only one clip is active at a time: starting one fully stops (not just
// pauses) whichever else was playing or paused, and rewinds it to the start.
//
// Delegated on `document` (like lightbox.js) rather than bound per-button, so
// clips still work after /js/translate.js swaps .article-body's innerHTML for
// a translated render, or after Flashcards re-renders a card's front/back.
(function () {
  // No early "any .pron-btn on the page?" bail-out here: Flashcards fetches
  // and renders its deck client-side, after this script has already run, so
  // buttons can appear well after load — the delegated listener below still
  // needs to be live for them.
  function tt(k, vars) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k, vars) : k;
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
      offerPractice(btn);
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

  // --- Practice: record yourself, compare with the clip ------------------
  //
  // Once a clip has been heard, a microphone button appears next to it. It
  // opens a panel at the bottom of the screen with the clip's waveform and
  // the reader's, on one time scale, to replay one after the other.
  // Everything stays in the browser: the recording is decoded with Web Audio
  // and played from memory (no upload, no blob: URL, nothing stored), and is
  // gone when the panel closes. No speech recognition on purpose: the
  // browsers' engines send the audio to a server.

  const canRecord =
    typeof window.MediaRecorder === "function" &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
    !!(window.AudioContext || window.webkitAudioContext);
  const MAX_REC_MS = 6000;
  const MIC_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3Zm6-3a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.9V22h2v-2.1A8 8 0 0 0 20 12Z"/></svg>';

  function offerPractice(btn) {
    if (!canRecord) return;
    const next = btn.nextElementSibling;
    if (next && next.classList.contains("pron-mic")) return;
    const mic = document.createElement("button");
    mic.type = "button";
    mic.className = "pron-mic";
    mic.innerHTML = MIC_SVG;
    mic.setAttribute("aria-label", tt("pronunciation.practiceAria"));
    mic.title = tt("pronunciation.practice");
    btn.after(mic);
  }

  let ac = null;
  const audioCtx = () => {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return ac;
  };

  /** Peaks of a buffer, silence trimmed at both ends. */
  function shape(buf) {
    const raw = buf.getChannelData(0);
    let top = 0;
    for (let i = 0; i < raw.length; i++) top = Math.max(top, Math.abs(raw[i]));
    const quiet = Math.max(top * 0.06, 0.01);
    let a = 0;
    let b = raw.length - 1;
    while (a < b && Math.abs(raw[a]) < quiet) a++;
    while (b > a && Math.abs(raw[b]) < quiet) b--;
    const pad = Math.round(buf.sampleRate * 0.04);
    a = Math.max(0, a - pad);
    b = Math.min(raw.length - 1, b + pad);
    const N = 160;
    const step = Math.max(1, Math.floor((b - a) / N));
    const peaks = [];
    for (let i = 0; i < N; i++) {
      let m = 0;
      for (let j = a + i * step; j < Math.min(b, a + (i + 1) * step); j++) m = Math.max(m, Math.abs(raw[j]));
      peaks.push(top ? m / top : 0);
    }
    return { buf, peaks, start: a / buf.sampleRate, dur: (b - a) / buf.sampleRate };
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  }

  function draw(canvas, sh, span, colorVar, frac) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    if (!g) return;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    g.fillStyle = cssVar("--rule");
    g.fillRect(0, h / 2 - 0.5, w, 1);
    if (!sh) return;
    const width = w * Math.min(1, sh.dur / span);
    const bw = 3;
    const gap = 2;
    const n = Math.max(1, Math.floor(width / (bw + gap)));
    const ink = cssVar("--ink");
    const col = cssVar(colorVar);
    for (let i = 0; i < n; i++) {
      const v = sh.peaks[Math.floor((i / n) * sh.peaks.length)] || 0;
      const bh = Math.max(2, v * (h - 6));
      g.fillStyle = frac != null && i / n <= frac ? ink : col;
      g.fillRect(i * (bw + gap), (h - bh) / 2, bw, bh);
    }
  }

  const fmtSec = (s) => s.toFixed(1).replace(".", ",") + " s";

  let panel = null;

  function openCoach(mic) {
    const btn = mic.previousElementSibling;
    const src = btn && btn.dataset.pronSrc;
    if (!src) return;
    if (panel) panel.close();
    const label = mic.parentElement && mic.parentElement.querySelector(".pron-label");
    const word = label ? label.textContent.trim() : "";

    const root = document.createElement("section");
    root.className = "pron-coach";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", tt("pronunciation.practice"));
    root.tabIndex = -1;
    root.innerHTML =
      '<div class="pron-coach-head">' +
      '<span class="pron-coach-word"></span>' +
      '<span class="pron-coach-note"></span>' +
      '<button type="button" class="pron-coach-close"></button>' +
      "</div>" +
      '<div class="pron-coach-track"><span class="pron-coach-lab" data-k="model"></span><canvas data-t="model"></canvas><span class="pron-coach-dur" data-d="model"></span></div>' +
      '<div class="pron-coach-track"><span class="pron-coach-lab" data-k="me"></span><canvas data-t="me"></canvas><span class="pron-coach-dur" data-d="me"></span></div>' +
      '<div class="pron-coach-actions">' +
      '<button type="button" class="pron-coach-btn" data-a="model"></button>' +
      '<button type="button" class="pron-coach-btn pron-coach-rec" data-a="rec"><span class="pron-coach-dot" aria-hidden="true"></span><span data-l></span></button>' +
      '<button type="button" class="pron-coach-btn pron-coach-main" data-a="both"></button>' +
      "</div>" +
      '<p class="pron-coach-msg" role="status"></p>';
    const $ = (sel) => root.querySelector(sel);
    $(".pron-coach-word").textContent = word;
    $(".pron-coach-note").textContent = tt("pronunciation.practiceLocal");
    $(".pron-coach-close").textContent = tt("pronunciation.practiceClose");
    $('[data-k="model"]').textContent = tt("pronunciation.practiceModel");
    $('[data-k="me"]').textContent = tt("pronunciation.practiceMe");
    $('[data-a="model"]').textContent = "▶ " + tt("pronunciation.practiceModel");
    $('[data-a="both"]').textContent = tt("pronunciation.practiceBoth");
    const recLabel = $("[data-l]");
    const recBtn = $('[data-a="rec"]');
    const bothBtn = $('[data-a="both"]');
    const msg = $(".pron-coach-msg");
    const cvModel = $('canvas[data-t="model"]');
    const cvMe = $('canvas[data-t="me"]');
    recLabel.textContent = tt("pronunciation.practiceRecord");
    bothBtn.disabled = true;
    document.body.appendChild(root);

    let model = null;
    let me = null;
    let recorder = null;
    let stream = null;
    let playing = null;
    let raf = 0;
    let stopTimer = 0;

    function redraw(fm, fme) {
      const span = Math.max(model ? model.dur : 0, me ? me.dur : 0, 0.3);
      draw(cvModel, model, span, "--garden", fm);
      draw(cvMe, me, span, "--link-mid", fme);
      $('[data-d="model"]').textContent = model ? fmtSec(model.dur) : "";
      $('[data-d="me"]').textContent = me ? fmtSec(me.dur) : "";
    }

    function play(sh, which) {
      return new Promise((resolve) => {
        if (!sh) return resolve();
        stopPlaying();
        const ctx = audioCtx();
        const node = ctx.createBufferSource();
        node.buffer = sh.buf;
        node.connect(ctx.destination);
        const t0 = ctx.currentTime;
        node.start(0, sh.start, sh.dur);
        playing = node;
        const tick = () => {
          const f = (ctx.currentTime - t0) / sh.dur;
          if (playing !== node) return;
          if (f >= 1) return;
          redraw(which === "model" ? f : null, which === "me" ? f : null);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        node.onended = () => {
          if (playing === node) playing = null;
          cancelAnimationFrame(raf);
          redraw();
          resolve();
        };
      });
    }
    function stopPlaying() {
      if (playing) {
        try {
          playing.stop();
        } catch {
          /* already stopped */
        }
        playing = null;
      }
      cancelAnimationFrame(raf);
    }

    fetch(src)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => audioCtx().decodeAudioData(data))
      .then((buf) => {
        model = shape(buf);
        redraw();
      })
      .catch(() => {
        msg.textContent = tt("pronunciation.practiceModelError");
      });

    function stopRecording() {
      clearTimeout(stopTimer);
      if (recorder && recorder.state !== "inactive") recorder.stop();
    }

    async function startRecording() {
      stopPlaying();
      msg.textContent = "";
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        msg.textContent = tt(
          e && e.name === "NotAllowedError" ? "pronunciation.practiceDenied" : "pronunciation.practiceNoMic",
        );
        return;
      }
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        stream = null;
        root.classList.remove("is-recording");
        recLabel.textContent = tt("pronunciation.practiceAgain");
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        blob
          .arrayBuffer()
          .then((data) => audioCtx().decodeAudioData(data))
          .then((buf) => {
            me = shape(buf);
            bothBtn.disabled = false;
            redraw();
            const diff = model ? me.dur - model.dur : 0;
            msg.textContent =
              model && Math.abs(diff) > 0.25
                ? tt(diff > 0 ? "pronunciation.practiceLonger" : "pronunciation.practiceShorter", {
                    s: fmtSec(Math.abs(diff)),
                  })
                : tt("pronunciation.practiceDone");
          })
          .catch(() => {
            msg.textContent = tt("pronunciation.practiceNoMic");
          });
      };
      recorder.start();
      root.classList.add("is-recording");
      recLabel.textContent = tt("pronunciation.practiceStop");
      stopTimer = setTimeout(stopRecording, MAX_REC_MS);
    }

    function close() {
      stopPlaying();
      stopRecording();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      root.remove();
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      panel = null;
      if (mic.isConnected) mic.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    function onResize() {
      redraw();
    }

    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a], .pron-coach-close");
      if (!a) return;
      if (a.classList.contains("pron-coach-close")) return close();
      const act = a.dataset.a;
      if (act === "model") play(model, "model");
      else if (act === "rec") {
        if (recorder && recorder.state === "recording") stopRecording();
        else startRecording();
      } else if (act === "both") {
        play(model, "model")
          .then(() => new Promise((r) => setTimeout(r, 300)))
          .then(() => play(me, "me"));
      }
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    panel = { close };
    redraw();
    root.focus();
  }

  document.addEventListener("click", (e) => {
    const mic = e.target.closest(".pron-mic");
    if (mic) openCoach(mic);
  });
})();
