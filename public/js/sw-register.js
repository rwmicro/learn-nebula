// Registers the service worker (offline reading + instant repeat loads), and
// tells it which page is about to open where the browser can't prerender.
//
// Deliberately NOT in note.bundle.js: that bundle only loads on /posts/* pages,
// and the worker has to cover the whole site. Loaded from app/layout.tsx
// alongside i18n/lightbox.
(function () {
  if (!("serviceWorker" in navigator)) return;
  function register() {
    navigator.serviceWorker
      .register("/sw.js")
      .then(function (reg) {
        // Browsers throttle their own implicit "check for a new sw.js on
        // navigation" to at most once every 24h per registration — separate
        // from and on top of any HTTP caching. An explicit update() call is
        // not subject to that throttle, so a rebuild becomes visible on the
        // very next visit instead of silently waiting out the window.
        reg.update();
      })
      .catch(function () {
        /* Unsupported, private mode, or blocked — the site works without it. */
      });
  }
  // Registration shouldn't compete with the first paint, so it waits for load —
  // but Next injects `afterInteractive` scripts *after* load has already fired,
  // in which case the listener would never run. Check readyState first.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);

  // Warm the next page where speculation rules don't exist (Safari, Firefox):
  // the moment a finger lands on a link (or a mouse rests on one for 80 ms),
  // the worker starts fetching it, and the navigation that follows picks up
  // that response instead of starting from zero (public/sw.js, "warm next
  // page"). A touch comes ~100 ms before its click, a hover often far more:
  // that is the round trip to the Pi taken off the wait. Same exclusions as
  // the speculation rules in app/layout.tsx.
  if (HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules")) return;
  var SKIP = /^\/(api|admin|compte|duel|hasard)\//;
  var sent = {};
  function warm(a) {
    var sw = navigator.serviceWorker.controller;
    if (!sw || !a || a.origin !== location.origin || a.search) return;
    if (a.hasAttribute("download") || a.target === "_blank" || "noInstant" in a.dataset) return;
    if (SKIP.test(a.pathname) || a.pathname === location.pathname) return;
    var url = a.origin + a.pathname;
    if (sent[url] && Date.now() - sent[url] < 25000) return;
    sent[url] = Date.now();
    sw.postMessage({ type: "warm", url: url });
  }
  function linkOf(e) {
    return e.target && e.target.closest ? e.target.closest("a[href]") : null;
  }
  document.addEventListener("touchstart", function (e) { warm(linkOf(e)); }, { passive: true, capture: true });
  document.addEventListener("mousedown", function (e) { warm(linkOf(e)); }, true);
  var hoverTimer = 0;
  document.addEventListener("mouseover", function (e) {
    var a = linkOf(e);
    clearTimeout(hoverTimer);
    if (a) hoverTimer = setTimeout(function () { warm(a); }, 80);
  }, true);
})();
