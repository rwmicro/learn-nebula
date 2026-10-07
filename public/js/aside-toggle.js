// Mobile/tablet drawer for the note sidebar (search + themes + TOC).
//
// The desktop layout puts .note-aside in the right margin; at ≤ 1080 px the
// CSS turns it into a slide-in drawer that's hidden until the user clicks
// the trigger pill bottom-left. Backdrop click, Escape, the in-drawer
// close button, and clicking a TOC link all dismiss it.
(function () {
  const aside = document.querySelector(".note-aside");
  const toggles = document.querySelectorAll(".aside-toggle");
  if (!aside || !toggles.length) return;
  const closeBtn = aside.querySelector(".aside-close");
  // Track which trigger was used last so focus returns to a visible one
  // after close (the other might be hidden by the condensed-bar state).
  let lastTrigger = toggles[0];

  function setOpen(open) {
    if (open) {
      document.body.dataset.asideOpen = "true";
      // Focus the drawer itself (its first control is the close button).
      if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
    } else {
      document.body.dataset.asideOpen = "false";
      try {
        lastTrigger.focus({ preventScroll: true });
      } catch {
        lastTrigger.focus();
      }
    }
  }
  document.body.dataset.asideOpen = "false";

  toggles.forEach((t) => {
    t.removeAttribute("hidden");
    t.addEventListener("click", () => {
      lastTrigger = t;
      setOpen(true);
    });
  });
  if (closeBtn) closeBtn.addEventListener("click", () => setOpen(false));

  document.addEventListener("click", (e) => {
    if (document.body.dataset.asideOpen !== "true") return;
    if (aside.contains(e.target)) return;
    let onToggle = false;
    toggles.forEach((t) => {
      if (t.contains(e.target)) onToggle = true;
    });
    if (onToggle) return;
    setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.dataset.asideOpen === "true") {
      setOpen(false);
    }
  });

  // Tapping a TOC link should also dismiss the drawer so the page can scroll
  // smoothly to the heading without the panel covering it.
  aside.addEventListener("click", (e) => {
    const a = e.target.closest(".toc a");
    if (a) setOpen(false);
  });
})();
