// Reveal the condensed sticky header (title + date + toggle) once the
// original in-flow header has scrolled out of view. Uses IntersectionObserver
// on the original header — when its `isIntersecting` flips to false, we set
// body[data-condensed-header="true"] which the CSS uses to slide the
// condensed bar down from the top. Cheaper than a scroll listener and
// throttles naturally.
import { scrollProgress } from "../../lib/reading-progress";

(function () {
  const header = document.querySelector(".note-header");
  const condensed = document.querySelector(".note-header-condensed");
  if (!header || !condensed) return;

  document.body.dataset.condensedHeader = "false";

  // rootMargin top: -1px so the observer flips on the *very first* scroll
  // past the header bottom, instead of waiting until the header is fully
  // gone (which can feel laggy at the moment of detachment).
  const io = new IntersectionObserver(
    (entries) => {
      const e = entries[0];
      const show = !e.isIntersecting;
      document.body.dataset.condensedHeader = show ? "true" : "false";
      // `inert`, not aria-hidden: the bar holds a focusable toggle, so
      // aria-hidden on it would trap that button (WCAG 4.1.2 / aria-hidden-focus).
      // inert removes the whole off-screen subtree from focus AND the a11y tree.
      condensed.inert = !show;
    },
    { threshold: 0, rootMargin: "0px 0px -1px 0px" },
  );
  io.observe(header);
})();

// Reading-progress bar: a hairline pinned to the top edge of the viewport (so
// it also sits on top of the condensed bar above, when that is showing),
// filled in proportion to how much of the article body has been scrolled
// past. Decorative — aria-hidden, no focus — and drawn with a transform so a
// scroll costs one composited property, at most once per frame.
(function () {
  const body = document.querySelector(".article-body");
  if (!body) return;
  const bar = document.createElement("div");
  bar.className = "reading-progress";
  bar.setAttribute("aria-hidden", "true");
  bar.setAttribute("data-pagefind-ignore", "");
  document.body.appendChild(bar);

  let queued = false;
  function update() {
    queued = false;
    const r = body.getBoundingClientRect();
    // 0 while the body's top is still below the top of the viewport; 1 once
    // its end has come up into view — the last screen of a note is "read".
    // Shared with /js/reading-state.js, which marks the note read at 90 %.
    const p = scrollProgress(r.top, r.height, window.innerHeight);
    bar.style.setProperty("--progress", p.toFixed(4));
    bar.dataset.empty = p <= 0 ? "true" : "false";
  }
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
})();
