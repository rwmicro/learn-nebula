// Glossary terms in the note body: lib/glossary.ts marks the first occurrence
// of each term defined elsewhere in the same discipline as
// <a class="gloss" href="…#def-…" data-gloss-def data-gloss-term data-gloss-note>.
// Hover (after a short dwell) or keyboard focus shows a small card with the
// definition, styled like the link previews (/js/popover.js's .note-popover).
// The mark itself links to the definition, so a click (or Enter) follows it;
// on touch, the first tap shows the card and a second tap follows the link.
// Everything is set with textContent; the definition is already plain text.
// With CSS anchor positioning the card is a popover anchored to the term
// (lib/anchor-popover.ts): "hint" on hover screens, "manual" on touch, where
// the two-tap logic below does its own dismissing. Elsewhere place() runs.
import { anchoredCard, anchoredPopoverMode } from "../../lib/anchor-popover";

(function () {
  if (!document.querySelector(".article-body")) return;
  const canHover = !!(window.matchMedia && window.matchMedia("(hover: hover)").matches);
  const OPEN_DELAY = 150;
  const CLOSE_DELAY = 160;

  function tt(k, vars) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k, vars) : k;
  }

  let card = null;
  let active = null;
  let openTimer = 0;
  let closeTimer = 0;
  const mode = anchoredPopoverMode(canHover ? "hint" : "manual");
  let host = null;
  const isShown = () => !!card && (host ? host.isOpen() : !card.hidden);

  function ensureCard() {
    if (card) return card;
    card = document.createElement("div");
    card.className = "note-popover gloss-popover";
    card.id = "gloss-card";
    card.setAttribute("role", "tooltip");
    card.setAttribute("data-pagefind-ignore", "");
    card.hidden = true;
    card.innerHTML =
      '<p class="gloss-kicker"></p><p class="note-popover-title"></p>' +
      '<p class="note-popover-excerpt"></p><a class="gloss-source" tabindex="-1"></a>';
    document.body.appendChild(card);
    if (mode)
      host = anchoredCard(card, "--gk-gloss", mode, () => {
        clearTimeout(openTimer);
        if (active) active.removeAttribute("aria-describedby");
        active = null;
      });
    card.addEventListener("mouseenter", () => clearTimeout(closeTimer));
    card.addEventListener("mouseleave", scheduleClose);
    return card;
  }

  function place(el) {
    const r = el.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const margin = 8;
    let top = r.bottom + margin;
    if (top + c.height > window.innerHeight - margin && r.top - c.height - margin > 0)
      top = r.top - c.height - margin;
    let left = r.left + r.width / 2 - c.width / 2;
    const vw = document.documentElement.clientWidth;
    left = Math.max(margin, Math.min(left, vw - c.width - margin));
    card.style.top = `${Math.round(top + window.scrollY)}px`;
    card.style.left = `${Math.round(left + window.scrollX)}px`;
  }

  function open(el) {
    clearTimeout(closeTimer);
    if (active && active !== el) active.removeAttribute("aria-describedby");
    active = el;
    const c = ensureCard();
    c.querySelector(".gloss-kicker").textContent = tt("glossary.kicker");
    c.querySelector(".note-popover-title").textContent = el.dataset.glossTerm || el.textContent;
    c.querySelector(".note-popover-excerpt").textContent = el.dataset.glossDef || "";
    const src = c.querySelector(".gloss-source");
    src.href = el.getAttribute("href") || "#";
    src.textContent = tt("glossary.definedIn", { note: el.dataset.glossNote || "" });
    el.setAttribute("aria-describedby", "gloss-card");
    if (host) return host.show(el);
    c.hidden = false;
    place(el);
  }

  function close() {
    clearTimeout(openTimer);
    if (active) active.removeAttribute("aria-describedby");
    active = null;
    if (host) host.hide();
    else if (card) card.hidden = true;
  }

  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, CLOSE_DELAY);
  }

  const term = (e) =>
    e.target instanceof Element ? e.target.closest(".article-body a.gloss") : null;

  if (canHover) {
    document.addEventListener("mouseover", (e) => {
      const el = term(e);
      if (!el) return;
      clearTimeout(closeTimer);
      clearTimeout(openTimer);
      openTimer = setTimeout(() => open(el), OPEN_DELAY);
    });
    document.addEventListener("mouseout", (e) => {
      const el = term(e);
      if (!el) return;
      clearTimeout(openTimer);
      scheduleClose();
    });
  } else {
    // Touch: first tap explains, second tap (on the same term) navigates.
    // Whether the card was already open is read at pointerdown: the tap's
    // own focusin opens it before the click arrives.
    let openAtDown = false;
    document.addEventListener(
      "pointerdown",
      (e) => {
        const el = term(e);
        openAtDown = !!el && active === el && isShown();
      },
      true,
    );
    document.addEventListener("click", (e) => {
      const el = term(e);
      if (el) {
        if (openAtDown) return;
        e.preventDefault();
        open(el);
      } else if (isShown() && !card.contains(e.target)) close();
    });
  }
  document.addEventListener("focusin", (e) => {
    const el = term(e);
    if (el) open(el);
  });
  document.addEventListener("focusout", (e) => {
    if (term(e)) scheduleClose();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isShown()) close();
  });
  window.addEventListener(
    "scroll",
    () => {
      // An anchored card follows its term instead.
      if (!host && canHover && isShown()) close();
    },
    { passive: true },
  );
  window.addEventListener("resize", () => !host && close(), { passive: true });
})();
