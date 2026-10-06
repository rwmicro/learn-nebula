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
