// Article translation: the button, its language menu and the note's state.
// The work itself is translate-device.bundle.js (public/js/translate-device.js,
// fetched when the menu is first opened): Chrome's Translator API, else the
// device's model (Gemini Nano or the downloaded one), in batches, in place,
// kept in localStorage as it goes so a stopped translation resumes. With
// nothing on the device the button opens the download (or "not available
// here") sheet of components/chat/GardenChat.tsx. The server's translation
// (/api/translate) only runs while SERVER_LLM_OFFERED is on.
// LanguageDetector (lib/browser-ai.ts) also checks, when its model is already
// there, whether the note is in a language other than the reader's, and
// highlights the button if so.
import { detectLanguage, promptAvailable } from "../../lib/browser-ai.ts";
import { SERVER_LLM_OFFERED, localModelLangs } from "../../lib/garden-ai-flags.ts";

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
      // "<key>:local" marks a translation the device wrote: it goes with its key.
      if (k && k.startsWith(prefix) && !fresh.has(k.replace(/:local$/, ""))) localStorage.removeItem(k);
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
  // A line above the body: who translated (server), or why it failed.
  let viaNote = null;
  function hideVia() {
    if (viaNote) viaNote.remove();
    viaNote = null;
  }
  function showVia(text, alert) {
    hideVia();
    viaNote = document.createElement("div");
    viaNote.className = "translate-via";
    viaNote.setAttribute("role", alert ? "alert" : "note");
    viaNote.setAttribute("data-pagefind-ignore", "");
    viaNote.textContent = text;
    articleBody.before(viaNote);
  }

  const labels = {
    idle: "noteActions.translate",
    loading: "noteActions.translateLoading",
    translated: "noteActions.translateShowOriginal",
  };
  const arias = {
    idle: "noteActions.translateAriaIdle",
    loading: "noteActions.translateAriaLoading",
    translated: "noteActions.translateAriaShowOriginal",
  };
  let pending = false;
  let translator = null;

  function setState(state) {
    btn.dataset.state = state;
    if (label) label.textContent = tt(labels[state]);
    btn.disabled = state === "loading";
    btn.setAttribute("aria-label", tt(arias[state]));
  }

  // The note's own nodes are set aside while a translation is shown, and
  // put back as they were: widgets, quizzes and players keep their state
  // (writing `originalHtml` back would leave them dead).
  let aside = null;
  function stash() {
    if (aside) return;
    aside = document.createDocumentFragment();
    aside.append(...articleBody.childNodes);
  }
  function unstash() {
    if (!aside) return;
    articleBody.replaceChildren(aside);
    aside = null;
  }

  function restoreOriginal() {
    if (translator) translator.clear();
    hideVia();
    unstash();
    articleBody.removeAttribute("dir");
    pending = false;
    setState("idle");
  }

  async function device() {
    if (translator) return translator;
    const mod = await loadDevice();
    if (mod)
      translator = mod.createTranslator({
        articleBody,
        originalHtml,
        sourceLang,
        tt,
        cacheKeyFor,
        fixRelativeAssets,
        stash,
        unstash,
        clearNote: hideVia,
        setLabel: (text) => {
          if (label) label.textContent = text;
        },
        restore: restoreOriginal,
        pick,
      });
    return translator;
  }

  /** Translate the note into `targetLang` (a menu pick, "Réessayer",
   *  "Reprendre", or the download sheet once the model is there). */
  async function pick(targetLang) {
    if (!targetLang || pending) return;
    pending = true;
    hideVia();
    setState("loading");
    const tr = await device();
    let result = tr ? "failed" : SERVER_LLM_OFFERED ? "server" : "none";
    if (tr) {
      try {
        result = await tr.translate(targetLang);
      } catch {
        restoreOriginal();
      }
    }
    if (result === "server" && SERVER_LLM_OFFERED) result = await translateOnServer(targetLang);
    pending = false;
    if (result === "done") return setState("translated");
    if (result === "none" || result === "server") {
      restoreOriginal();
      showVia(tt("noteActions.translateUnavailable"), true);
    } else if (btn.dataset.state === "loading") setState("idle");
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
    noMatch.hidden = visible > 0 || menu.classList.contains("is-empty");
  }

  // Only the languages something on this device can translate into: the
  // downloaded model's own (lib/garden-ai-flags.ts) when this device can run
  // one, then the ones Chrome's Translator or Gemini Nano say they cover.
  // Under the list, a line says what picking one will ask for first.
  const menuNote = document.createElement("p");
  menuNote.className = "translate-menu-note";
  menuNote.hidden = true;
  (noMatch || list).after(menuNote);
  function markSupport(li, ok) {
    if (ok) delete li.dataset.unsupported;
    else li.dataset.unsupported = "1";
    li.hidden = !ok;
  }
  const quick = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 3000))]).catch(() => undefined);
  let supportChecked = false;
  async function checkSupport() {
    if (supportChecked || SERVER_LLM_OFFERED) return;
    supportChecked = true;
    const tr = await device();
    const st = tr ? await tr.state() : { state: "ready" };
    const model = new Set(st.state === "none" ? [] : localModelLangs());
    const hasTranslator = "Translator" in self && !!sourceLang;
    const hasNano = "LanguageModel" in self;
    let shown = 0;
    await Promise.all(
      Array.from(list.querySelectorAll("li")).map(async (li) => {
        const lang = li.querySelector(".translate-menu-item").dataset.targetLang;
        let ok = model.has(lang);
        if (!ok && hasTranslator) {
          const a = await quick(self.Translator.availability({ sourceLanguage: sourceLang, targetLanguage: lang }));
          ok = !!a && a !== "unavailable";
        }
        if (!ok && hasNano) ok = await promptAvailable(lang);
        markSupport(li, ok);
        if (ok) shown++;
      }),
    );
    const key =
      !shown
        ? "noteActions.translateUnavailable"
        : st.state === "download"
          ? "noteActions.translateNeedsModel"
          : "";
    menuNote.hidden = !key;
    if (key) menuNote.textContent = tt(key, { n: String(st.gb || "").replace(".", ",") });
    menu.classList.toggle("is-empty", !shown);
    if (!menu.hidden) applyFilter();
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

  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".translate-menu-item");
    if (!item) return;
    closeMenu();
    // The "Aa" panel of the reading bar would stay open over the text.
    const panel = wrap.closest("details");
    if (panel) panel.open = false;
    pick(item.dataset.targetLang);
  });

  // The server's translation (kept, not offered: SERVER_LLM_OFFERED).
  async function translateOnServer(targetLang) {
    const slow = setTimeout(() => {
      if (label && btn.dataset.state === "loading") label.textContent = tt("noteActions.translateSlow");
    }, 10000);
    const failed = (message) => {
      restoreOriginal();
      showVia(message, true);
      return "failed";
    };
    try {
      const r = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown: source.markdown, dir: source.dir, sourceLang, targetLang }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.html) return failed(data.error || tt("noteActions.translateError"));
      try {
        localStorage.setItem(cacheKeyFor(targetLang), data.html);
      } catch {
        /* quota exceeded */
      }
      stash();
      articleBody.innerHTML = data.html;
      fixRelativeAssets(articleBody);
      showVia(tt("noteActions.translateViaServer"));
      return "done";
    } catch {
      return failed(tt("noteActions.translateNetworkError"));
    } finally {
      clearTimeout(slow);
    }
  }
})();
