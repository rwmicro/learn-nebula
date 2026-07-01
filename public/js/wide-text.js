// Wide-text cycler: normal → wide → widest → normal. Each step expands the
// article column further to the left while keeping the right-margin TOC in
// its normal spot. State is persisted in localStorage and applied as
// `body[data-wide-text="<state>"]`; CSS rules handle the rest.
(function () {
  const btn = document.querySelector(".wide-text-btn");
  if (!btn) return;
  const KEY = "noteWideText";
  const ORDER = ["normal", "wide", "widest"];
  const LABEL_KEY = {
    normal: "noteActions.wideExpand",
    wide: "noteActions.wideExtend",
    widest: "noteActions.wideCollapse",
  };
  const ARIA_KEY = {
    normal: "noteActions.wideAriaNormal",
    wide: "noteActions.wideAriaWide",
    widest: "noteActions.wideAriaWidest",
  };
  const label = btn.querySelector(".wide-text-label");

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }

  let current = "normal";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && ORDER.includes(saved)) current = saved;
    // Migration: the previous binary toggle stored "on" / "off". Map "on"
    // to the maximum-expansion state so returning users keep their setting.
    else if (saved === "on") current = "widest";
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
    document.body.dataset.wideText = s;
    btn.dataset.state = s;
    if (label) label.textContent = tt(LABEL_KEY[s]);
    btn.setAttribute("aria-label", tt(ARIA_KEY[s]));
    // Update the data-i18n attribute on the label so a UI locale switch
    // resolves it from the right bundle on the fly.
    if (label) label.setAttribute("data-i18n", LABEL_KEY[s]);
    btn.setAttribute("data-i18n-aria-label", ARIA_KEY[s]);
  }
})();
