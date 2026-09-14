// Registers the service worker (offline reading + instant repeat loads).
//
// Deliberately NOT in note.bundle.js: that bundle only loads on /posts/* pages,
// and the worker has to cover the whole site. Loaded from app/layout.tsx
// alongside i18n/instantpage/lightbox.
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
})();
