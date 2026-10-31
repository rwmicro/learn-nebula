// Article translation widget. Renders a target-language menu next to the
// "translate" button; picking a language hits /api/translate with the source
// Markdown, swaps .article-body's HTML with the rendered translation, and
// caches the result in localStorage keyed by {pathname, targetLang, content
// hash}. A second pick (or hit on the same target) is instant.
//
// On-device first: where Chrome's built-in Translator API covers the pair
// (desktop Chrome 138+), the note is translated in the browser, text node by
// text node in the already-rendered HTML — no server call, no LLM cost, and
// code, formulas and pronunciation words are left alone. A note under the
// button says so and offers the server's (better) translation. Anywhere else,
// or on any failure, the server path below runs as before.
// Where the Translator API can't help, the device's own model writes the
// translation (lib/garden-ai.ts: Gemini Nano, or the downloaded LFM3), one
// block of the rendered note at a time, in place: the card above the body
// counts the sections, the block being translated is marked and the ones not
// done yet stay greyed. With neither, the button opens the
// download (or "not available here") sheet of components/GardenChat.tsx. The
// server's translation only runs while SERVER_LLM_OFFERED is on.
// LanguageDetector (lib/browser-ai.ts) also checks, when its model is already
// there, whether the note is in a language other than the reader's, and
// highlights the button if so.
import { detectLanguage, promptAvailable } from "../../lib/browser-ai.ts";
import { SERVER_LLM_OFFERED, deviceWord, localModelLangs } from "../../lib/garden-ai-flags.ts";

