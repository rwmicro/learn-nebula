// Makes the note page's scrollable boxes reachable from the keyboard.
//
// A few things in a note get `overflow-x: auto` so wide content scrolls instead
// of breaking the column. A box that scrolls but cannot be focused cannot be
// scrolled without a pointer at all — axe rates it serious, WCAG 2.1.1.
//
// Two were actually uncovered, measured on a note carrying both: display maths
// and a wide table, which axe reported as scrollable-region-focusable ×2.
// Code blocks were never among them — shiki already emits tabindex="0" on its
// <pre> — and scripts/render-mermaid.mjs sets one on the figures it writes.
// They stay in the selector as a guard, and the check below leaves any element
// that is already focusable alone.
//
// Measured, not declared: only a box whose content actually overflows gets a
// tab stop. A short code block scrolls nowhere, and giving it one would just
// add a stop that does nothing — and `main table` is only a scroll container
// inside a media query, so whether it needs one depends on the viewport. That
// is why this runs in the browser rather than adding an attribute at build.
(function () {
  const SELECTOR = "main pre, main table, main .katex-display, main .mermaid-diagram";
  const MARK = "data-scroll-focus";

  function sync() {
    for (const el of document.querySelectorAll(SELECTOR)) {
      // Leave anything the author or another script already made focusable.
      if (el.hasAttribute("tabindex") && !el.hasAttribute(MARK)) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        el.setAttribute("tabindex", "0");
        el.setAttribute(MARK, "");
      } else if (el.hasAttribute(MARK)) {
        // A resize made it fit again; don't leave a dead tab stop behind.
        el.removeAttribute("tabindex");
        el.removeAttribute(MARK);
      }
    }
  }

  sync();
  // Fonts and KaTeX settle after first paint, and the table rule is viewport-
  // dependent, so re-measure on both.
  if (document.fonts?.ready) document.fonts.ready.then(sync).catch(() => {});
  let t = 0;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(t);
      t = setTimeout(sync, 150);
    },
    { passive: true },
  );
})();
