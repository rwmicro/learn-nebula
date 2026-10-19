// Loads /js/pronounce.js (26 KB) only on pages that actually have a
// pronunciation clip. Clips come from notes (`![word](clip.mp3)`) and from
// /cartes decks, which render client-side after load — so besides the first
// look, a MutationObserver watches for the first `.pron-btn` to appear, then
// disconnects. Pages without a clip never download the player or the coach.
(function () {
  let loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    if (obs) obs.disconnect();
    const s = document.createElement("script");
    s.src = "/js/pronounce.js";
    document.head.appendChild(s);
  }
  let obs = null;
  if (document.querySelector(".pron-btn")) return load();
  obs = new MutationObserver(function () {
    if (document.querySelector(".pron-btn")) load();
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