// The model side (lib/garden-ai.ts, lib/local-llm.ts) is its own bundle,
// translate-device.bundle.js, fetched on the first translation that needs it:
// most readers never translate, and it would weigh on every note.
let devicePromise = null;
function loadDevice() {
  devicePromise ??= new Promise((resolve) => {
    if (window.__gkTranslateDevice) return resolve(window.__gkTranslateDevice);
    const s = document.createElement("script");
    s.src = "/js/translate-device.bundle.js";
    s.onload = () => resolve(window.__gkTranslateDevice || null);
    s.onerror = () => {
      devicePromise = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return devicePromise;
}

(function () {
  const wrap = document.querySelector(".translate-wrap");
  if (!wrap) return;
  const btn = wrap.querySelector(".translate-btn");
  const menu = wrap.querySelector(".translate-menu"); // container (toggles hidden)
  const list = wrap.querySelector(".translate-menu-list"); // scrolling <ul>
  const filter = wrap.querySelector(".translate-filter");
  if (!btn || !menu || !list) return;
  const sourceEl = document.getElementById("article-source");
  const articleBody = document.querySelector(".article-body");
  if (!sourceEl || !articleBody) return;

  let source;
  try {
    source = JSON.parse(sourceEl.textContent || "{}");
  } catch {
    return;
  }
  if (!source.markdown) return;

  const sourceLang = btn.dataset.sourceLang;
  const label = btn.querySelector(".translate-label");

  function tt(k, vars) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k, vars) : k;
  }

  // Resolve display names from the active UI locale and re-sort the menu
  // alphabetically in that locale. Re-runs on every locale change so the
  // order follows the user's reading direction (e.g. "Allemand" before
  // "Anglais" in FR; "German" between "French" and "Greek" in EN).
  function fillMenuLabels() {
    const ui =
      (window.__i18n && (window.__i18n.locale || window.__i18n.defaultLocale)) ||
      "fr";
    let dn;
    try {
      dn = new Intl.DisplayNames([ui], { type: "language" });
    } catch {
      return;
    }
    const items = Array.from(list.querySelectorAll("li"));
    const collator = new Intl.Collator(ui, { sensitivity: "base" });
    items.forEach((li) => {
      const item = li.querySelector(".translate-menu-item");
      const code = item && item.dataset.targetLang;
      if (!code) return;
      const name = dn.of(code) || code;
      item.textContent = name;
      li.dataset.sortKey = name;
    });
    items.sort((a, b) =>
      collator.compare(a.dataset.sortKey || "", b.dataset.sortKey || ""),
    );
    // Re-append in sorted order; appendChild moves the existing node so we
    // don't re-create DOM, which preserves click listeners on items.
    items.forEach((li) => list.appendChild(li));
    // Keep an open, filtered menu consistent after a locale change.
    if (!menu.hidden && typeof applyFilter === "function") applyFilter();
  }
  fillMenuLabels();
  document.addEventListener("i18n:change", fillMenuLabels);

  // Content hash (shared djb2 from app/layout.tsx's bootstrap) for cache keying.
  const contentHash = window.__i18n.hash(source.markdown);
  function cacheKeyFor(lang) {
    return `translate:${location.pathname}:${lang}:${contentHash}`;
  }

  // Wipe older cache entries (different content hashes) for any target lang
  // of this article — keeps localStorage from growing across edits.
  try {
    const prefix = `translate:${location.pathname}:`;
    const fresh = new Set(
      Array.from(list.querySelectorAll(".translate-menu-item")).map(
        (it) => cacheKeyFor(it.dataset.targetLang),
      ),
    );
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && !fresh.has(k)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }

  const originalHtml = articleBody.innerHTML;

  // The translation is re-rendered in the Worker runtime, where the vault isn't
  // on disk, so relative asset refs (e.g. ![](sources/images/x.gif)) can't be
  // resolved to /vault/… and come back broken. The original render already has
  // them resolved, so map basename → resolved URL and re-point the translated
  // copy client-side (images, videos, and asset links like PDFs).
  const assetMap = new Map();
  const baseName = (u) =>
    decodeURIComponent((u.split("/").pop() || "").split(/[?#]/)[0]).toLowerCase();
  articleBody
    .querySelectorAll(
      'img[src^="/vault/"], source[src^="/vault/"], video[src^="/vault/"], ' +
        'a[href^="/vault/"], button.pron-btn[data-pron-src^="/vault/"]',
    )
    .forEach((el) => {
      const url =
        el.getAttribute("src") ||
        el.getAttribute("href") ||
        el.getAttribute("data-pron-src") ||
        "";
      const file = baseName(url);
      if (file && !assetMap.has(file)) assetMap.set(file, url);
    });
  function fixRelativeAssets(root) {
    if (!assetMap.size) return;
    const repoint = (el, attr) => {
      const v = el.getAttribute(attr);
      // Leave absolute, remote and already-resolved refs untouched.
      if (!v || /^(https?:|data:|mailto:|tel:|#|\/)/i.test(v)) return;
      const hit = assetMap.get(baseName(v));
      if (hit) el.setAttribute(attr, hit);
    };
    root
      .querySelectorAll("img[src], source[src], video[src]")
      .forEach((el) => repoint(el, "src"));
    root.querySelectorAll("a[href]").forEach((el) => repoint(el, "href"));
    root
      .querySelectorAll("button.pron-btn[data-pron-src]")
      .forEach((el) => repoint(el, "data-pron-src"));
  }
  // --- on-device translation (Translator API) ------------------------------
  const hasTranslator = "Translator" in self;
  // Text inside these stays as written: code, maths, figures, the word a
  // pronunciation clip says, and anything the author marked translate="no".
  const KEEP =
    "pre, code, kbd, samp, script, style, svg, math, .katex, .katex-display, " +
    ".pron-label, .pron-tr, [translate='no'], .notranslate, .mermaid";

  async function deviceTranslator(targetLang, onDownload) {
    if (!hasTranslator || !sourceLang) return null;
    const pair = { sourceLanguage: sourceLang, targetLanguage: targetLang };
    try {
      const a = await self.Translator.availability(pair);
      if (a === "unavailable") return null;
      return await self.Translator.create({
        ...pair,
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => onDownload(e.loaded));
        },
      });
    } catch {
      return null;
    }
  }

  // Translate a copy of the original render, one text node at a time (the API
  // takes plain text, so markup can't be handed to it), keeping each node's
  // surrounding whitespace. Returns the HTML, or null on any failure.
  async function translateOnDevice(targetLang) {
    const translator = await deviceTranslator(targetLang, (f) => {
      if (label) label.textContent = tt("noteActions.translateDownloading", { n: Math.round(f * 100) });
    });
    if (!translator) return null;
    const box = document.createElement("div");
    box.innerHTML = originalHtml;
    const nodes = [];
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!/\p{L}/u.test(n.data)) continue;
      const parent = n.parentElement;
      if (parent && parent.closest(KEEP)) continue;
      nodes.push(n);
    }
    try {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.data);
        const out = await translator.translate(m[2]);
        n.data = m[1] + out + m[3];
        if (label && i % 8 === 0)
          label.textContent = tt("noteActions.translateProgress", {
            n: Math.round((100 * (i + 1)) / nodes.length),
          });
      }
      return box.innerHTML;
    } catch {
      return null;
    } finally {
      try {
        if (translator.destroy) translator.destroy();
      } catch {
        /* ignore */
      }
    }
  }

  // "Traduit sur ton appareil · Meilleure traduction" / "Traduit par le
  // serveur", just above the body (a <div>: the dropcap rule targets the
  // body's first <p>). Removed with the translation.
  let viaNote = null;
  function showVia(device, targetLang) {
    if (viaNote) viaNote.remove();
    viaNote = document.createElement("div");
    viaNote.className = "translate-via";
    viaNote.setAttribute("role", "note");
    viaNote.setAttribute("data-pagefind-ignore", "");
    const text = document.createElement("span");
    const key = device ? "noteActions.translateViaDevice" : "noteActions.translateViaServer";
    text.textContent = tt(key);
    text.setAttribute("data-i18n", key);
    viaNote.append(text);
    if (device && SERVER_LLM_OFFERED) {
      const better = document.createElement("button");
      better.type = "button";
      better.className = "translate-via-better";
      better.textContent = tt("noteActions.translateBetter");
      better.setAttribute("data-i18n", "noteActions.translateBetter");
      better.addEventListener("click", () => {
        if (!pending) translateOnServer(targetLang);
      });
      viaNote.append(" · ", better);
    }
    articleBody.before(viaNote);
  }
  function hideVia() {
    hidePill();
    if (viaNote) viaNote.remove();
    viaNote = null;
  }

  // --- on-device translation (the device's model) --------------------------
  // Leaf blocks of the rendered note, each sent to the model on its own. Inline
  // markup is swapped for short tags (<t0>…</t0> keeps the text inside to
  // translate, <k0></k0> stands for something kept as is: code, maths, a
  // pronunciation word), so the model never sees long attributes, and the
  // original elements are put back around its words.
  const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, td, th, figcaption, dt, dd, summary";
  function leafBlocks(root) {
    return Array.from(root.querySelectorAll(BLOCKS)).filter(
      (el) =>
        !el.closest(KEEP) && !el.querySelector(BLOCKS) && /\p{L}/u.test(el.textContent || ""),
    );
  }
  const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function encodeBlock(el) {
    const shells = [];
    const kept = [];
    const walk = (node) => {
      let out = "";
      for (const c of node.childNodes) {
        if (c.nodeType === 3) out += escText(c.data);
        else if (c.nodeType === 1) {
          if (c.matches(KEEP) || !/\p{L}/u.test(c.textContent || "")) {
            out += `<k${kept.length}></k${kept.length}>`;
            kept.push(c);
          } else {
            const i = shells.length;
            shells.push(c);
            out += `<t${i}>${walk(c)}</t${i}>`;
          }
        }
      }
      return out;
    };
    return { text: walk(el), shells, kept };
  }
  // The model's fragment back into nodes; null when a tag went missing or
  // was made up (the block then stays as written).
  function decodeBlock(text, shells, kept) {
    const tpl = document.createElement("template");
    tpl.innerHTML = text.replace(/^```\w*\s*|\s*```$/g, "").trim();
    const seen = new Set();
    let ok = true;
    const build = (src, dest) => {
      for (const c of Array.from(src.childNodes)) {
        if (c.nodeType === 3) dest.append(c.data);
        else if (c.nodeType === 1) {
          const m = /^([tk])(\d+)$/.exec(c.localName);
          const key = m && m[0];
          const orig = m && (m[1] === "t" ? shells : kept)[Number(m[2])];
          if (!orig || seen.has(key)) {
            ok = false;
            continue;
          }
          seen.add(key);
          if (m[1] === "k") dest.append(orig.cloneNode(true));
          else {
            const shell = orig.cloneNode(false);
            build(c, shell);
            dest.append(shell);
          }
        }
      }
    };
    const frag = document.createDocumentFragment();
    build(tpl.content, frag);
    if (!ok || seen.size !== shells.length + kept.length) return null;
    if (!/\p{L}/u.test(frag.textContent || "")) return null;
    return frag;
  }

  const langName = (code, ui) => {
    try {
      return new Intl.DisplayNames([ui], { type: "language" }).of(code) || code;
    } catch {
      return code;
    }
  };
  const uiLocale = () =>
    (window.__i18n && (window.__i18n.locale || window.__i18n.defaultLocale)) || "fr";
  const VIA_LOCAL = ":local";
  const onPhone = () => deviceWord() === "phone";
  function setMainLang(lang) {
    const main = document.getElementById("main");
    if (!main) return;
    if (lang) main.setAttribute("lang", lang);
    else if (sourceLang === "en") main.setAttribute("lang", "en");
    else main.removeAttribute("lang");
  }

  // The card above the body. While the model runs: "Traduction en amharique…",
  // "Arrêter", a bar with one segment per section and "Section 3 sur 7"; once
  // the card has scrolled away, a pill under the top bar keeps the count and
  // the stop button. Then "Traduit en amharique" with an [amharique | Original]
  // switch that swaps the two without translating again.
  const GLOBE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>';
  const CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>';
  let localAbort = null;
  let pill = null;
  let pillObserver = null;
  let toast = null;
  let toastTimer = null;
  // The finished translation (for the switch) and what a "Réessayer" needs.
  let translatedHtml = null;
  let lastRun = null;

  function cardShell(state, icon, title, sub) {
    hideVia();
    viaNote = document.createElement("div");
    viaNote.className = "translate-local";
    viaNote.dataset.state = state;
    viaNote.setAttribute("data-pagefind-ignore", "");
    viaNote.innerHTML = `<div class="tl-row">${icon}<div class="tl-text"><b></b><span></span></div></div>`;
    viaNote.querySelector("b").textContent = title;
    viaNote.querySelector(".tl-text span").textContent = sub;
    articleBody.before(viaNote);
    return viaNote;
  }

  function showRunningCard(targetLang, total) {
    const name = langName(targetLang, uiLocale());
    const card = cardShell(
      "running",
      GLOBE,
      tt("noteActions.translateRunning", { lang: name }),
      tt(onPhone() ? "noteActions.translatePrivatePhone" : "noteActions.translatePrivateDevice"),
    );
    const stop = document.createElement("button");
    stop.type = "button";
    stop.className = "tl-stop";
    stop.textContent = tt("noteActions.translateStop");
    stop.addEventListener("click", restoreOriginal);
    card.querySelector(".tl-row").append(stop);
    const bar = document.createElement("div");
    bar.className = "tl-bar";
    bar.setAttribute("aria-hidden", "true");
    for (let i = 0; i < total; i++) bar.append(document.createElement("i"));
    const count = document.createElement("div");
    count.className = "tl-count";
    count.setAttribute("role", "status");
    card.append(bar, count);

    pill = document.createElement("div");
    pill.className = "translate-pill";
    pill.hidden = true;
    pill.setAttribute("data-pagefind-ignore", "");
    pill.innerHTML =
      '<span class="tl-ring" aria-hidden="true"></span><span><b></b> · <span></span></span><button type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button>';
    pill.querySelector("b").textContent = name;
    const x = pill.querySelector("button");
    x.setAttribute("aria-label", tt("noteActions.translateStop"));
    x.addEventListener("click", restoreOriginal);
    document.body.append(pill);
    if ("IntersectionObserver" in window) {
      pillObserver = new IntersectionObserver(([e]) => {
        if (pill) pill.hidden = e.isIntersecting || e.boundingClientRect.top > 0;
      });
      pillObserver.observe(card);
    }
  }

  function setProgress(done, total) {
    if (!viaNote || viaNote.dataset.state !== "running") return;
    viaNote.querySelectorAll(".tl-bar i").forEach((seg, i) => {
      seg.className = i < done ? "is-done" : i === done ? "is-now" : "";
    });
    const text = tt("noteActions.translateSection", { n: Math.min(done + 1, total), total });
    viaNote.querySelector(".tl-count").textContent = text;
    if (pill) {
      pill.querySelector("b + span").textContent = text;
      pill.style.setProperty("--p", `${Math.round((done / total) * 100)}%`);
    }
  }

  function hidePill() {
    if (pillObserver) pillObserver.disconnect();
    pillObserver = null;
    if (pill) pill.remove();
    pill = null;
  }

  function showDoneCard(targetLang) {
    hidePill();
    const name = langName(targetLang, uiLocale());
    const card = cardShell(
      "done",
      CHECK,
      tt("noteActions.translateDone", { lang: name }),
      tt(onPhone() ? "noteActions.translateKeptPhone" : "noteActions.translateKeptDevice"),
    );
    const sw = document.createElement("div");
    sw.className = "tl-switch";
    sw.setAttribute("role", "group");
    let own = name;
    try {
      own = new Intl.DisplayNames([targetLang], { type: "language" }).of(targetLang) || name;
    } catch {
      /* keep the UI's name */
    }
    const toLang = document.createElement("button");
    toLang.type = "button";
    toLang.lang = targetLang;
    toLang.textContent = own;
    const toOrig = document.createElement("button");
    toOrig.type = "button";
    toOrig.textContent = tt("noteActions.translateOriginal");
    const press = (translated) => {
      toLang.setAttribute("aria-pressed", String(translated));
      toOrig.setAttribute("aria-pressed", String(!translated));
    };
    press(true);
    toLang.addEventListener("click", () => {
      if (toLang.getAttribute("aria-pressed") === "true" || !translatedHtml) return;
      articleBody.innerHTML = translatedHtml;
      fixRelativeAssets(articleBody);
      setMainLang(targetLang);
      press(true);
    });
    toOrig.addEventListener("click", () => {
      if (toOrig.getAttribute("aria-pressed") === "true") return;
      translatedHtml = articleBody.innerHTML;
      articleBody.innerHTML = originalHtml;
      setMainLang(null);
      press(false);
    });
    sw.append(toLang, toOrig);
    card.append(sw);
  }

  // "Note traduite · 7 sections · Annuler", a few seconds above the bottom bar.
  function showToast(total) {
    hideToast();
    toast = document.createElement("div");
    toast.className = "translate-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("data-pagefind-ignore", "");
    const text = document.createElement("span");
    text.textContent = tt("noteActions.translateFinished", { total });
    const undo = document.createElement("button");
    undo.type = "button";
    undo.textContent = tt("noteActions.translateUndo");
    undo.addEventListener("click", restoreOriginal);
    toast.append(text, undo);
    document.body.append(toast);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    if (toast) toast.remove();
    toast = null;
  }

  // The body as it is kept: without the "couldn't translate" notes, whose
  // retry only works in the page that made them.
  function saveLocal(targetLang) {
    translatedHtml = articleBody.innerHTML;
    const copy = articleBody.cloneNode(true);
    copy.querySelectorAll(".translate-failed-note").forEach((n) => n.remove());
    copy.querySelectorAll(".translate-failed").forEach((n) => n.classList.remove("translate-failed"));
    try {
      localStorage.setItem(cacheKeyFor(targetLang), copy.innerHTML);
      localStorage.setItem(cacheKeyFor(targetLang) + VIA_LOCAL, "1");
    } catch {
      /* quota exceeded */
    }
  }

  // One block through the model; false when it gave nothing back.
  async function translateBlock(el, signal) {
    const { device, route, system, targetLang } = lastRun;
    const { text, shells, kept } = encodeBlock(el);
    const out = await device.generateOnDevice({
      route,
      system,
      prompt: text,
      lang: targetLang,
      maxTokens: Math.min(2048, Math.ceil(text.length / 2) + 64),
      signal,
    });
    if (out == null) return false;
    const frag = decodeBlock(out, shells, kept);
    if (frag) el.replaceChildren(frag);
    return true;
  }

  function markFailed(el) {
    el.classList.add("translate-failed");
    const note = document.createElement("div");
    note.className = "translate-failed-note";
    note.setAttribute("data-pagefind-ignore", "");
    note.textContent = tt("noteActions.translateBlockFailed") + " · ";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "translate-retry";
    retry.textContent = tt("noteActions.translateRetry");
    note.append(retry);
    el.after(note);
  }

  articleBody.addEventListener("click", async (e) => {
    const retry = e.target.closest(".translate-retry");
    if (!retry || !lastRun || localAbort) return;
    const note = retry.closest(".translate-failed-note");
    const el = note && note.previousElementSibling;
    if (!el) return;
    retry.disabled = true;
    el.classList.add("translate-now");
    el.dataset.trLabel = tt("noteActions.translateCurrent");
    let ok = false;
    try {
      ok = await translateBlock(el, new AbortController().signal);
    } catch {
      /* the model failed again */
    }
    el.classList.remove("translate-now");
    delete el.dataset.trLabel;
    if (!ok) {
      retry.disabled = false;
      return;
    }
    el.classList.remove("translate-failed");
    if (el.classList.length === 0) el.removeAttribute("class");
    note.remove();
    saveLocal(lastRun.targetLang);
  });

  // Translate the note in place on the device's model. Resolves true when
  // done, false when the model couldn't run; an abort ("Arrêter") rejects.
  async function translateLocally(device, route, targetLang) {
    articleBody.innerHTML = originalHtml;
    fixRelativeAssets(articleBody);
    const blocks = leafBlocks(articleBody);
    if (!blocks.length) return false;
    // Section of each block: how many h2 came before it.
    const sec = [];
    let n = 0;
    for (const b of blocks) {
      if (b.localName === "h2" && sec.length) n++;
      sec.push(n);
    }
    const total = n + 1;
    blocks.forEach((b) => b.classList.add("translate-pending"));
    setMainLang(targetLang);
    activeTarget = targetLang;
    showRunningCard(targetLang, total);
    setProgress(0, total);
    const system = device.translateSystem(langName(sourceLang || "fr", "fr"), langName(targetLang, "fr"));
    lastRun = { device, route, system, targetLang };
    localAbort = new AbortController();
    const signal = localAbort.signal;
    const nowLabel = tt("noteActions.translateCurrent");
    for (let i = 0; i < blocks.length; i++) {
      const el = blocks[i];
      el.classList.replace("translate-pending", "translate-now");
      el.dataset.trLabel = nowLabel;
      const ok = await translateBlock(el, signal);
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      el.classList.remove("translate-now");
      delete el.dataset.trLabel;
      if (!ok) {
        if (i === 0) {
          localAbort = null;
          return false;
        }
        markFailed(el);
      }
      if (el.classList.length === 0) el.removeAttribute("class");
      if (blocks[i + 1]) setProgress(sec[i + 1], total);
    }
    localAbort = null;
    saveLocal(targetLang);
    showDoneCard(targetLang);
    showToast(total);
    return true;
  }

  // Light hint: if the note reads as another language than the reader's
  // (only when the detector's model is already on this device: no download
  // on a page load), the button is marked so it stands out.
  (async () => {
    const ui = (window.__i18n && (window.__i18n.locale || window.__i18n.defaultLocale)) || "fr";
    const lang = await detectLanguage((articleBody.textContent || "").slice(0, 2500), {
      allowDownload: false,
      minConfidence: 0.85,
      minChars: 200,
    });
    if (!lang || lang === ui.slice(0, 2) || btn.dataset.state !== "idle") return;
    btn.classList.add("is-suggested");
    let name = lang;
    try {
      name = new Intl.DisplayNames([ui], { type: "language" }).of(lang) || lang;
    } catch {
      /* keep the code */
    }
    btn.title = tt("noteActions.translateSuggest", { lang: name });
  })();

  const labels = {
    get idle() {
      return tt("noteActions.translate");
    },
    get loading() {
      return tt("noteActions.translateLoading");
    },
    get slow() {
      return tt("noteActions.translateSlow");
    },
    get translated() {
      return tt("noteActions.translateShowOriginal");
    },
  };
  let slowTimer = null;
  let pending = false;
  // Track which language we're currently displaying so revert knows what to
  // do and so subsequent clicks (e.g. for cache) know the active target.
  let activeTarget = null;

  function setState(state) {
    btn.dataset.state = state;
    if (label) label.textContent = labels[state] || labels.idle;
    btn.disabled = state === "loading";
    btn.setAttribute(
      "aria-label",
      state === "translated"
        ? tt("noteActions.translateAriaShowOriginal")
        : state === "loading"
          ? tt("noteActions.translateAriaLoading")
          : tt("noteActions.translateAriaIdle"),
    );
  }

  function applyTranslation(html, targetLang) {
    hideVia();
    articleBody.innerHTML = html;
    fixRelativeAssets(articleBody);
    setMainLang(targetLang);
    activeTarget = targetLang;
    setState("translated");
  }

  function restoreOriginal() {
    if (localAbort) localAbort.abort();
    localAbort = null;
    hideVia();
    hideToast();
    articleBody.innerHTML = originalHtml;
    setMainLang(null);
    activeTarget = null;
    translatedHtml = null;
    setState("idle");
  }

  // "No match" hint, revealed when the filter empties the list.
  const noMatch = document.createElement("p");
  noMatch.className = "translate-menu-empty";
  noMatch.hidden = true;
  noMatch.textContent = tt("noteActions.translateNoMatch");
  noMatch.setAttribute("data-i18n", "noteActions.translateNoMatch");
  list.after(noMatch);

  const foldText = (s) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();

  function applyFilter() {
    const q = foldText((filter && filter.value ? filter.value : "").trim());
    let visible = 0;
    list.querySelectorAll("li").forEach((li) => {
      const name = foldText(li.dataset.sortKey || li.textContent || "");
      const hit = !li.dataset.unsupported && (!q || name.includes(q));
      li.hidden = !hit;
      if (hit) visible++;
    });
    noMatch.hidden = visible > 0;
  }

  // Only the languages something on this device can translate into: the
  // downloaded model's own (lib/garden-ai-flags.ts), then, once the menu is
  // first opened, the ones Chrome's Translator or Gemini Nano say they cover.
  function markSupport(li, ok) {
    if (ok) delete li.dataset.unsupported;
    else li.dataset.unsupported = "1";
    li.hidden = !ok;
  }
  if (!SERVER_LLM_OFFERED) {
    const model = new Set(localModelLangs());
    list.querySelectorAll("li").forEach((li) => {
      const it = li.querySelector(".translate-menu-item");
      markSupport(li, !!it && model.has(it.dataset.targetLang));
    });
  }
  let supportChecked = false;
  function checkSupport() {
    if (supportChecked || SERVER_LLM_OFFERED) return;
    supportChecked = true;
    const hasNano = "LanguageModel" in self;
    if (!hasTranslator && !hasNano) return;
    list.querySelectorAll("li[data-unsupported]").forEach(async (li) => {
      const lang = li.querySelector(".translate-menu-item").dataset.targetLang;
      let ok = false;
      if (hasTranslator && sourceLang) {
        try {
          const a = await self.Translator.availability({ sourceLanguage: sourceLang, targetLanguage: lang });
          ok = a !== "unavailable";
        } catch {
          /* not this pair */
        }
      }
      if (!ok && hasNano) ok = await promptAvailable(lang);
      if (ok) {
        markSupport(li, true);
        if (!menu.hidden) applyFilter();
      }
    });
  }

  function menuItems() {
    // Only rows the filter currently shows — keyboard nav skips hidden ones.
    return Array.from(list.querySelectorAll(".translate-menu-item")).filter(
      (it) => !it.closest("li").hidden,
    );
  }
  function focusItem(i) {
    const items = menuItems();
    if (!items.length) return;
    items[((i % items.length) + items.length) % items.length].focus();
  }
  function openMenu() {
    checkSupport();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    if (filter) {
      filter.value = "";
      applyFilter();
      requestAnimationFrame(() => filter.focus());
    } else {
      requestAnimationFrame(() => focusItem(0));
    }
  }
  function closeMenu(returnFocus) {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (returnFocus) btn.focus();
  }

  if (filter) {
    filter.addEventListener("input", applyFilter);
    filter.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusItem(0);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const items = menuItems();
        if (items.length) items[0].click();
      }
    });
  }

  // Outside click / escape close the menu.
  document.addEventListener("click", (e) => {
    if (menu.hidden) return;
    if (!wrap.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) closeMenu(true);
  });

  // Arrow-key roving focus between languages (Home/End jump to ends).
  list.addEventListener("keydown", (e) => {
    const items = menuItems();
    const idx = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(idx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(idx - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(items.length - 1);
    }
  });

  btn.addEventListener("click", () => {
    if (pending) return;
    if (btn.dataset.state === "translated") {
      restoreOriginal();
      return;
    }
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  menu.addEventListener("click", async (e) => {
    const item = e.target.closest(".translate-menu-item");
    if (!item) return;
    closeMenu();
    const targetLang = item.dataset.targetLang;
    if (!targetLang || pending) return;

    // Cache hit → instant swap.
    try {
      const cached = localStorage.getItem(cacheKeyFor(targetLang));
      if (cached) {
        const local = localStorage.getItem(cacheKeyFor(targetLang) + VIA_LOCAL);
        applyTranslation(cached, targetLang);
        if (local) {
          translatedHtml = articleBody.innerHTML;
          showDoneCard(targetLang);
        }
        else if (hasTranslator && SERVER_LLM_OFFERED) showVia(false, targetLang);
        return;
      }
    } catch {
      /* ignore */
    }

    // The Translator API first, then the device's model, then (if offered)
    // the server.
    if (hasTranslator && sourceLang && sourceLang !== targetLang) {
      pending = true;
      setState("loading");
      const html = await translateOnDevice(targetLang);
      pending = false;
      if (html) {
        applyTranslation(html, targetLang);
        showVia(true, targetLang);
        return;
      }
      setState("idle");
    }
    pending = true;
    const device = await loadDevice();
    const route = device ? await device.aiRoute(targetLang) : SERVER_LLM_OFFERED ? "server" : "none";
    pending = false;
    if (device && (route === "nano" || route === "local")) {
      pending = true;
      setState("loading");
      try {
        const ok = await translateLocally(device, route, targetLang);
        pending = false;
        if (ok) setState("translated");
        else {
          restoreOriginal();
          serverFailed(tt("noteActions.translateLocalFailed"));
        }
      } catch {
        // "Arrêter" while it ran: restoreOriginal already did the rest.
        pending = false;
      }
      return;
    }
    if (route === "server") {
      translateOnServer(targetLang);
      return;
    }
    // Nothing on this device yet: the chat's sheet offers the download, or
    // says the assistant isn't available here.
    window.dispatchEvent(new CustomEvent("gk:ai-setup"));
  });

  // A failed server call leaves a device translation on screen as it was
  // (the "Meilleure traduction" retry), else goes back to the idle button.
  function serverFailed(message) {
    if (activeTarget && viaNote) {
      setState("translated");
      viaNote.firstChild.removeAttribute("data-i18n");
      viaNote.firstChild.textContent = message;
      return;
    }
    setState("idle");
    if (label) label.textContent = message;
    // On a phone the button sits in the closed display sheet, its label
    // hidden while idle, so the failure is also said above the text.
    hideVia();
    viaNote = document.createElement("div");
    viaNote.className = "translate-via";
    viaNote.setAttribute("role", "alert");
    viaNote.setAttribute("data-pagefind-ignore", "");
    viaNote.textContent = message;
    articleBody.before(viaNote);
  }

  async function translateOnServer(targetLang) {
    pending = true;
    setState("loading");
    slowTimer = setTimeout(() => {
      if (label && btn.dataset.state === "loading") label.textContent = labels.slow;
    }, 10000);
    try {
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          markdown: source.markdown,
          dir: source.dir,
          sourceLang,
          targetLang,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.html) {
        serverFailed(data.error || tt("noteActions.translateError"));
        return;
      }
      try {
        localStorage.setItem(cacheKeyFor(targetLang), data.html);
      } catch {
        /* quota exceeded */
      }
      applyTranslation(data.html, targetLang);
      if (hasTranslator) showVia(false, targetLang);
    } catch {
      serverFailed(tt("noteActions.translateNetworkError"));
    } finally {
      pending = false;
      if (slowTimer) {
        clearTimeout(slowTimer);
        slowTimer = null;
      }
    }
  }
})();
