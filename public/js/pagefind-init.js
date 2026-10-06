// Mounts the Pagefind full-text search UI into #search once its bundle (built
// into /pagefind/ by `pagefind --site out`) has loaded. The bundle only exists
// after `npm run build`, so search is inactive under `next dev`.
//
// Each note carries a `section` metadata ("Philosophie › Philosophes", see
// noteSectionMetaHtml in lib/html.ts) that Pagefind's default UI lists under a
// result as "Section: …". It is shown here as a small kicker instead: the
// "Section: " label is blanked (CSS puts the tag above the title), and the
// discipline is re-translated for a reader on another locale (`dkey`).
(function () {
  const i18n = window.__i18n;

  function lookup(bundle, key) {
    let val = bundle;
    for (const p of key.split(".")) {
      if (val && typeof val === "object" && p in val) val = val[p];
      else return null;
    }
    return typeof val === "string" ? val : null;
  }

  function processResult(result) {
    const meta = result && result.meta;
    if (!meta) return result;
    const key = meta.dkey;
    delete meta.dkey; // never displayed
    if (
      key &&
      meta.section &&
      i18n &&
      i18n.bundles &&
      i18n.locale &&
      i18n.locale !== i18n.defaultLocale
    ) {
      const built = lookup(i18n.bundles[i18n.defaultLocale], key);
      const now = typeof i18n.t === "function" ? i18n.t(key) : null;
      if (built && now && meta.section.indexOf(built) === 0) {
        meta.section = now + meta.section.slice(built.length);
      }
    }
    return result;
  }

  // Pagefind renders a metadata tag as three text nodes: "Section", ": ",
  // value. Blank the first two in place (not textContent, so the value node
  // Svelte keeps updating when it reuses the <li> stays attached).
  function stripMetaLabels(root) {
    root
      .querySelectorAll('.pagefind-ui__result-tag[data-pagefind-ui-meta="section"]')
      .forEach(function (li) {
        if (li.dataset.gkLabel) return;
        const texts = Array.prototype.filter.call(li.childNodes, function (n) {
          return n.nodeType === 3;
        });
        if (texts.length >= 3) {
          texts[0].data = "";
          texts[1].data = "";
          li.dataset.gkLabel = "1";
        }
      });
  }

  function t(key, fallback) {
    const s = i18n && typeof i18n.t === "function" ? i18n.t(key) : null;
    return s && s !== key ? s : fallback;
  }

  // "Recherches sans résultat" for /admin — the same rule as the home search
  // (lib/search-miss.ts, which this unbundled script can't import): a query
  // of 3+ characters that stays unchanged for 1.5s and that Pagefind answers
  // with nothing is POSTed once per page view. The check re-runs the search
  // through the same pagefind.js module the UI loaded (cached, so cheap)
  // rather than scraping the UI's localised "no results" message.
  var MISS_MIN = 3;
  var MISS_MAX = 100;
  var MISS_SETTLE_MS = 1500;
  var missSent = {};
  var missTimer = null;

  function normaliseMiss(q) {
    var s = String(q)
      .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, MISS_MAX)
      .trim();
    return Array.from(s).length >= MISS_MIN ? s : null;
  }

  function checkMiss(raw) {
    var q = normaliseMiss(raw);
    if (!q || missSent[q]) return;
    var mod = "/pagefind/pagefind.js";
    import(mod)
      .then(function (pf) {
        return pf.search(raw.trim());
      })
      .then(function (res) {
        if (!res || (res.results && res.results.length) || missSent[q]) return;
        missSent[q] = true;
        return fetch("/api/search-miss", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ q: q, where: "note" }),
          keepalive: true,
        });
      })
      .catch(function () {});
  }

  function watchMisses(el) {
    el.addEventListener("input", function (e) {
      var target = e.target;
      if (!target || !target.classList || !target.classList.contains("pagefind-ui__search-input")) return;
      clearTimeout(missTimer);
      var value = target.value || "";
      if (value.trim().length < MISS_MIN) return;
      missTimer = setTimeout(function () {
        if ((target.value || "") === value) checkMiss(value);
      }, MISS_SETTLE_MS);
    });
  }

  function init() {
    if (window.PagefindUI) {
      const el = document.querySelector("#search");
      if (!el) return;
      const ui = new window.PagefindUI({
        element: "#search",
        showSubResults: true,
        showImages: false,
        processResult: processResult,
        translations: {
          placeholder: t("sidebar.searchPlaceholder", "Rechercher dans les notes…"),
        },
      });
      watchMisses(el);
      new MutationObserver(function () {
        stripMetaLabels(el);
      }).observe(el, { childList: true, subtree: true });
      // Support ?q= so the structured-data SearchAction actually searches.
      const q = new URLSearchParams(location.search).get("q");
      if (q && typeof ui.triggerSearch === "function") ui.triggerSearch(q);
    } else {
      setTimeout(init, 60);
    }
  }
  init();
})();
