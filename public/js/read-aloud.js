// "Écouter", fetched as read-aloud.bundle.js by public/js/audio.js the first
// time the reader goes for the button: reads the note aloud, each passage with the voice of its
// language. lib/read-aloud-dom.ts cuts the note into passages (French prose,
// the Chinese in it, a vocabulary table one language per column),
// lib/read-aloud.ts picks a voice per language, lib/read-aloud-player.ts
// plays them in order. Two engines: the system voices (SpeechSynthesis) and
// the natural voice (lib/piper-voice.ts, fetched on demand as
// natural-voice.bundle.js), turned on by the "Voix naturelle" switch or
// picked for one language in "Voix".
//
// While it reads, the relay takes the place of the section title in the
// reading bar (and of "Demander sur cette note…" on a phone): pause inside a
// progress ring cut by language, who reads now and who is next, "Voix" (one
// voice per language of the note), stop. Hidden when the browser has no
// voice at all.
import { speechChunks } from "../../lib/speech-text";
import { notePassages, passageRanges } from "../../lib/read-aloud-dom";
import {
  LANGS,
  VOICE_PREFS_KEY,
  chooseVoice,
  coarseArcs,
  langBadge,
  langColor,
  parseVoicePrefs,
  passageLangs,
  relayAt,
  ringArcs,
  speakTag,
  voiceOptions,
} from "../../lib/read-aloud";
import { createPlayer } from "../../lib/read-aloud-player";

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
  if (!btn || window.__gkReadAloud) return;
  // audio.js stops handing the clicks over once this is set.
  window.__gkReadAloud = true;
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

  const label = btn.querySelector(".audio-label");
  const root = document.documentElement;

  // Reveal the button only when TTS is actually usable.
  btn.hidden = false;

  function tt(k, vars) {
    let s = window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
    for (const [name, v] of Object.entries(vars || {}))
      s = s.replace(`{${name}}`, String(v));
    return s;
  }
  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function langName(code) {
    const ui = (window.__i18n && window.__i18n.locale) || "fr";
    const known = LANGS[code];
    if (ui === "fr" && known) return known.name;
    try {
      const n = new Intl.DisplayNames([ui], { type: "language" }).of(code);
      if (n && n !== code) return n.charAt(0).toUpperCase() + n.slice(1);
    } catch {
      /* a private-use code, an old browser */
    }
    return known ? known.name : code.toUpperCase();
  }

  // ---------------------------------------------------------------- voices
  function naturalOn() {
    try {
      return naturalOk && localStorage.getItem(NATURAL_KEY) === "1";
    } catch {
      return false;
    }
  }
  function readPrefs() {
    try {
      return parseVoicePrefs(localStorage.getItem(VOICE_PREFS_KEY));
    } catch {
      return {};
    }
  }
  function writePrefs(prefs) {
    try {
      localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* private mode: the choice lasts for this page */
    }
  }
  let prefs = readPrefs();
  const systemVoices = () => (synth ? synth.getVoices() : []);
  const optionsFor = (lang) =>
    voiceOptions(
      lang,
      systemVoices(),
      naturalOk,
      synth ? tt("readAloud.device") : undefined,
    );
  const voiceFor = (lang) =>
    chooseVoice(lang, optionsFor(lang), prefs, naturalOn());

  // ----------------------------------------------------------------- state
  let player = null;
  let passages = [];
  let arcs = [];
  // One AudioContext for the whole reading, made in a tap (iOS).
  let ctx = null;
  function ensureCtx() {
    if (!naturalOk) return null;
    // audio.js made one in the tap that fetched this script.
    const early = window.__gkAudioCtx;
    window.__gkAudioCtx = null;
    if ((!ctx || ctx.state === "closed") && early && early.state !== "closed")
      ctx = early;
    else if (early && early !== ctx) void early.close().catch(() => {});
    if (!ctx || ctx.state === "closed") ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    return ctx;
  }
  function dropCtx() {
    const c = ctx;
    ctx = null;
    if (c && c.state !== "closed") void c.close().catch(() => {});
  }

  function setButton(s, pct) {
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
              ? tt("noteActions.audioLoading", { n: pct ?? 0 })
              : tt("noteActions.audioListen");
  }

  // ------------------------------------------------------- the system voice
  // Chrome on a computer silently stops SpeechSynthesis after ~15 seconds; a
  // periodic pause/resume keeps it alive there. Only there: Safari (iOS too)
  // and Android Chrome can stall for good on that pause/resume.
  const ua = navigator.userAgent;
  const needsKeepAlive =
    /Chrome\//.test(ua) && !/Android|Mobile|Edg\//.test(ua);
  let keepAliveId = null;
  function stopKeepAlive() {
    if (keepAliveId) clearInterval(keepAliveId);
    keepAliveId = null;
  }
  function startKeepAlive() {
    stopKeepAlive();
    if (!needsKeepAlive) return;
    keepAliveId = setInterval(() => {
      if (btn.dataset.state !== "playing") return stopKeepAlive();
      synth.pause();
      synth.resume();
    }, 13000);
  }

  // One passage with an installed voice. Chrome silently truncates a single
  // utterance past ~32k characters, and long ones fail silently on some
  // engines (Android, iOS): the text goes in chunks, which SpeechSynthesis
  // queues seamlessly.
  //
  // Why it could never start, handled here:
  // - a cancel() just before speak() makes Safari drop the new utterance:
  //   cancel only what is actually queued;
  // - Chrome keeps speechSynthesis paused across pages (a reading paused,
  //   then the note left) and queues every new utterance behind that pause:
  //   resume() right after speak();
  // - and if nothing has started after a moment, one retry, then an error:
  //   the player tries another voice or moves on, instead of claiming to
  //   read.
  function speakSystem(text, lang, voice, cb, retried) {
    if (!synth) return null;
    const name = voice.id.slice("system:".length);
    const tag = speakTag(lang) || lang;
    const v = systemVoices().find((x) => x.name === name) || null;
    const chunks = speechChunks(text, 900);
    if (synth.speaking || synth.pending) synth.cancel();
    let started = false;
    let over = false;
    const handle = {
      pause() {
        synth.pause();
        stopKeepAlive();
      },
      resume() {
        synth.resume();
        startKeepAlive();
      },
      stop() {
        over = true;
        clearTimeout(watch);
        synth.cancel();
        // A paused engine stays paused after cancel() (Chrome): the next
        // reading would wait behind it.
        synth.resume();
        stopKeepAlive();
      },
    };
    const end = (ok) => {
      if (over) return;
      over = true;
      clearTimeout(watch);
      stopKeepAlive();
      if (ok) cb.onEnd();
      else cb.onError();
    };
    chunks.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      if (v) u.voice = v;
      u.lang = (v && v.lang) || tag;
      u.rate = 1;
      u.pitch = 1;
      u.onstart = () => {
        if (over || started) return;
        started = true;
        startKeepAlive();
        cb.onStart();
      };
      if (i === chunks.length - 1) u.onend = () => end(true);
      u.onerror = (e) => {
        // "interrupted"/"canceled": our own stop or a new reading.
        if (e && (e.error === "interrupted" || e.error === "canceled")) return;
        end(false);
      };
      synth.speak(u);
    });
    synth.resume();
    const watch = setTimeout(() => {
      if (over || started) return;
      if (synth.speaking && !synth.paused) {
        // Speaking without having said so (no start event on some engines).
        started = true;
        startKeepAlive();
        return cb.onStart();
      }
      if (synth.paused && btn.dataset.state === "paused") return;
      synth.cancel();
      synth.resume();
      if (retried) return end(false);
      over = true;
      const again = speakSystem(text, lang, voice, cb, true);
      if (again) Object.assign(handle, again);
      else cb.onError();
    }, 2500);
    return handle;
  }

  // One passage with the natural voice, short chunks so the first one plays
  // soon. Null when it can't load (no network for the first download, no
  // room): the player falls back to an installed voice.
  async function speakNatural(text, lang, _voice, cb) {
    const c = ctx && ctx.state !== "closed" ? ctx : null;
    if (!c) return null;
    const piper = await loadPiper();
    if (!piper || c.state === "closed") return null;
    return piper.readWithPiper({
      ctx: c,
      lang: speakTag(lang) || lang,
      chunks: speechChunks(text, 320),
      keepContext: true,
      onProgress: (pct) => cb.onProgress(pct),
      onPlaying: () => cb.onStart(),
      onEnd: () => cb.onEnd(),
      onError: () => cb.onError(),
    });
  }

  const engines = {};
  if (synth) engines.system = speakSystem;
  if (naturalOk) engines.piper = speakNatural;

  // ------------------------------------------------------------- the relay
  const SVG = "http://www.w3.org/2000/svg";
  const ICONS = {
    pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z",
    play: "M8 5v14l11-7z",
    x: "M6 6l12 12M18 6 6 18",
  };
  function icon(name, stroke) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", ICONS[name]);
    if (stroke) {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
    } else svg.setAttribute("fill", "currentColor");
    svg.appendChild(p);
    return svg;
  }
  function badge(code, cls) {
    const b = h("span", cls || "ra-code", langBadge(code));
    b.style.background = langColor(code);
    return b;
  }

  // The same relay twice: in the reading bar (from 640px) and as a strip
  // above the phone's toolbar. CSS shows the one that fits.
  function buildRelay(cls) {
    const el = h("div", `ra-relay ${cls}`);
    el.hidden = true;
    el.setAttribute("role", "group");
    const toggle = h("button", "ra-toggle");
    toggle.type = "button";
    const ring = document.createElementNS(SVG, "svg");
    ring.setAttribute("class", "ra-ring");
    ring.setAttribute("viewBox", "0 0 40 40");
    ring.setAttribute("aria-hidden", "true");
    const disc = h("span", "ra-disc");
    toggle.append(ring, disc);
    const who = h("button", "ra-who");
    who.type = "button";
    who.setAttribute("aria-haspopup", "dialog");
    const line = h("b", "ra-line");
    const code = badge("fr");
    const name = h("span", "ra-name");
    line.append(code, name);
    const next = h("small", "ra-next");
    who.append(line, next);
    const voix = h("button", "ra-voix");
    voix.type = "button";
    voix.setAttribute("aria-haspopup", "dialog");
    voix.setAttribute("aria-expanded", "false");
    const dots = h("span", "ra-dots");
    dots.setAttribute("aria-hidden", "true");
    voix.append(dots, h("span", "ra-voix-label", tt("readAloud.voices")));
    const stop = h("button", "ra-stop");
    stop.type = "button";
    stop.append(icon("x", true));
    el.append(toggle, who, voix, stop);
    toggle.addEventListener("click", () => player && player.toggle());
    stop.addEventListener("click", () => player && player.stop());
    who.addEventListener("click", () => togglePanel(voix));
    voix.addEventListener("click", () => togglePanel(voix));
    return { el, toggle, ring, disc, who, code, name, next, voix, dots, stop };
  }
  const relays = [];
  const bar = document.querySelector(".note-dock-bar");
  if (bar) {
    const r = buildRelay("ra-in-dock");
    bar.insertBefore(r.el, bar.querySelector(".dock-tools"));
    relays.push(r);
  }
  {
    const r = buildRelay("ra-strip");
    document.body.appendChild(r.el);
    relays.push(r);
  }

  function drawRing(r) {
    r.ring.replaceChildren();
    const g = document.createElementNS(SVG, "g");
    g.setAttribute("transform", "rotate(-90 20 20)");
    arcs.forEach((a, i) => {
      const len = Math.max(a.end - a.start - (arcs.length > 1 ? 1.4 : 0), 0.6);
      const c = document.createElementNS(SVG, "circle");
      c.setAttribute("cx", "20");
      c.setAttribute("cy", "20");
      c.setAttribute("r", "17.5");
      c.setAttribute("pathLength", "100");
      c.setAttribute("stroke", langColor(a.lang));
      c.setAttribute("stroke-dasharray", `${len} ${100 - len}`);
      c.setAttribute("stroke-dashoffset", String(-a.start));
      c.dataset.i = String(i);
      g.appendChild(c);
    });
    r.ring.appendChild(g);
  }

  function paintRelay(snap) {
    const on = snap.state !== "idle" && snap.index >= 0;
    root.toggleAttribute("data-ra", on);
    if (bar) bar.classList.toggle("ra-on", on);
    for (const r of relays) r.el.hidden = !on;
    if (!on) return;
    const p = passages[snap.index];
    const usable = (i) => !!voiceFor(passages[i].lang);
    const { next } = relayAt(passages, snap.index, usable);
    const total = ringArcs(passages);
    const at = total[snap.index] ? total[snap.index].start : 0;
    const paused = snap.state === "paused";
    const voice = snap.voice ? snap.voice.name : "";
    const nextVoice = next ? voiceFor(next) : null;
    const nextText =
      snap.state === "loading" && snap.loading != null
        ? tt("noteActions.audioLoading", { n: snap.loading })
        : next && next !== p.lang && nextVoice
          ? tt("readAloud.then", {
              lang: langName(next).toLowerCase(),
              voice: nextVoice.name,
            })
          : langName(p.lang);
    for (const r of relays) {
      r.toggle.setAttribute(
        "aria-label",
        paused
          ? tt("noteActions.audioAriaPaused")
          : tt("noteActions.audioAriaPlaying"),
      );
      r.disc.replaceChildren(icon(paused ? "play" : "pause"));
      r.code.textContent = langBadge(p.lang);
      r.code.style.background = langColor(p.lang);
      r.name.textContent = voice;
      r.next.textContent = nextText;
      r.who.setAttribute(
        "aria-label",
        `${langName(p.lang)}, ${voice}. ${tt("readAloud.voices")}`,
      );
      r.stop.setAttribute("aria-label", tt("readAloud.stop"));
      r.el.dataset.state = snap.state;
      for (const c of r.ring.querySelectorAll("circle")) {
        const a = arcs[Number(c.dataset.i)];
        c.style.opacity = a.start <= at + 0.01 ? "1" : "0.35";
      }
    }
  }

  // -------------------------------------------------- the passage in the page
  const canHighlight =
    typeof Highlight === "function" && !!(window.CSS && CSS.highlights);
  let hlStyle = null;
  const chip = h("span", "ra-chip");
  chip.hidden = true;
  chip.setAttribute("aria-hidden", "true");
  document.body.appendChild(chip);
  let shownIndex = -1;
  // The reader's own scrolling wins over ours for a while.
  let userScrollAt = 0;
  let ownScrollUntil = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (performance.now() > ownScrollUntil) userScrollAt = performance.now();
    },
    { passive: true },
  );

  function placeChip(ranges, p, snap) {
    const rect = ranges.length ? ranges[0].getClientRects()[0] : null;
    if (!rect || !snap.voice) return (chip.hidden = true);
    chip.replaceChildren(
      badge(p.lang, "ra-code ra-code-s"),
      document.createTextNode(snap.voice.name),
    );
    chip.style.left = `${Math.max(8, rect.left + window.scrollX - 2)}px`;
    chip.style.top = `${rect.top + window.scrollY}px`;
    chip.hidden = false;
  }
  function showPassage(snap) {
    const on = snap.state !== "idle" && snap.index >= 0;
    if (!on) {
      shownIndex = -1;
      chip.hidden = true;
      if (canHighlight) CSS.highlights.delete("ra-now");
      return;
    }
    const p = passages[snap.index];
    const ranges = passageRanges(p);
    if (canHighlight) {
      const color = langColor(p.lang);
      hlStyle ??= document.head.appendChild(h("style"));
      hlStyle.textContent = `::highlight(ra-now){background-color:color-mix(in srgb,${color} 17%,transparent);text-decoration:underline ${color} 2px;text-underline-offset:4px}`;
      CSS.highlights.set("ra-now", new Highlight(...ranges));
    }
    placeChip(ranges, p, snap);
    if (snap.index === shownIndex) return;
    shownIndex = snap.index;
    // Follow the reading, unless the reader has just scrolled somewhere.
    const rect = ranges.length ? ranges[0].getBoundingClientRect() : null;
    if (!rect || performance.now() - userScrollAt < 4000) return;
    if (rect.top > 90 && rect.bottom < window.innerHeight - 170) return;
    ownScrollUntil = performance.now() + 1200;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: rect.top + window.scrollY - window.innerHeight * 0.3,
      behavior: calm ? "auto" : "smooth",
    });
  }
  window.addEventListener("resize", () => {
    if (player && shownIndex >= 0) {
      const snap = player.snapshot();
      if (snap.index >= 0)
        placeChip(
          passageRanges(passages[snap.index]),
          passages[snap.index],
          snap,
        );
    }
  });

  // ------------------------------------------------------------ the reading
  function onChange(snap) {
    setButton(snap.state, snap.loading);
    if (snap.state !== "playing") stopKeepAlive();
    paintRelay(snap);
    showPassage(snap);
    paintPanel();
    if (snap.state === "idle") {
      stopSample();
      dropCtx();
      closePanel();
    }
  }
  function begin() {
    const main = document.getElementById("main");
    if (!main) return;
    // Read where the note is now: translate.js sets `main[lang]` after a
    // translation and replaces the text.
    const base =
      (main.getAttribute("lang") || "fr").toLowerCase().split("-")[0] || "fr";
    const article = main.querySelector("[data-speech-lang]");
    const studied = article ? article.getAttribute("data-speech-lang") : null;
    passages = notePassages(main, base, studied);
    if (!passages.length) return;
    arcs = coarseArcs(ringArcs(passages), 28);
    for (const r of relays) {
      drawRing(r);
      r.dots.replaceChildren(
        ...passageLangs(passages)
          .slice(0, 4)
          .map((code) => {
            const d = h("i");
            d.style.background = langColor(code);
            return d;
          }),
      );
    }
    // In the tap: iOS only lets a page start audio from a gesture.
    if (passageLangs(passages).some((l) => voiceFor(l)?.engine === "piper"))
      ensureCtx();
    player = createPlayer({
      passages,
      voiceFor,
      fallbackFor: (lang, failed) =>
        optionsFor(lang).find(
          (o) => o.id !== failed.id && o.engine === "system",
        ) || null,
      engines,
      onChange,
    });
    player.play();
  }

  btn.addEventListener("click", () => {
    if (player && player.snapshot().state !== "idle") player.toggle();
    else begin();
  });

  // pagehide, not beforeunload: a beforeunload listener can keep the page out
  // of the back/forward cache, and this one fired on every note.
  window.addEventListener("pagehide", () => {
    if (player) player.stop();
    stopSample();
  });

  // Voices load asynchronously on some browsers; trigger a load, and repaint
  // "Voix" when they arrive.
  if (synth && typeof synth.getVoices === "function") {
    synth.getVoices();
    if (typeof synth.addEventListener === "function")
      synth.addEventListener("voiceschanged", () => panel && buildPanelRows());
  }

  // ----------------------------------------------------------------- "Voix"
  let panel = null;
  let scrim = null;
  let opener = null;
  let sample = null;
  function stopSample() {
    const s = sample;
    sample = null;
    if (s) {
      try {
        s.stop();
      } catch {
        /* already over */
      }
    }
  }
  function paintPanel() {
    if (!panel || !player) return;
    const snap = player.snapshot();
    const now = snap.index >= 0 ? passages[snap.index].lang : null;
    for (const row of panel.querySelectorAll(".ra-row")) {
      const on = row.dataset.lang === now;
      row.classList.toggle("is-now", on);
      const st = row.querySelector(".ra-row-state");
      if (st && !row.classList.contains("is-mute"))
        st.textContent = row.classList.contains("is-unset")
          ? tt("readAloud.unread")
          : on
            ? tt("readAloud.now")
            : "";
    }
  }
  function optionLabel(o) {
    return o.engine === "piper"
      ? `${o.name} · ${tt("readAloud.natural")}`
      : `${o.name} · ${tt("readAloud.system")}`;
  }
  function buildPanelRows() {
    const list = panel.querySelector(".ra-rows");
    list.replaceChildren();
    const mute = [];
    for (const lang of passageLangs(passages)) {
      const opts = optionsFor(lang);
      const chosen = voiceFor(lang);
      const row = h("div", "ra-row");
      row.dataset.lang = lang;
      row.style.setProperty("--ra-c", langColor(lang));
      const name = h("span", "ra-row-name");
      name.append(h("b", "", langName(lang)), h("span", "ra-row-state"));
      row.append(badge(lang), name);
      if (!opts.length) {
        row.classList.add("is-mute");
        name.lastChild.textContent = tt("readAloud.none");
        mute.push(langName(lang));
      } else {
        const sel = h("select", "ra-select");
        sel.setAttribute(
          "aria-label",
          tt("readAloud.voiceFor", { lang: langName(lang) }),
        );
        if (!chosen) {
          // Voices exist (the natural one, to download) but none is picked:
          // the passages are skipped until the reader chooses.
          row.classList.add("is-unset");
          const none = h("option", "", tt("readAloud.pick"));
          none.value = "";
          sel.appendChild(none);
        }
        for (const o of opts) {
          const op = h("option", "", optionLabel(o));
          op.value = o.id;
          sel.appendChild(op);
        }
        sel.value = chosen ? chosen.id : "";
        sel.addEventListener("change", () => {
          if (!sel.value) return;
          prefs = { ...readPrefs(), [lang]: sel.value };
          writePrefs(prefs);
          // A tap: the natural voice may need its audio context now.
          if (sel.value === "piper") ensureCtx();
          stopSample();
          if (player) player.voiceChanged(lang);
          buildPanelRows();
        });
        const hear = h("button", "ra-hear");
        hear.type = "button";
        hear.append(icon("play"));
        hear.setAttribute(
          "aria-label",
          tt("readAloud.sample", {
            voice: chosen ? chosen.name : langName(lang),
          }),
        );
        hear.disabled = !chosen;
        hear.addEventListener("click", () => playSample(lang));
        row.append(sel, hear);
      }
      list.appendChild(row);
    }
    const note = panel.querySelector(".ra-mute-note");
    note.hidden = !mute.length;
    note.textContent = mute.length
      ? tt("readAloud.skipped", { langs: mute.join(", ") })
      : "";
    paintPanel();
  }
  // A few words of the note in that language, with its voice.
  function playSample(lang) {
    const voice = voiceFor(lang);
    const p = passages.find((x) => x.lang === lang);
    if (!voice || !p || !engines[voice.engine]) return;
    if (player && player.snapshot().state === "playing") player.pause();
    stopSample();
    if (voice.engine === "piper") ensureCtx();
    const text = speechChunks(p.text, 140)[0] || p.text;
    const mine = {};
    sample = mine;
    const done = () => {
      if (sample === mine || sample === mine.handle) sample = null;
    };
    Promise.resolve(
      engines[voice.engine](text, lang, voice, {
        onStart() {},
        onEnd: done,
        onError: done,
        onProgress() {},
      }),
    ).then((handle) => {
      if (sample !== mine) return handle && handle.stop();
      mine.handle = handle;
      sample = handle;
    }, done);
  }
  function closePanel() {
    if (!panel) return;
    stopSample();
    panel.remove();
    scrim.remove();
    panel = scrim = null;
    for (const r of relays) r.voix.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey);
    if (opener && opener.isConnected && !opener.closest("[hidden]"))
      opener.focus();
    opener = null;
  }
  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePanel();
    }
  }
  function togglePanel(from) {
    if (panel) return closePanel();
    if (!player) return;
    opener = from;
    scrim = h("div", "ra-scrim");
    scrim.addEventListener("click", closePanel);
    panel = h("div", "ra-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", tt("readAloud.panelTitle"));
    panel.tabIndex = -1;
    const head = h("div", "ra-panel-head");
    const close = h("button", "ra-close");
    close.type = "button";
    close.setAttribute("aria-label", tt("readAloud.close"));
    close.append(icon("x", true));
    close.addEventListener("click", closePanel);
    head.append(h("h2", "ra-panel-h", tt("readAloud.panelTitle")), close);
    const sub = h("p", "ra-panel-sub", tt("readAloud.panelSub"));
    const rows = h("div", "ra-rows");
    const note = h("p", "ra-mute-note");
    note.hidden = true;
    const foot = h("p", "ra-panel-foot", tt("readAloud.local"));
    panel.append(head, sub, rows, note, foot);
    document.body.append(scrim, panel);
    buildPanelRows();
    for (const r of relays) r.voix.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", onKey);
    panel.focus();
  }

  // "Voix naturelle": a switch in "Affichage". Turning it on downloads the
  // voice of the note's language right away (its progress on the switch);
  // turning it off deletes the downloaded voices.
  function currentLang() {
    const main = document.getElementById("main");
    return ((main && main.getAttribute("lang")) || "fr").toLowerCase();
  }
  const sw = document.querySelector(".voice-btn");
  if (sw && naturalOk) {
    const swLabel = sw.querySelector(".voice-label");
    const paintSwitch = (pct) => {
      sw.setAttribute("aria-checked", naturalOn() ? "true" : "false");
      if (swLabel)
        swLabel.textContent =
          pct == null
            ? tt("noteActions.voiceNatural")
            : tt("noteActions.audioLoading", { n: pct });
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
      if (player) player.stop();
      if (!on) {
        // The voices are deleted: a language that had picked one goes back
        // to its default instead of downloading it again unasked.
        prefs = Object.fromEntries(
          Object.entries(readPrefs()).filter(([, id]) => id !== "piper"),
        );
        writePrefs(prefs);
      }
      paintSwitch();
      const piper = await loadPiper();
      if (on) {
        const lang = currentLang();
        const rate = piper
          ? await piper.loadPiperVoice(
              lang,
              (pct) => naturalOn() && paintSwitch(pct),
            )
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
          if (swLabel)
            swLabel.textContent = tt("noteActions.voiceNaturalFailed");
          return;
        }
        paintSwitch();
      } else if (piper) {
        await piper.deletePiperVoices();
      }
    });
  }
})();
