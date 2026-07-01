// Reveal the condensed sticky header (title + date + toggle) once the
// original in-flow header has scrolled out of view. Uses IntersectionObserver
// on the original header — when its `isIntersecting` flips to false, we set
// body[data-condensed-header="true"] which the CSS uses to slide the
// condensed bar down from the top. Cheaper than a scroll listener and
// throttles naturally.
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
      condensed.setAttribute("aria-hidden", show ? "false" : "true");
    },
    { threshold: 0, rootMargin: "0px 0px -1px 0px" },
  );
  io.observe(header);
})();
