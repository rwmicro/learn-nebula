// Loads the widget code a page needs, and only on a page that has a widget.
//
// The original library, public/js/widgets.js, is 106 KB of builders — thirty
// of them, each for one kind of note. Bundled into note.bundle.js it took the
// script every note page downloads from 6 KB to 25 KB brotli, and most notes
// have no widget to build. It guards itself at runtime (`if (!figures.length)
// return`), but by then the bytes are fetched and parsed.
//
// The packs added since (lib/widgets-extra.ts: data, sciences, languages) are
// separate bundles for the same reason: a page fetches a pack only when one of
// its widgets is on it. An inline price (`prix:` code span, lib/prix.ts) needs
// the data pack too, for its popover.
//
// Same shape as mermaid-render.js next door, which has always fetched the
// mermaid bundle this way: look for the mount points first, and only then go
// and get the code. Same-origin scripts, so the `script-src 'self'` CSP in
// lib/site.ts holds unchanged.
//
// Each mount point says which pack it needs (`data-pack`, written at build by
// rehypeWidgets in lib/markdown.ts), so only PACK_BUNDLE is imported here, not
// the EXTRA_WIDGETS registry and its fallback texts.
import { PACK_BUNDLE } from "../../lib/widgets-extra";

(function () {
  const want = new Set();
  let legacy = false;
  for (const fig of document.querySelectorAll(".widget[data-widget]")) {
    const pack = fig.getAttribute("data-pack");
    if (pack && PACK_BUNDLE[pack]) want.add(PACK_BUNDLE[pack]);
    else legacy = true;
  }
  if (document.querySelector(".prix[data-eur]")) want.add(PACK_BUNDLE.data);
  if (legacy) want.add("/js/widgets.js");
  for (const src of want) {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
  }
})();
