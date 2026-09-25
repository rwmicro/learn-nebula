// Loads public/js/widgets.js, but only on a page that has a widget on it.
//
// The widget library is 106 KB of builders — thirty of them, each for one kind
// of note. Bundled into note.bundle.js it took the script every note page
// downloads from 6 KB to 25 KB brotli, and 691 of the vault's 721 notes have no
// widget to build. It guards itself at runtime (`if (!figures.length) return`),
// but by then the bytes are fetched and parsed.
//
// Same shape as mermaid-render.js next door, which has always fetched the
// mermaid bundle this way: look for the mount points first, and only then go
// and get the code. Same-origin script, so the `script-src 'self'` CSP in
// lib/site.ts holds unchanged.
(function () {
  if (!document.querySelector(".widget[data-widget]")) return;
  const s = document.createElement("script");
  s.src = "/js/widgets.js";
  s.async = true;
  document.head.appendChild(s);
})();
