// The note sidebar's drawer (tags + contents + neighbourhood), and from
// 1100px with "élargir" on, the contents card in the left margin.
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

  // From 1100px with "élargir" on, the contents rail (toc.js) is hidden to
  // give the text its margin: there "Sommaire" opens that rail as a card in
  // the left margin instead of the drawer and its grey veil, so the text
  // stays in view. (In the normal width the rail is already on screen.)
  const desk = matchMedia("(min-width: 1100px)");
  const railOf = () => document.querySelector(".toc-rail");
  const cardOpen = () => document.body.dataset.railOpen === "true";
  function setCard(open) {
    const rail = railOf();
    if (!rail) return;
    if (open) {
      document.body.dataset.railOpen = "true";
      rail.setAttribute("role", "dialog");
      rail.setAttribute(
        "aria-label",
        lastTrigger.getAttribute("aria-label") || "",
      );
      const a = rail.querySelector("a.active") || rail.querySelector("a");
      if (a) setTimeout(() => a.focus({ preventScroll: true }), 50);
    } else {
      delete document.body.dataset.railOpen;
      rail.removeAttribute("role");
      rail.removeAttribute("aria-label");
      if (rail.contains(document.activeElement)) {
        try {
          lastTrigger.focus({ preventScroll: true });
        } catch {
          lastTrigger.focus();
        }
      }
    }
    toggles.forEach((t) => t.setAttribute("aria-expanded", String(open)));
  }
  // The card applies only where the rail would otherwise be hidden.
  function wantsCard() {
    const rail = railOf();
    if (!rail) return false;
    if (cardOpen()) return true;
    return desk.matches && getComputedStyle(rail).display === "none";
  }
  desk.addEventListener("change", () => cardOpen() && setCard(false));

  toggles.forEach((t) => {
    t.removeAttribute("hidden");
    t.addEventListener("click", () => {
      lastTrigger = t;
      if (wantsCard()) setCard(!cardOpen());
      else setOpen(true);
    });
  });
  if (closeBtn) closeBtn.addEventListener("click", () => setOpen(false));

  document.addEventListener("click", (e) => {
    if (cardOpen()) {
      const rail = railOf();
      const onToggle = Array.from(toggles).some((t) => t.contains(e.target));
      // A link in the card scrolls to its section: the card makes way.
      if (
        onToggle ||
        (rail && rail.contains(e.target) && !e.target.closest("a"))
      )
        return;
      setCard(false);
      return;
    }
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
    if (e.key === "Escape" && cardOpen()) {
      setCard(false);
      return;
    }
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
