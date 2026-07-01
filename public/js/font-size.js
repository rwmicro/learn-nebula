// Note text-size cycler: click the "Aa" button to cycle sm → md → lg → sm.
// The current size is stored in localStorage and applied as a body attribute,
// which the CSS scales via `body[data-text-size="..."] main p` overrides.
(function () {
  const btn = document.querySelector(".text-size-btn");
  if (!btn) return;
  const KEY = "noteTextSize";
  const ORDER = ["sm", "md", "lg"];
  const SIZE_KEY = {
    sm: "noteActions.textSizeSmall",
    md: "noteActions.textSizeMedium",
    lg: "noteActions.textSizeLarge",
  };
  function tt(k, vars) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k, vars) : k;
  }

  let current = "md";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && ORDER.includes(saved)) current = saved;
  } catch {
    /* localStorage unavailable */
  }
  apply(current);

  btn.addEventListener("click", () => {
    current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    apply(current);
    try {
      localStorage.setItem(KEY, current);
    } catch {
      /* localStorage unavailable */
    }
  });

  function apply(s) {
    document.body.dataset.textSize = s;
    btn.dataset.size = s;
    btn.setAttribute(
      "aria-label",
      tt("noteActions.textSizeAriaWithSize", { size: tt(SIZE_KEY[s]) }),
    );
  }
})();
