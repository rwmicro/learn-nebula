// Pronunciation clips render as `.pron-btn` inside a `.pron` span, produced by
// two build-time sources: `![word](clip.mp3)` in a note (rehypeVaultAssets in
// lib/markdown.ts) and `[sound:clip.mp3]` in an Anki field (rewriteMedia in
// scripts/build-anki.mjs). Loaded by /js/pronounce-loader.js (site-wide, from
// app/layout.tsx) as soon as a clip is on the page, on /posts/* and /cartes/*.
//
// Same idle → playing → paused → playing cycle as the whole-article "listen"
// button (/js/audio.js), so the interaction is consistent across the site.
// Only one clip is active at a time: starting one fully stops (not just
// pauses) whichever else was playing or paused, and rewinds it to the start.
//
// Delegated on `document` (like lightbox.js) rather than bound per-button, so
// clips still work after /js/translate.js swaps .article-body's innerHTML for
// a translated render, or after Flashcards re-renders a card's front/back.
//
// Bundled (scripts/bundle-js.mjs → pronounce.bundle.js) for lib/speech-match.ts.
import { matchSpoken, speechLangFor } from "../../lib/speech-match.ts";

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
  // Every clip gets a microphone next to its speaker, in one pill. It opens a
  // bottom sheet with the clip's waveform over the reader's, on one time
  // scale, to record, replay and compare. Everything stays in the browser:
  // the recording is decoded with Web Audio and played from memory (no
  // upload, no blob: URL, nothing stored), and is gone when the sheet closes.
  // Speech recognition only where it runs on the device (Chrome 139+,
  // `processLocally`, a language pack installed once): the attempt is then
  // checked against the word — "reconnu / pas reconnu", not a grade. Browsers
  // whose recogniser would send the audio to a server never get it.

  const canRecord =
    typeof window.MediaRecorder === "function" &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
    !!(window.AudioContext || window.webkitAudioContext);
  const MAX_REC = 5; // seconds
  const svg = (d, fill) =>
    '<svg viewBox="0 0 24 24" aria-hidden="true" ' +
    (fill
      ? 'fill="currentColor">'
      : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">') +
    d +
    "</svg>";
  const PLAY = svg('<path d="M8 5.5v13l10.5-6.5z"/>', 1);
  const MIC = svg(
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  );

  // Wrap each speaker in a pill with its microphone. In a table cell, the
  // "(translit)" written after the clip moves inside it, so a phone can set
  // the word and its reading on one line and the pill under them.
  function enhance() {
    document.querySelectorAll(".pron > .pron-btn").forEach((btn) => {
      const pron = btn.parentElement;
      if (pron.closest(".rsm-face")) return;
      const pill = document.createElement("span");
      pill.className = "pron-pill";
      btn.before(pill);
      pill.append(btn);
      if (canRecord) {
        const mic = document.createElement("button");
        mic.type = "button";
        mic.className = "pron-mic";
        mic.innerHTML = MIC;
        mic.setAttribute("aria-label", tt("pronunciation.practiceAria"));
        mic.title = tt("pronunciation.practice");
        pill.append(mic);
      }
      const label = pron.querySelector(".pron-label");
      if (label) {
        label.dir = "auto";
        if (/[\u0590-\u08ff\ufb1d-\ufefc]/.test(label.textContent))
          label.classList.add("is-rtl");
      }
      const next = pron.nextSibling;
      const m =
        label &&
        pron.parentElement.tagName === "TD" &&
        next &&
        next.nodeType === 3 &&
        /^\s*\(([^()]+)\)/.exec(next.data);
      if (m) {
        const tr = document.createElement("i");
        tr.className = "pron-tr";
        tr.textContent = m[1];
        pron.append(tr);
        next.data = next.data.slice(m[0].length);
      }
    });
  }
  let queued = 0;
  new MutationObserver(() => {
    queued =
      queued ||
      requestAnimationFrame(() => {
        queued = 0;
        enhance();
      });
  }).observe(document.documentElement, { childList: true, subtree: true });
  enhance();

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
      for (let j = a + i * step; j < Math.min(b, a + (i + 1) * step); j++)
        m = Math.max(m, Math.abs(raw[j]));
      peaks.push(top ? m / top : 0);
    }
    return {
      buf,
      peaks,
      start: a / buf.sampleRate,
      dur: (b - a) / buf.sampleRate,
    };
  }

  /** Bars of `sh` on a lane `span` seconds wide, dashed every `tick` s;
   * past `frac` (a playhead) the bars are dimmed. */
  function draw(canvas, sh, span, tick, col, frac) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d");
    if (!g) return;
    const css = getComputedStyle(canvas);
    g.scale(dpr, dpr);
    g.strokeStyle = css.getPropertyValue("--pron-grid").trim() || "#ccc";
    g.globalAlpha = 0.8;
    g.setLineDash([2, 3]);
    g.beginPath();
    for (let t = tick; t < span - 0.01; t += tick) {
      const x = Math.round((t / span) * w) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, h);
    }
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.6;
    g.fillStyle = g.strokeStyle;
    g.fillRect(0, h / 2 - 0.5, w, 1);
    if (!sh || !sh.peaks.length) return;
    let top = 1;
    if (sh.live) top = Math.max(0.08, ...sh.peaks);
    g.fillStyle = css.getPropertyValue(col).trim() || "#888";
    const n = Math.max(1, Math.round(((sh.dur / span) * w) / 4));
    for (let i = 0; i < n; i++) {
      const v = Math.min(
        1,
        (sh.peaks[Math.floor((i / n) * sh.peaks.length)] || 0) / top,
      );
      const bh = Math.max(2, (v * 0.96 + 0.04) * h * 0.92);
      g.globalAlpha = frac != null && i / n > frac ? 0.38 : 1;
      g.beginPath();
      if (g.roundRect) g.roundRect(i * 4, (h - bh) / 2, 2.6, bh, 1.3);
      else g.rect(i * 4, (h - bh) / 2, 2.6, bh);
      g.fill();
    }
  }

  const num = (s, d) =>
    new Intl.NumberFormat(document.documentElement.lang || "fr", {
      minimumFractionDigits: d,
      maximumFractionDigits: 1,
    }).format(s);
  const sec = (s) => tt("pronunciation.practiceSecs", { n: num(s, 1) });

  const lane = (k, label) =>
    '<div class="pron-coach-lane" data-k="' +
    k +
    '"><p class="pron-coach-lh"><span><i></i><span data-t="' +
    label +
    '"></span></span><em></em></p><div class="pron-coach-wv"><canvas></canvas><span class="pron-coach-ph"></span>' +
    (k === "me"
      ? '<span class="pron-coach-empty" data-t="practiceEmpty"></span>'
      : "") +
    "</div></div>";
  const side = (a, icon, label) =>
    '<button type="button" class="pron-coach-side" data-a="' +
    a +
    '"><span class="glass">' +
    icon +
    '</span><span data-t="' +
    label +
    '"></span></button>';
  const pillBtn = (a, cls, icon, label) =>
    '<button type="button" class="' +
    cls +
    '" data-a="' +
    a +
    '">' +
    icon +
    '<span data-t="' +
    label +
    '"></span></button>';

  // --- "Le navigateur t'a compris" (on-device recognition only) ---------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  // `processLocally` must be a real property of the recogniser: on an older
  // engine, setting it would do nothing and the audio would go to a server.
  const canListen =
    !!SR &&
    typeof SR.available === "function" &&
    !!SR.prototype &&
    "processLocally" in SR.prototype;
  const listenAvail = new Map(); // lang → Promise<availability>
  function listenAvailability(lang) {
    if (!canListen) return Promise.resolve("unavailable");
    if (!listenAvail.has(lang))
      listenAvail.set(
        lang,
        Promise.resolve()
          .then(() => SR.available({ langs: [lang], processLocally: true }))
          .catch(() => "unavailable"),
      );
    return listenAvail.get(lang);
  }
  // Called from the record click: install() wants a user activation.
  async function ensureInstalled(lang) {
    const a = await listenAvailability(lang);
    if (a === "available") return true;
    if ((a !== "downloadable" && a !== "downloading") || typeof SR.install !== "function")
      return false;
    try {
      const ok = await SR.install({ langs: [lang], processLocally: true });
      if (ok) listenAvail.set(lang, Promise.resolve("available"));
      return !!ok;
    } catch {
      return false;
    }
  }
  /** Recognise the attempt from the recording's own mic track; resolves with
   *  the alternatives heard (possibly none) once the recogniser ends. */
  function listen(lang, track) {
    const r = new SR();
    r.lang = lang;
    r.processLocally = true;
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 5;
    const alts = [];
    const done = new Promise((resolve) => {
      r.onresult = (e) => {
        for (const res of e.results)
          for (let k = 0; k < res.length; k++) alts.push(res[k].transcript);
      };
      r.onend = () => resolve(alts);
      r.onerror = () => resolve(alts);
    });
    try {
      r.start(track);
    } catch {
      try {
        r.start();
      } catch {
        return { stop() {}, done: Promise.resolve([]) };
      }
    }
    return {
      stop() {
        try {
          r.stop();
        } catch {
          /* already ended */
        }
      },
      done,
    };
  }

  let panel = null;

  function openCoach(mic) {
    const pill = mic.parentElement;
    const btn = pill.querySelector(".pron-btn");
    const src = btn && btn.dataset.pronSrc;
    if (!src) return;
    if (panel) panel.close(true);
    const pron = pill.parentElement;
    const label = pron.querySelector(".pron-label");
    const trEl = pron.querySelector(".pron-tr");
    const after = pron.nextSibling;
    const trM =
      !trEl &&
      after &&
      after.nodeType === 3 &&
      /^\s*\(([^()]+)\)/.exec(after.data);
    // Under the word: what its table row says about it (another cell, then
    // the column's heading) — only what the note itself shows.
    const mean = [];
    const td = pron.closest("td");
    if (td) {
      const row = [...td.parentElement.children];
      const other = row.find(
        (c) => c !== td && !c.querySelector(".pron") && c.textContent.trim(),
      );
      if (other) mean.push(other.textContent.trim());
      const head = td.closest("table").querySelector("thead tr");
      const th = head && head.children[row.indexOf(td)];
      if (th && th.textContent.trim()) mean.push(th.textContent.trim());
    }

    const scrim = document.createElement("div");
    scrim.className = "pron-scrim";
    const root = document.createElement("section");
    root.className = "pron-coach";
    const fam = pron.closest("[data-family]");
    if (fam) root.dataset.family = fam.dataset.family;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", tt("pronunciation.practice"));
    root.tabIndex = -1;
    root.innerHTML =
      '<div class="pron-coach-grab"></div>' +
      '<button type="button" class="pron-coach-x glass" data-a="x">' +
      svg('<path d="M6 6l12 12M18 6 6 18"/>') +
      "</button>" +
      '<div class="pron-coach-hd"><p class="pron-coach-kk"></p>' +
      '<p class="pron-coach-big"><span class="pron-coach-word" dir="auto"></span><i class="pron-coach-tr" dir="auto"></i></p>' +
      '<p class="pron-coach-mean"></p></div>' +
      '<div class="pron-coach-trk">' +
      lane("model", "practiceModel") +
      lane("me", "practiceMe") +
      '<p class="pron-coach-axis"></p></div>' +
      '<div class="pron-coach-ctrl">' +
      side("model", PLAY, "practiceModel") +
      '<button type="button" class="pron-coach-mic" data-a="rec"><i></i><i></i><b></b>' +
      MIC +
      svg('<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>', 1) +
      "</button>" +
      side(
        "slow",
        svg('<circle cx="12" cy="13" r="8"/><path d="M12 13V9M10 2h4"/>'),
        "practiceSlow",
      ) +
      '<p class="pron-coach-cnt"><b></b><span data-t="practiceLeft"></span></p></div>' +
      '<p class="pron-coach-lab"><span></span><small></small></p>' +
      '<div class="pron-coach-cmp"><p class="pron-coach-fb"><i></i><span></span></p><div class="pron-coach-pl">' +
      pillBtn("model", "", PLAY, "practiceListenModel") +
      pillBtn("me", "", PLAY, "practiceListenMe") +
      "</div>" +
      '<p class="pron-coach-heard" role="status" hidden><i></i><span></span></p>' +
      pillBtn(
        "both",
        "pron-coach-both",
        svg('<path d="M5 6v12l7-6zM13 6v12l7-6z"/>', 1),
        "practiceBoth",
      ) +
      pillBtn("rec", "pron-coach-again", MIC, "practiceAgain") +
      "</div>" +
      '<p class="pron-coach-msg" role="status"></p>' +
      '<p class="pron-coach-priv">' +
      svg(
        '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
      ) +
      '<span data-t="practiceLocal"></span></p>';
    const $ = (sel) => root.querySelector(sel);
    root
      .querySelectorAll("[data-t]")
      .forEach((el) => (el.textContent = tt("pronunciation." + el.dataset.t)));
    $(".pron-coach-word").textContent = label ? label.textContent.trim() : "";
    $(".pron-coach-tr").textContent = trEl
      ? trEl.textContent
      : trM
        ? trM[1]
        : "";
    $(".pron-coach-mean").textContent = mean.join(" · ");
    $(".pron-coach-x").setAttribute(
      "aria-label",
      tt("pronunciation.practiceClose"),
    );
    const kicker = $(".pron-coach-kk");
    const lab = $(".pron-coach-lab span");
    const labSmall = $(".pron-coach-lab small");
    const micBtn = $(".pron-coach-mic");
    const sideModel = $(".pron-coach-side");
    const cnt = $(".pron-coach-cnt b");
    const msg = $(".pron-coach-msg");
    const fb = $(".pron-coach-fb");
    const axisEl = $(".pron-coach-axis");
    const lanes = {};
    root.querySelectorAll(".pron-coach-lane").forEach((l) => {
      lanes[l.dataset.k] = {
        cv: l.querySelector("canvas"),
        ph: l.querySelector(".pron-coach-ph"),
        d: l.querySelector("em"),
      };
    });
    document.body.append(scrim, root);
    pill.classList.add("is-live");

    // The word the clip says, and the language to recognise it in: hidden
    // altogether when there is no word, no known language, or no on-device
    // pack for it.
    const expected = label ? label.textContent.trim() : "";
    const speechLang = expected ? speechLangFor(src, location.pathname) : null;
    const heardEl = $(".pron-coach-heard");
    let listenOn = false;
    let listener = null;
    if (speechLang && canListen)
      listenAvailability(speechLang).then((a) => {
        listenOn = a !== "unavailable" && root.isConnected;
      });

    function showHeard(alts, ready) {
      const m = ready ? matchSpoken(alts, expected) : null;
      heardEl.hidden = false;
      heardEl.classList.toggle("is-ok", !!(m && m.ok));
      heardEl.firstChild.innerHTML =
        m && m.ok ? svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>') : "·";
      heardEl.lastChild.textContent = !ready
        ? tt("pronunciation.listenPreparing")
        : m.ok
          ? tt("pronunciation.listenOk", { w: m.heard })
          : m.heard
            ? tt("pronunciation.listenNo", { w: m.heard })
            : tt("pronunciation.listenNothing");
    }

    let model = null;
    let me = null;
    let recorder = null;
    let stream = null;
    let playing = null;
    let raf = 0;
    let axSpan = 0;

    function setState(st) {
      root.dataset.st = st;
      const rec = st === "rec";
      kicker.textContent = tt(
        rec
          ? "pronunciation.practiceRecording"
          : "pronunciation.practiceKicker",
      );
      lab.textContent = tt(
        rec ? "pronunciation.practiceStop" : "pronunciation.practiceRecord",
      );
      labSmall.textContent = tt(
        rec ? "pronunciation.practiceAuto" : "pronunciation.practiceHint",
      );
      micBtn.setAttribute("aria-label", lab.textContent);
      sideModel.disabled = rec;
    }

    /** Redraw both lanes; `at` = {which, frac} puts a playhead on one. */
    function redraw(at) {
      const span = Math.max(
        2,
        Math.ceil(Math.max(model ? model.dur : 0, me ? me.dur : 0) - 0.05),
      );
      const tick = span > 2 ? 1 : 0.5;
      if (span !== axSpan) {
        axSpan = span;
        axisEl.textContent = "";
        for (let t = 0; t <= span + 1e-6; t += tick) {
          const s = document.createElement("span");
          s.textContent =
            t >= span - 1e-6
              ? tt("pronunciation.practiceSecs", { n: num(t, 0) })
              : num(t, 0);
          s.style.left = (t / span) * 100 + "%";
          axisEl.append(s);
        }
      }
      for (const k of ["model", "me"]) {
        const sh = k === "model" ? model : me;
        const L = lanes[k];
        const frac = at && at.which === k ? at.frac : null;
        draw(
          L.cv,
          sh,
          span,
          tick,
          k === "model" ? "--pron-model" : "--garden",
          frac,
        );
        L.ph.hidden = frac == null;
        if (frac != null)
          L.ph.style.left = ((frac * sh.dur) / span) * 100 + "%";
        L.d.textContent = sh ? (sh.live ? "● " : "") + sec(sh.dur) : "";
      }
      root.classList.toggle("has-me", !!me);
    }

    function play(sh, which, rate) {
      return new Promise((resolve) => {
        stopPlaying();
        if (!sh) return resolve();
        const ctx = audioCtx();
        const node = ctx.createBufferSource();
        node.buffer = sh.buf;
        node.playbackRate.value = rate || 1;
        node.connect(ctx.destination);
        const t0 = ctx.currentTime;
        node.start(0, sh.start, sh.dur);
        playing = node;
        const tick = () => {
          if (playing !== node) return;
          redraw({
            which,
            frac: Math.min(1, ((ctx.currentTime - t0) * (rate || 1)) / sh.dur),
          });
          raf = requestAnimationFrame(tick);
        };
        tick();
        node.onended = () => {
          if (playing === node) {
            playing = null;
            cancelAnimationFrame(raf);
            redraw();
          }
          resolve();
        };
      });
    }
    function stopPlaying() {
      if (playing) {
        const node = playing;
        playing = null;
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
      }
      cancelAnimationFrame(raf);
    }

    fetch(src)
      .then((r) =>
        r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status))),
      )
      .then((data) => audioCtx().decodeAudioData(data))
      .then((buf) => {
        model = shape(buf);
        redraw();
      })
      .catch(() => {
        msg.textContent = tt("pronunciation.practiceModelError");
      });

    function stopRecording() {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      if (listener) listener.stop();
    }

    // Records up to MAX_REC s; stops by itself after ~1 s of silence once
    // the reader has started speaking. An analyser drives the level halo,
    // the countdown and the live waveform.
    async function startRecording() {
      stopPlaying();
      msg.textContent = "";
      heardEl.hidden = true;
      // Before any await: installing a language pack needs the click's
      // user activation.
      const listenReady = listenOn ? ensureInstalled(speechLang) : null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        msg.textContent = tt(
          e && e.name === "NotAllowedError"
            ? "pronunciation.practiceDenied"
            : "pronunciation.practiceNoMic",
        );
        return;
      }
      if (!root.isConnected) return stream.getTracks().forEach((t) => t.stop());
      const ctx = audioCtx();
      const input = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      input.connect(an);
      const frame = new Float32Array(an.fftSize);
      const chunks = [];
      const rec = new MediaRecorder(stream);
      recorder = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      let heard = null; // this attempt's listener, once its pack is ready
      let listenSettled = false;
      if (listenReady)
        listenReady.then((ok) => {
          listenSettled = true;
          if (ok && recorder === rec && rec.state === "recording") {
            heard = listener = listen(speechLang, stream && stream.getAudioTracks()[0]);
          }
        });
      rec.onstop = () => {
        cancelAnimationFrame(raf);
        input.disconnect();
        if (heard) heard.stop();
        if (listener === heard) listener = null;
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
        if (!root.isConnected) return;
        if (listenReady) {
          // The recogniser finishes a moment after the recording; give up
          // after 4 s rather than leave the line waiting.
          const timeout = new Promise((r) => setTimeout(() => r(null), 4000));
          if (heard)
            Promise.race([heard.done, timeout]).then(
              (alts) => root.isConnected && showHeard(alts || [], true),
            );
          else if (listenSettled) showHeard([], true);
          else showHeard([], false);
        }
        new Blob(chunks, { type: rec.mimeType || "audio/webm" })
          .arrayBuffer()
          .then((data) => audioCtx().decodeAudioData(data))
          .then((buf) => {
            me = shape(buf);
            setState("cmp");
            redraw();
            const diff = model ? me.dur - model.dur : 0;
            const near = Math.abs(diff) <= 0.25;
            fb.classList.toggle("is-near", near);
            fb.firstChild.innerHTML = near
              ? svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>')
              : "~";
            fb.lastChild.textContent = near
              ? tt("pronunciation.practiceDone")
              : tt(
                  diff > 0
                    ? "pronunciation.practiceLonger"
                    : "pronunciation.practiceShorter",
                  {
                    s: (diff > 0 ? "+" : "−") + sec(Math.abs(diff)),
                  },
                );
            $(".pron-coach-both").focus();
          })
          .catch(() => {
            me = null;
            setState("idle");
            redraw();
            msg.textContent = tt("pronunciation.practiceNoMic");
          });
      };
      me = { peaks: [], dur: 0, live: true };
      setState("rec");
      rec.start();
      const t0 = performance.now();
      let voiced = false;
      let loud = t0;
      let level = 0;
      let left = 0;
      const tick = () => {
        const now = performance.now();
        const el = (now - t0) / 1000;
        an.getFloatTimeDomainData(frame);
        let pk = 0;
        for (let i = 0; i < frame.length; i++)
          pk = Math.max(pk, Math.abs(frame[i]));
        me.peaks.push(pk);
        me.dur = el;
        if (pk > 0.06) {
          voiced = true;
          loud = now;
        }
        level = Math.max(Math.min(1, pk * 2.5), level * 0.88);
        micBtn.style.setProperty("--lv", level.toFixed(2));
        micBtn.style.setProperty(
          "--p",
          Math.min(100, (el / MAX_REC) * 100).toFixed(1) + "%",
        );
        const l = Math.max(0, Math.ceil(MAX_REC - el));
        if (l !== left)
          cnt.textContent = tt("pronunciation.practiceSecs", {
            n: num((left = l), 0),
          });
        redraw({ which: "me", frac: 1 });
        if (el >= MAX_REC || (voiced && now - loud > 1000)) stopRecording();
        else raf = requestAnimationFrame(tick);
      };
      tick();
    }

    function close(now) {
      stopPlaying();
      stopRecording();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      pill.classList.remove("is-live");
      panel = null;
      root.classList.add("is-out");
      scrim.classList.add("is-out");
      const done = () => {
        root.remove();
        scrim.remove();
      };
      if (now || matchMedia("(prefers-reduced-motion: reduce)").matches) done();
      else setTimeout(done, 220);
      if (!now && mic.isConnected) mic.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "Tab") {
        // Keep focus inside the sheet while it is open.
        const f = [...root.querySelectorAll("button:not(:disabled)")].filter(
          (b) => b.offsetParent,
        );
        const first = f[0];
        const last = f[f.length - 1];
        const at = document.activeElement;
        if (e.shiftKey && (at === first || at === root)) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && (at === last || !root.contains(at))) {
          first.focus();
          e.preventDefault();
        }
      }
    }
    function onResize() {
      if (!recorder || recorder.state !== "recording") redraw();
    }

    // Drag the handle (or the word) down to close.
    let drag = null;
    root.addEventListener("pointerdown", (e) => {
      if (
        e.target.closest("button") ||
        !e.target.closest(".pron-coach-grab, .pron-coach-hd")
      )
        return;
      drag = { y: e.clientY, t: e.timeStamp, dy: 0 };
      root.setPointerCapture(e.pointerId);
      root.classList.add("is-drag");
    });
    root.addEventListener("pointermove", (e) => {
      if (!drag) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
      root.style.transform = "translateY(" + drag.dy + "px)";
    });
    const endDrag = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      root.classList.remove("is-drag");
      root.style.transform = "";
      if (d.dy > 90 || (d.dy > 24 && d.dy / (e.timeStamp - d.t) > 0.6)) {
        close();
      }
    };
    root.addEventListener("pointerup", endDrag);
    root.addEventListener("pointercancel", endDrag);
    scrim.addEventListener("click", () => close());

    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]");
      if (!a) return;
      const act = a.dataset.a;
      if (act === "x") close();
      else if (act === "model") play(model, "model");
      else if (act === "slow") play(model, "model", 0.75);
      else if (act === "me") play(me, "me");
      else if (act === "rec") {
        if (recorder && recorder.state === "recording") stopRecording();
        else startRecording();
      } else if (act === "both") {
        play(model, "model")
          .then(() => new Promise((r) => setTimeout(r, 300)))
          .then(() => root.isConnected && play(me, "me"));
      }
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    panel = { close };
    setState("idle");
    redraw();
    root.focus();
  }

  document.addEventListener("click", (e) => {
    const mic = e.target.closest(".pron-mic");
    if (mic) openCoach(mic);
  });
})();
