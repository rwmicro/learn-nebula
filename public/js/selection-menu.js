// Floating toolbar over a text selection in the note body:
// - "Expliquer" hands the passage to the site's assistant (<PinnedAssistant>,
//   via a `gk:explain` event), which opens with the passage pinned as context
//   and asks the server's default "explain this passage" question;
// - "Surligner" keeps the passage highlighted (public/js/highlights.js);
// - "Copier le lien" copies the page URL with a text fragment (#:~:text=…,
//   lib/text-fragment.ts) that scrolls to and highlights the passage.
// Shown for 3+ words and at most 1000 characters, inside .article-body but not
// in code, form fields or interactive chrome. Hidden on scroll, Escape, a
// click elsewhere or a collapsed selection. On touch it sits BELOW the
// selection, out of the way of the OS's own copy/paste bubble (which goes
// above); with a mouse it sits above, like most editors.
// Built at runtime and appended to <body>, so Pagefind never indexes it;
// print hides it (main.css).
import { selectionEligible, textFragmentUrl, MAX_CHARS } from "../../lib/text-fragment.ts";

(function () {
  const article = document.querySelector(".article-body");
  if (!article) return;

  const EXCLUDE = "pre, code, kbd, input, textarea, select, button, [contenteditable], .quiz-controls, .quiz-grade, .sel-menu";

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }
  function label(el, key) {
    el.textContent = tt(key);
    el.setAttribute("data-i18n", key);
  }

  let lastPointer = "mouse";
  let text = "";
  let timer = 0;
  let resetTimer = 0;
  // The plain-http copy fallback selects a hidden textarea; don't let that
  // selection change close the toolbar before its "copied" feedback shows.
  let copying = false;

  const menu = document.createElement("div");
  menu.className = "sel-menu";
  menu.setAttribute("role", "toolbar");
  menu.setAttribute("aria-label", tt("selMenu.aria"));
  menu.setAttribute("data-i18n-aria-label", "selMenu.aria");
  menu.setAttribute("data-pagefind-ignore", "");
  menu.hidden = true;

  const explain = document.createElement("button");
  explain.type = "button";
  explain.className = "sel-menu-btn sel-menu-explain";
  label(explain, "selMenu.explain");

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "sel-menu-btn";
  copyBtn.setAttribute("aria-label", tt("selMenu.copyLinkAria"));
  copyBtn.setAttribute("data-i18n-aria-label", "selMenu.copyLinkAria");
  label(copyBtn, "selMenu.copyLink");

  // "Surligner": kept in this browser (lib/personal.ts), drawn and edited by
  // /js/highlights.js, which listens for this event.
  const hlBtn = document.createElement("button");
  hlBtn.type = "button";
  hlBtn.className = "sel-menu-btn sel-menu-hl";
  label(hlBtn, "selMenu.highlight");

  const live = document.createElement("span");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");

  menu.append(explain, hlBtn, copyBtn, live);
  document.body.appendChild(menu);

  // Keep the page selection alive while the toolbar is pressed.
  menu.addEventListener("mousedown", (e) => e.preventDefault());

  function hide() {
    clearTimeout(timer);
    if (menu.hidden) return;
    menu.hidden = true;
    menu.removeAttribute("data-copied");
    label(copyBtn, "selMenu.copyLink");
  }

  function inScope(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!el && article.contains(el) && !el.closest(EXCLUDE);
  }

  function place(rect) {
    const margin = 8;
    const touch = lastPointer === "touch" || lastPointer === "pen";
    menu.style.left = "0px";
    menu.style.top = "0px";
    const m = menu.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    // Touch: below the selection, clear of the drag handles (~24px).
    const below = rect.bottom + (touch ? 28 : margin);
    const above = rect.top - m.height - margin;
    let top = touch
      ? below + m.height <= vh - margin || above < margin
        ? below
        : above
      : above >= margin
        ? above
        : below;
    top = Math.max(margin, Math.min(top, vh - m.height - margin));
    let left = rect.left + rect.width / 2 - m.width / 2;
    left = Math.max(margin, Math.min(left, vw - m.width - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function check() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hide();
    const raw = sel.toString();
    if (!selectionEligible(raw)) return hide();
    if (!inScope(sel.anchorNode) || !inScope(sel.focusNode)) return hide();
    const range = sel.getRangeAt(0);
    const whole = range.getBoundingClientRect();
    if (!whole || (whole.width === 0 && whole.height === 0)) return hide();
    // On touch, centre on the selection's last line (where the end handle
    // is), under the whole range.
    const rects = range.getClientRects();
    const last = rects.length ? rects[rects.length - 1] : whole;
    text = raw.slice(0, MAX_CHARS);
    menu.hidden = false;
    place(
      lastPointer === "touch"
        ? { left: last.left, width: last.width, top: whole.top, bottom: whole.bottom }
        : whole,
    );
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(check, delay);
  }

  document.addEventListener("pointerdown", (e) => {
    lastPointer = e.pointerType || "mouse";
    if (!menu.contains(e.target)) hide();
  });
  document.addEventListener("pointerup", (e) => {
    if (menu.contains(e.target)) return;
    schedule(10);
  });
  // Touch handles and keyboard (Shift+arrows) only report through
  // selectionchange; wait for the selection to settle before showing.
  document.addEventListener("selectionchange", () => {
    if (copying) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return hide();
    schedule(lastPointer === "mouse" ? 250 : 400);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      hide();
      return;
    }
    // After a keyboard selection (Shift+arrows), Tab jumps into the toolbar
    // instead of to the next link on the page.
    if (
      e.key === "Tab" &&
      !e.shiftKey &&
      !menu.hidden &&
      lastPointer === "keyboard" &&
      !menu.contains(document.activeElement)
    ) {
      e.preventDefault();
      explain.focus();
      return;
    }
    // role="toolbar": arrow keys move between its two buttons.
    if (menu.contains(e.target) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const btns = [explain, hlBtn, copyBtn];
      const i = btns.indexOf(e.target);
      const d = e.key === "ArrowRight" ? 1 : btns.length - 1;
      btns[(Math.max(0, i) + d) % btns.length].focus();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key === "Shift") lastPointer = "keyboard";
  });
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("resize", hide, { passive: true });

  hlBtn.addEventListener("click", () => {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    hide();
    sel?.removeAllRanges();
    if (range) window.dispatchEvent(new CustomEvent("gk:highlight", { detail: { range, text } }));
  });

  explain.addEventListener("click", () => {
    const passage = text.replace(/\s+/g, " ").trim();
    hide();
    window.getSelection()?.removeAllRanges();
    window.dispatchEvent(new CustomEvent("gk:explain", { detail: { text: passage } }));
  });

  function copy(s) {
    if (navigator.clipboard && window.isSecureContext)
      return navigator.clipboard.writeText(s);
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      ok ? resolve() : reject(new Error("copy failed"));
    });
  }

  copyBtn.addEventListener("click", () => {
    const url = textFragmentUrl(location.href, text);
    const done = (key) => {
      menu.setAttribute("data-copied", key === "selMenu.linkCopied" ? "true" : "false");
      label(copyBtn, key);
      live.textContent = "";
      setTimeout(() => (live.textContent = tt(key)), 30);
      clearTimeout(resetTimer);
      resetTimer = setTimeout(hide, 1400);
    };
    copying = true;
    copy(url)
      .then(
        () => done("selMenu.linkCopied"),
        () => done("selMenu.copyFailed"),
      )
      .finally(() => setTimeout(() => (copying = false), 50));
  });
})();
