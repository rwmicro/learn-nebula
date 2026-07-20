// Article translation widget. Renders a target-language menu next to the
// "translate" button; picking a language hits /api/translate with the source
// Markdown, swaps .article-body's HTML with the rendered translation, and
// caches the result in localStorage keyed by {pathname, targetLang, content
// hash}. A second pick (or hit on the same target) is instant.
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
      'img[src^="/vault/"], source[src^="/vault/"], video[src^="/vault/"], a[href^="/vault/"]',
    )
    .forEach((el) => {
      const url = el.getAttribute("src") || el.getAttribute("href") || "";
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
  }
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
    articleBody.innerHTML = html;
    fixRelativeAssets(articleBody);
    const main = document.getElementById("main");
    if (main) main.setAttribute("lang", targetLang);
    activeTarget = targetLang;
    setState("translated");
  }

  function restoreOriginal() {
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
        applyTranslation(cached, targetLang);
        return;
      }
    } catch {
      /* ignore */
    }

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
        setState("idle");
        if (label) label.textContent = data.error || tt("noteActions.translateError");
        return;
      }
      try {
        localStorage.setItem(cacheKeyFor(targetLang), data.html);
      } catch {
        /* quota exceeded */
      }
      applyTranslation(data.html, targetLang);
    } catch {
      setState("idle");
      if (label) label.textContent = tt("noteActions.translateNetworkError");
    } finally {
      pending = false;
      if (slowTimer) {
        clearTimeout(slowTimer);
        slowTimer = null;
      }
    }
  });
})();
