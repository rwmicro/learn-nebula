// Mounts the Pagefind full-text search UI into #search once its bundle (built
// into /pagefind/ by `pagefind --site out`) has loaded. The bundle only exists
// after `npm run build`, so search is inactive under `next dev`.
(function () {
  function init() {
    if (window.PagefindUI) {
      const ui = new window.PagefindUI({
        element: "#search",
        showSubResults: true,
        showImages: false,
        translations: { placeholder: "Rechercher dans les notes…" },
      });
      // Support ?q= so the structured-data SearchAction actually searches.
      const q = new URLSearchParams(location.search).get("q");
      if (q && typeof ui.triggerSearch === "function") ui.triggerSearch(q);
    } else {
      setTimeout(init, 60);
    }
  }
  init();
})();
