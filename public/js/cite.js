// "Citer cette note" (lib/cite.ts): the access date written at build becomes
// the reader's today, and each "Copier" button copies its reference.
(function () {
  const box = document.querySelector(".cite-note");
  if (!box) return;

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }

  // Today's date, in the same two forms the build wrote.
  const built = box.getAttribute("data-today");
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (built && built !== today) {
    const long = (d) =>
      new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
    const text = box.querySelector("#cite-text");
    const bib = box.querySelector("#cite-bib");
    if (text) text.textContent = text.textContent.replace(long(new Date(built + "T00:00:00Z")), long(new Date(today + "T00:00:00Z")));
    if (bib) bib.textContent = bib.textContent.replace(`urldate = {${built}}`, `urldate = {${today}}`);
  }

  box.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-copy]");
    if (!btn) return;
    const src = document.getElementById(btn.getAttribute("data-copy"));
    if (!src) return;
    const done = () => {
      btn.textContent = tt("citer.copied");
      setTimeout(() => (btn.textContent = tt("citer.copy")), 1600);
    };
    const fallback = () => {
      // No clipboard (plain http, or refused): select the text instead.
      const r = document.createRange();
      r.selectNodeContents(src);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(src.textContent).then(done, fallback);
    else fallback();
  });
})();
