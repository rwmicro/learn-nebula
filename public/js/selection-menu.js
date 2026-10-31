// Floating toolbar over a text selection in the note body:
// - "Expliquer" hands the passage to the garden chat (components/chat/GardenChat.tsx,
//   via a `gk:explain` event), which opens with the passage quoted and
//   explains it on the device's model;
// - "Avec mes mots" opens the same assistant in its "explique-le avec tes
//   mots" mode (`gk:explain-own`): the reader writes their own explanation of
//   the passage and gets feedback on it;
// - "Surligner" keeps the passage highlighted (public/js/highlights.js);
// - "Copier le lien" copies the page URL with a text fragment (#:~:text=…,
//   lib/text-fragment.ts) that scrolls to and highlights the passage;
// - "Signaler" opens a short form: the reader says what is wrong with the
//   passage, sent to POST /api/report (lib/feedback.ts) for /admin.
// Shown for 3+ words and at most 1000 characters, inside .article-body but not
// in code, form fields or interactive chrome. Hidden on scroll, Escape, a
// click elsewhere or a collapsed selection. On touch it sits BELOW the
// selection, out of the way of the OS's own copy/paste bubble (which goes
// above); with a mouse it sits above, like most editors.
// Built at runtime and appended to <body>, so Pagefind never indexes it;
// print hides it (main.css).
import { selectionEligible, textFragmentUrl, MAX_CHARS } from "../../lib/text-fragment.ts";
import { REPORT_MAX, REPORT_MIN_REMARK } from "../../lib/feedback.ts";

(function () {
  const article = document.querySelector(".article-body");
  if (!article) return;

  const EXCLUDE = "pre, code, kbd, input, textarea, select, button, [contenteditable], .quiz-controls, .quiz-grade, .sel-menu";

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }
  // Each button: an icon, then its words in a span (the one data-i18n
  // rewrites on a locale switch, so the icon stays). Link and flag show
  // only the icon; their aria-label carries the words.
  const svg = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    explain: svg('<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3.5-2.6-5.5-6-5.5 0 3.5 2.6 5.5 6 5.5z"/>'),
    own: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    hl: svg('<path d="M9 11l-5 5v3h3l5-5"/><path d="M9 11l6-6 4 4-6 6z"/><path d="M14 20h6"/>'),
    link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  };
  function button(cls, icon) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `sel-menu-btn ${cls}`;
    b.innerHTML = `${ICONS[icon]}<span class="sel-menu-tx"></span>`;
    return b;
  }
  function label(el, key) {
    const tx = el.querySelector(".sel-menu-tx") || el;
    tx.textContent = tt(key);
    tx.setAttribute("data-i18n", key);
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

  const explain = button("sel-menu-explain", "explain");
  label(explain, "selMenu.explain");

  const ownBtn = button("sel-menu-own", "own");
  ownBtn.setAttribute("aria-label", tt("selMenu.explainOwnAria"));
  ownBtn.setAttribute("data-i18n-aria-label", "selMenu.explainOwnAria");
  label(ownBtn, "selMenu.explainOwn");

  const copyBtn = button("sel-menu-copy sel-menu-icon", "link");
  copyBtn.setAttribute("aria-label", tt("selMenu.copyLinkAria"));
  copyBtn.setAttribute("data-i18n-aria-label", "selMenu.copyLinkAria");
  label(copyBtn, "selMenu.copyLink");

  // "Surligner": kept in this browser (lib/personal.ts), drawn and edited by
  // /js/highlights.js, which listens for this event.
  const hlBtn = button("sel-menu-hl", "hl");
  label(hlBtn, "selMenu.highlight");

  // "Signaler": an error in the passage, for the owner (/admin → Contenu).
  const reportBtn = button("sel-menu-report sel-menu-icon", "flag");
  reportBtn.setAttribute("aria-label", tt("selMenu.reportAria"));
  reportBtn.setAttribute("data-i18n-aria-label", "selMenu.reportAria");
  label(reportBtn, "selMenu.report");

  const live = document.createElement("span");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");

  menu.append(explain, ownBtn, hlBtn, copyBtn, reportBtn, live);
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
    // role="toolbar": arrow keys move between its buttons.
    if (menu.contains(e.target) && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const btns = [explain, ownBtn, hlBtn, copyBtn, reportBtn];
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

  ownBtn.addEventListener("click", () => {
    const passage = text.replace(/\s+/g, " ").trim();
    hide();
    window.getSelection()?.removeAllRanges();
    window.dispatchEvent(new CustomEvent("gk:explain-own", { detail: { text: passage } }));
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

  // --- Signaler ------------------------------------------------------------
  const slug = location.pathname.replace(/^\/posts\//, "").replace(/\/+$/, "");

  function openReport(passage) {
    const dlg = document.createElement("dialog");
    dlg.className = "report-dlg";
    dlg.setAttribute("aria-labelledby", "report-dlg-title");
    dlg.setAttribute("data-pagefind-ignore", "");
    const esc = window.__i18n && window.__i18n.escapeHtml ? window.__i18n.escapeHtml : (s) => s;
    dlg.innerHTML =
      `<form method="dialog" class="report-form">` +
      `<h2 id="report-dlg-title" class="report-title">${esc(tt("report.title"))}</h2>` +
      `<blockquote class="report-passage">${esc(passage)}</blockquote>` +
      `<label class="report-label" for="report-remark">${esc(tt("report.label"))}</label>` +
      `<textarea id="report-remark" class="report-remark" rows="3" maxlength="${REPORT_MAX.remark}" required></textarea>` +
      `<p class="report-hint">${esc(tt("report.hint"))}</p>` +
      `<p class="report-status" role="status" aria-live="polite"></p>` +
      `<div class="report-actions">` +
      `<button type="button" class="report-cancel">${esc(tt("report.cancel"))}</button>` +
      `<button type="submit" class="report-send">${esc(tt("report.send"))}</button>` +
      `</div></form>`;
    document.body.appendChild(dlg);
    const form = dlg.querySelector("form");
    const remark = dlg.querySelector(".report-remark");
    const status = dlg.querySelector(".report-status");
    const send = dlg.querySelector(".report-send");
    dlg.querySelector(".report-cancel").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => dlg.remove());
    // A tap on the backdrop lands on the <dialog> itself, outside the form.
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = remark.value.trim();
      if ([...text].length < REPORT_MIN_REMARK) {
        status.textContent = tt("report.tooShort");
        remark.focus();
        return;
      }
      send.disabled = true;
      status.textContent = tt("report.sending");
      fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ slug, passage: passage.slice(0, REPORT_MAX.passage), remark: text }),
      })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          status.textContent = tt("report.thanks");
          dlg.classList.add("is-sent");
          setTimeout(() => dlg.close(), 1600);
        })
        .catch((err) => {
          send.disabled = false;
          status.textContent = tt(String(err.message) === "429" ? "report.tooMany" : "report.failed");
        });
    });
    dlg.showModal();
    remark.focus();
  }

  reportBtn.addEventListener("click", () => {
    const passage = text.replace(/\s+/g, " ").trim();
    hide();
    window.getSelection()?.removeAllRanges();
    if (passage) openReport(passage);
  });
})();
