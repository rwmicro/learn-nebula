// Registers the service worker (offline reading + instant repeat loads).
//
// Deliberately NOT in note.bundle.js: that bundle only loads on /posts/* pages,
// and the worker has to cover the whole site. Loaded from app/layout.tsx
// alongside i18n/instantpage/lightbox.
(function () {
  if (!("serviceWorker" in navigator)) return;
  function register() {
    navigator.serviceWorker.register("/sw.js").catch(function () {
      /* Unsupported, private mode, or blocked — the site works without it. */
    });
  }
  // Registration shouldn't compete with the first paint, so it waits for load —
  // but Next injects `afterInteractive` scripts *after* load has already fired,
  // in which case the listener would never run. Check readyState first.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
})();
