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
// block of the rendered note at a time, in place: the blocks not done yet are
// dimmed and a line counts the sections. With neither, the button opens the
// download (or "not available here") sheet of components/GardenChat.tsx. The
// server's translation only runs while SERVER_LLM_OFFERED is on.
// LanguageDetector (lib/browser-ai.ts) also checks, when its model is already
// there, whether the note is in a language other than the reader's, and
// highlights the button if so.
import { detectLanguage } from "../../lib/browser-ai.ts";
import { SERVER_LLM_OFFERED, deviceWord } from "../../lib/garden-ai-flags.ts";

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

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
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

  // "Traduit sur ton téléphone · anglais · voir l'original", above the body,
  // and the "Traduction… 3 sections sur 7" line while it runs.
  let progressLine = null;
  let localAbort = null;
  function showLocalBar(targetLang) {
    hideVia();
    viaNote = document.createElement("div");
    viaNote.className = "translate-local";
    viaNote.setAttribute("role", "note");
    viaNote.setAttribute("data-pagefind-ignore", "");
    viaNote.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg><span><b></b> · </span><button type="button"></button>';
    const key = deviceWord() === "phone" ? "noteActions.translateViaPhone" : "noteActions.translateViaDevice";
    viaNote.querySelector("b").textContent = tt(key);
    viaNote.querySelector("span").append(langName(targetLang, uiLocale()));
    const back = viaNote.querySelector("button");
    back.textContent = tt("noteActions.translateShowOriginal");
    back.addEventListener("click", () => {
      if (localAbort) localAbort.abort();
      restoreOriginal();
    });
    articleBody.before(viaNote);
  }
  function setProgress(done, total) {
    if (!progressLine) {
      progressLine = document.createElement("div");
      progressLine.className = "translate-progress";
      progressLine.setAttribute("role", "status");
      progressLine.setAttribute("data-pagefind-ignore", "");
      progressLine.innerHTML = '<span class="gc-typing" aria-hidden="true"><i></i><i></i><i></i></span><span></span>';
    }
    progressLine.lastChild.textContent = tt("noteActions.translateSections", { n: done, total });
  }
  function hideProgress() {
    if (progressLine) progressLine.remove();
    progressLine = null;
  }

  // Translate the note in place on the device's model. Resolves true when
  // done, false when the model couldn't run; an abort ("voir l'original")
  // rejects.
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
    const main = document.getElementById("main");
    if (main) main.setAttribute("lang", targetLang);
    activeTarget = targetLang;
    showLocalBar(targetLang);
    setProgress(0, total);
    blocks[0].after(progressLine);
    const system = device.translateSystem(langName(sourceLang || "fr", "fr"), langName(targetLang, "fr"));
    localAbort = new AbortController();
    const signal = localAbort.signal;
    for (let i = 0; i < blocks.length; i++) {
      const el = blocks[i];
      const { text, shells, kept } = encodeBlock(el);
      const out = await device.generateOnDevice({
        route,
        system,
        prompt: text,
        lang: targetLang,
        maxTokens: Math.min(2048, Math.ceil(text.length / 2) + 64),
        signal,
      });
      if (out == null) {
        if (i === 0) return false;
      } else {
        const frag = decodeBlock(out, shells, kept);
        if (frag) el.replaceChildren(frag);
      }
      el.classList.remove("translate-pending");
      if (el.classList.length === 0) el.removeAttribute("class");
      const next = blocks[i + 1];
      if (next) {
        setProgress(sec[i + 1], total);
        next.after(progressLine);
      }
    }
    hideProgress();
    localAbort = null;
    try {
      localStorage.setItem(cacheKeyFor(targetLang), articleBody.innerHTML);
      localStorage.setItem(cacheKeyFor(targetLang) + VIA_LOCAL, "1");
    } catch {
      /* quota exceeded */
    }
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
    const main = document.getElementById("main");
    if (main) main.setAttribute("lang", targetLang);
    activeTarget = targetLang;
    setState("translated");
  }

  function restoreOriginal() {
    if (localAbort) localAbort.abort();
    localAbort = null;
    hideProgress();
    hideVia();
    articleBody.innerHTML = originalHtml;
    const main = document.getElementById("main");
    if (main) {
      if (sourceLang === "en") main.setAttribute("lang", "en");
      else main.removeAttribute("lang");
    }
    activeTarget = null;
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
      const hit = !q || name.includes(q);
      li.hidden = !hit;
      if (hit) visible++;
    });
    noMatch.hidden = visible > 0;
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
        if (local) showLocalBar(targetLang);
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
        // "voir l'original" while it ran: restoreOriginal already did the rest.
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
