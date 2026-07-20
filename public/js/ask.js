// Draggable assistant bar (semantic RAG). UI is split into a few clear
// responsibilities, declared inline for the single-file IIFE constraint:
//   - createWidgets / wireMobile : DOM build + mobile open/close
//   - attachDrag                 : pointer drag (rAF-throttled)
//   - selectionPopup             : highlight-to-ask helper
//   - keyboardLift               : visualViewport keyboard avoidance
//   - ask                        : POST + NDJSON streaming with abort
//   - markdownToHtml             : minimal inline-Markdown renderer
//
// Strings are pulled from window.__i18n.t at use-time so a locale switch
// while reading takes effect on the next interaction.
//
// The NDJSON stream reader is shared with the home assistant (esbuild resolves
// this import; see scripts/bundle-js.mjs).
import { readAskStream } from "../../lib/ask-stream";
(function () {
  if (document.querySelector(".ask-bar")) return; // double-load guard
  const KEY = "askBar";

  // A seedling, not a robot: the assistant speaks as "le jardin", so the icon
  // should read as garden, not chatbot.
  const SPROUT =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M7 20h10"/>' +
    '<path d="M10 20c5.5-2.5.8-6.4 3-10"/>' +
    '<path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/>' +
    '<path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>' +
    '</svg>';

  function tt(k) {
    return window.__i18n && window.__i18n.t ? window.__i18n.t(k) : k;
  }
  // Shared helpers (defined synchronously in app/layout.tsx's bootstrap).
  const getLocale = window.__i18n.getActiveLocale;
  const escHtml = window.__i18n.escapeHtml;

  // --- Markdown → HTML (minimal: bold, italic, inline code, lists, paragraphs).
  // Run only on the final stream content, never on partial chunks — partial
  // unbalanced `**` would render incorrectly.
  function markdownToHtml(text) {
    let s = escHtml(text);
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,!?:;)]|$)/g, "$1<em>$2</em>");
    // Links [text](url) — only http(s) or root-relative targets, matching the
    // home renderer. escHtml already ran, so a quote in the URL is neutralised.
    s = s.replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
      '<a href="$2">$1</a>',
    );
    const blocks = s.split(/\n{2,}/);
    return blocks
      .map((block) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^- /.test(l))) {
          return (
            "<ul>" + lines.map((l) => "<li>" + l.slice(2) + "</li>").join("") + "</ul>"
          );
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            "<ol>" +
            lines.map((l) => "<li>" + l.replace(/^\d+\. /, "") + "</li>").join("") +
            "</ol>"
          );
        }
        return "<p>" + lines.join("<br>") + "</p>";
      })
      .join("");
  }

  // --- DOM build -----------------------------------------------------------
  const bar = document.createElement("div");
  bar.className = "ask-bar";
  bar.dataset.mobileOpen = "false";
  bar.innerHTML =
    '<div class="ask-answer" hidden>' +
    '<div class="ask-answer-head">' +
    `<span class="ask-answer-title" data-i18n="askAi.title">${escHtml(tt("askAi.title"))}</span>` +
    `<button class="ask-close" type="button" aria-label="${escHtml(tt("askAi.closeAria"))}" data-i18n-aria-label="askAi.closeAria">×</button>` +
    "</div>" +
    '<div class="ask-output" aria-live="polite"></div>' +
    '<div class="ask-sources"></div>' +
    "</div>" +
    '<form class="ask-form">' +
    '<div class="ask-chip" hidden>' +
    '<span class="ask-chip-text"></span>' +
    `<button class="ask-chip-clear" type="button" aria-label="${escHtml(tt("askAi.removeChipAria"))}" data-i18n-aria-label="askAi.removeChipAria">×</button>` +
    "</div>" +
    `<span class="ask-grip" aria-hidden="true" title="${escHtml(tt("askAi.gripTitle"))}" data-i18n-title="askAi.gripTitle">` +
    SPROUT +
    "</span>" +
    `<button class="ask-minimize" type="button" aria-label="${escHtml(tt("askAi.minimizeAria"))}" data-i18n-aria-label="askAi.minimizeAria">×</button>` +
    `<input class="ask-input" type="text" autocomplete="off" maxlength="1000" placeholder="${escHtml(tt("askAi.placeholderDefault"))}" data-i18n-placeholder="askAi.placeholderDefault" aria-label="${escHtml(tt("askAi.inputAria"))}" data-i18n-aria-label="askAi.inputAria">` +
    `<button class="ask-submit" type="submit" data-i18n="askAi.submit">${escHtml(tt("askAi.submit"))}</button>` +
    "</form>";
  document.body.appendChild(bar);

  // Mobile/tablet trigger pill — uses data-i18n so the locale swap fills the
  // label after i18n.js initialises, avoiding the early-load race.
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ask-trigger";
  trigger.innerHTML =
    SPROUT +
    `<span class="ask-trigger-label" data-i18n="askAi.trigger">${escHtml(tt("askAi.trigger"))}</span>`;
  document.body.appendChild(trigger);

  function setMobileOpen(open) {
    bar.dataset.mobileOpen = open ? "true" : "false";
    if (open) {
      trigger.setAttribute("hidden", "");
      const inp = bar.querySelector(".ask-input");
      if (inp) requestAnimationFrame(() => inp.focus());
    } else {
      trigger.removeAttribute("hidden");
    }
  }
  trigger.addEventListener("click", () => setMobileOpen(true));
  bar.querySelector(".ask-minimize").addEventListener("click", () =>
    setMobileOpen(false),
  );

  const answer = bar.querySelector(".ask-answer");
  const answerHead = bar.querySelector(".ask-answer-head");
  const grip = bar.querySelector(".ask-grip");
  const closeBtn = bar.querySelector(".ask-close");
  const output = bar.querySelector(".ask-output");
  const sourcesEl = bar.querySelector(".ask-sources");
  const form = bar.querySelector(".ask-form");
  const input = bar.querySelector(".ask-input");
  const submit = bar.querySelector(".ask-submit");
  const chip = bar.querySelector(".ask-chip");
  const chipText = bar.querySelector(".ask-chip-text");
  const chipClear = bar.querySelector(".ask-chip-clear");
  let pinnedSelection = "";

  // Idle hint for the empty answer panel. CSS renders it via
  // content: attr(data-placeholder); keeping the text here makes it translatable
  // and keeps it in sync when the reader switches language.
  function syncPlaceholder() {
    output.setAttribute("data-placeholder", tt("askAi.placeholderEmpty"));
  }
  syncPlaceholder();
  document.addEventListener("i18n:change", syncPlaceholder);

  // --- restore + keep position --------------------------------------------
  const pos = load();
  if (pos.left != null && pos.top != null) placeAt(pos.left, pos.top);
  window.addEventListener("resize", () => {
    if (bar.style.left)
      placeAt(parseFloat(bar.style.left), parseFloat(bar.style.top));
  });

  // --- drag (rAF-throttled) -----------------------------------------------
  attachDrag(grip);
  attachDrag(answerHead, ".ask-close");

  function attachDrag(handle, ignoreSel) {
    let drag = null;
    let pending = null;
    let rafId = 0;
    handle.style.cursor = "move";
    handle.addEventListener("pointerdown", (e) => {
      if (ignoreSel && e.target.closest(ignoreSel)) return;
      const r = bar.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!drag) return;
      pending = [e.clientX - drag.dx, e.clientY - drag.dy];
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (pending) placeAt(pending[0], pending[1]);
      });
    });
    handle.addEventListener("pointerup", (e) => {
      if (!drag) return;
      drag = null;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      handle.releasePointerCapture(e.pointerId);
      const r = bar.getBoundingClientRect();
      save({ left: r.left, top: r.top });
    });
  }

  function placeAt(left, top) {
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    left = Math.max(4, Math.min(left, window.innerWidth - w - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - h - 4));
    bar.style.left = left + "px";
    bar.style.top = top + "px";
    bar.style.right = "auto";
    bar.style.bottom = "auto";
  }

  // --- answer panel -------------------------------------------------------
  let abortController = null;
  closeBtn.addEventListener("click", () => {
    if (abortController) abortController.abort();
    answer.hidden = true;
    output.textContent = "";
    sourcesEl.textContent = "";
    // Aborting rejects the stream, whose catch returns early without touching
    // busy — re-enable the input/submit here so the bar stays usable.
    setBusy(false);
    input.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !answer.hidden) closeBtn.click();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q || pinnedSelection) ask(q);
  });

  async function ask(question) {
    // Cancel any in-flight stream before starting a new one.
    if (abortController) abortController.abort();
    abortController = new AbortController();
    const localCtrl = abortController;

    answer.hidden = false;
    // Immediate feedback: embedding + retrieval + first-token latency is a few
    // seconds of otherwise-blank panel. Replaced by the first streamed chunk.
    output.textContent = tt("askAi.searching");
    sourcesEl.textContent = "";
    setBusy(true);

    let resp;
    try {
      resp = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          selection: pinnedSelection || undefined,
          locale: getLocale(),
        }),
        signal: localCtrl.signal,
      });
    } catch (e) {
      if (e && e.name === "AbortError") return;
      output.textContent = tt("askAi.errorReach");
      setBusy(false);
      return;
    }
    if (!resp.ok || !resp.body) {
      output.textContent = tt(
        resp.status === 429 ? "askAi.errorRate" : "askAi.errorUnavailable",
      );
      setBusy(false);
      return;
    }

    // NDJSON stream (shared parser). Mute the live region while streaming so
    // screen readers don't re-announce every partial chunk; restored below.
    output.setAttribute("aria-live", "off");
    let raw = "";
    try {
      await readAskStream(resp.body, {
        onSources: renderSources,
        // textContent (not markdown) during the stream so partial `**` stays
        // readable; re-rendered with markdownToHtml on completion.
        onChunk: (t) => {
          raw = t;
          output.textContent = t;
          output.scrollTop = output.scrollHeight;
        },
        partialError: tt("askAi.errorPartial"),
      });
    } catch (e) {
      if (e && e.name === "AbortError") return;
      output.textContent = raw || tt("askAi.errorUnavailable");
    }
    // Stream complete: swap to rendered Markdown so bold/italic/code/lists
    // display as such — and re-enable the live region so the finished answer is
    // announced once.
    output.setAttribute("aria-live", "polite");
    if (raw.trim()) output.innerHTML = markdownToHtml(raw);
    setBusy(false);
    if (abortController === localCtrl) abortController = null;
  }

  function renderSources(sources) {
    if (!Array.isArray(sources) || !sources.length) return;
    const title = document.createElement("p");
    title.className = "ask-sources-title";
    title.textContent = tt("askAi.sourcesTitle");
    title.setAttribute("data-i18n", "askAi.sourcesTitle");
    const ul = document.createElement("ul");
    for (const s of sources) {
      // Only same-origin/relative or http(s) links — never javascript:, data:, …
      if (!s || !s.url || !/^(https?:|\/)/.test(s.url)) continue;
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = s.url;
      a.textContent = s.title || s.url;
      li.appendChild(a);
      ul.appendChild(li);
    }
    sourcesEl.append(title, ul);
  }

  function setBusy(busy) {
    input.disabled = busy;
    submit.disabled = busy;
    answer.dataset.busy = busy ? "true" : "false";
    form.setAttribute("aria-busy", busy ? "true" : "false");
  }

  // --- "ask about selection" ----------------------------------------------
  chipClear.addEventListener("click", clearSelection);

  function setSelection(text) {
    pinnedSelection = text;
    chipText.textContent = text.length > 90 ? text.slice(0, 90) + "…" : text;
    chip.hidden = false;
    input.placeholder = tt("askAi.placeholderWithSelection");
    input.setAttribute("data-i18n-placeholder", "askAi.placeholderWithSelection");
  }
  function clearSelection() {
    pinnedSelection = "";
    chip.hidden = true;
    input.placeholder = tt("askAi.placeholderDefault");
    input.setAttribute("data-i18n-placeholder", "askAi.placeholderDefault");
  }

  const selBtn = document.createElement("button");
  selBtn.type = "button";
  selBtn.className = "ask-sel-btn";
  selBtn.hidden = true;
  selBtn.innerHTML =
    SPROUT +
    `<span data-i18n="askAi.selButton">${escHtml(tt("askAi.selButton"))}</span>`;
  document.body.appendChild(selBtn);

  let candidate = "";
  function selectionInfo() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const text = sel.toString().trim();
    if (text.length < 2 || text.length > 4000) return null;
    const node = sel.anchorNode;
    const elNode = node && (node.nodeType === 1 ? node : node.parentElement);
    const main = document.getElementById("main");
    if (!main || !elNode || !main.contains(elNode)) return null;
    if (elNode.closest(".ask-bar")) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { text, rect };
  }
  function showSelBtn() {
    const info = selectionInfo();
    if (!info) {
      selBtn.hidden = true;
      return;
    }
    candidate = info.text;
    selBtn.hidden = false;
    const bw = selBtn.offsetWidth;
    const bh = selBtn.offsetHeight;
    let top = info.rect.top - bh - 6;
    if (top < 4) top = info.rect.bottom + 6;
    const left = Math.max(
      4,
      Math.min(info.rect.left, window.innerWidth - bw - 4),
    );
    selBtn.style.top = top + "px";
    selBtn.style.left = left + "px";
  }
  function hideSelBtn() {
    selBtn.hidden = true;
  }

  document.addEventListener("pointerup", () =>
    requestAnimationFrame(showSelBtn),
  );
  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) hideSelBtn();
  });
  window.addEventListener("scroll", hideSelBtn, { passive: true });

  selBtn.addEventListener("mousedown", (e) => e.preventDefault());
  selBtn.addEventListener("click", () => {
    if (candidate) setSelection(candidate);
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    hideSelBtn();
    input.focus();
  });

  // --- lift the bar above the mobile on-screen keyboard ------------------
  const vv = window.visualViewport;
  if (vv) {
    const liftForKeyboard = () => {
      bar.style.transform = "";
      if (document.activeElement !== input) return;
      const overlap =
        bar.getBoundingClientRect().bottom - (vv.offsetTop + vv.height);
      if (overlap > 0) bar.style.transform = `translateY(-${overlap + 8}px)`;
    };
    vv.addEventListener("resize", liftForKeyboard);
    vv.addEventListener("scroll", liftForKeyboard);
    input.addEventListener("blur", () => {
      bar.style.transform = "";
    });
  }

  // --- persistence --------------------------------------------------------
  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch {
      return {};
    }
  }
  function save(p) {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* localStorage unavailable */
    }
  }
})();
