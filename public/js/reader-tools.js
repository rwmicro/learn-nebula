// Reading aids on a note page:
// - "Remonter": a round button bottom-right once the reader is a screen down,
//   its ring filled with how much of the note is read;
// - phones and tablets: the floating buttons at the bottom ("Étape suivante",
//   "Remonter", "Demander à l'IA") slide away while the reader scrolls down
//   and come back on the way up or at the end of the note;
// - the condensed header (mobile) shows the section being read and the time
//   left ("encore 6 min");
// - "Et ensuite ?" (lib/html.ts nextUpHtml): picks the first note of the
//   discipline this browser hasn't read yet;
// - "À lire plus tard" and the focus mode buttons of the note-actions row,
//   and its "Affichage" menu;
// - keyboard: n / p next / previous note (in the reading path, else in the
//   folder), t top, s contents, f focus mode, b bookmark, g then a home.
import { scrollProgress, loadStore, isRead } from "../../lib/reading-progress";
import { loadBookmarks, saveBookmarks, toggleBookmark, isBookmarked } from "../../lib/personal";

(function () {
  const body = document.querySelector(".article-body");
  const state = document.querySelector(".read-state[data-slug]");
  if (!body || !state) return;
  const slug = state.getAttribute("data-slug");
  const minutes = Number(state.getAttribute("data-minutes")) || 1;
  const tt = (k, v) => (window.__i18n && window.__i18n.t ? window.__i18n.t(k, v) : k);
  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const title = (document.querySelector("h1.title-note")?.textContent || slug).trim();

  function toTop() {
    window.scrollTo({ top: 0, behavior: reduce() ? "instant" : "smooth" });
    // Keyboard users land on the title, not on a button that just vanished.
    const h1 = document.querySelector("h1.title-note");
    if (h1) {
      h1.setAttribute("tabindex", "-1");
      h1.focus({ preventScroll: true });
    }
  }

  // --- back to top -----------------------------------------------------------
  const R = 17;
  const C = 2 * Math.PI * R;
  const top = document.createElement("button");
  top.type = "button";
  top.className = "to-top";
  top.hidden = true;
  top.setAttribute("aria-label", tt("toTop.aria"));
  top.setAttribute("data-i18n-aria-label", "toTop.aria");
  top.setAttribute("data-pagefind-ignore", "");
  top.innerHTML =
    `<svg viewBox="0 0 40 40" width="44" height="44" aria-hidden="true">` +
    `<circle class="to-top-track" cx="20" cy="20" r="${R}"/>` +
    `<circle class="to-top-ring" cx="20" cy="20" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}"/>` +
    `<path d="M14 22.5l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
  document.body.appendChild(top);
  const ring = top.querySelector(".to-top-ring");
  top.addEventListener("click", toTop);

  // --- condensed header: section + time left --------------------------------
  const now = document.querySelector(".note-header-now");
  const secEl = now && now.querySelector(".note-header-section");
  const leftEl = now && now.querySelector(".note-header-left");
  const heads = Array.from(body.querySelectorAll("h2[id], h3[id]"));

  function currentSection() {
    let cur = null;
    for (const h of heads) {
      if (h.getBoundingClientRect().top < 90) cur = h;
      else break;
    }
    return cur ? cur.textContent.replace(/#\s*$/, "").trim() : "";
  }

  let queued = false;
  function update() {
    queued = false;
    const r = body.getBoundingClientRect();
    const p = scrollProgress(r.top, r.height, window.innerHeight);
    top.hidden = window.scrollY < window.innerHeight * 0.9;
    ring.setAttribute("stroke-dashoffset", (C * (1 - p)).toFixed(2));
    if (now) {
      const left = Math.ceil(minutes * (1 - p));
      const sec = currentSection();
      secEl.textContent = sec;
      leftEl.textContent = left > 0 && p > 0 ? tt("condensed.left", { min: left }) : "";
      now.hidden = !sec && !leftEl.textContent;
    }
  }
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();

  // --- floating buttons tuck away while reading down (touch widths) ---------
  // A class on <html> (styled in main.css / path-step.css / global.css), so
  // the React "Demander à l'IA" pill follows without knowing about it.
  const narrow = window.matchMedia("(max-width: 900px)");
  const root = document.documentElement;
  let lastY = window.scrollY;
  let tuckQueued = false;
  function tuck() {
    tuckQueued = false;
    const y = window.scrollY;
    const dy = y - lastY;
    if (Math.abs(dy) < 6) return;
    lastY = y;
    const nearEnd = y + window.innerHeight > document.documentElement.scrollHeight - window.innerHeight * 0.6;
    root.classList.toggle("fabs-tucked", narrow.matches && dy > 0 && y > 80 && !nearEnd);
  }
  window.addEventListener(
    "scroll",
    () => {
      if (tuckQueued) return;
      tuckQueued = true;
      requestAnimationFrame(tuck);
    },
    { passive: true },
  );
  // Tabbing onto a tucked button brings the row back.
  document.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t instanceof Element && t.closest(".to-top, .path-dock, .gk-pinned-trigger")) {
      root.classList.remove("fabs-tucked");
    }
  });

  // --- "Et ensuite ?": an unread note of the discipline ---------------------
  const side = document.querySelector(".next-up-side[data-candidates]");
  function pickUnread() {
    if (!side) return;
    let list = [];
    try {
      list = JSON.parse(side.getAttribute("data-candidates") || "[]");
    } catch {
      list = [];
    }
    const skip = side.getAttribute("data-exclude");
    const store = loadStore();
    const pick = list.find(([s]) => s !== slug && s !== skip && !isRead(store, s));
    const a = side.querySelector(".next-up-unread");
    const done = side.querySelector(".next-up-done");
    if (pick) {
      a.href = `/posts/${pick[0].split("/").map(encodeURIComponent).join("/")}/`;
      a.querySelector(".next-up-title").textContent = pick[1];
      a.hidden = false;
      done.hidden = true;
    } else {
      a.hidden = true;
      // "Tout lu" only once every note of the discipline offered here, this
      // one included, is read: not when the next one is merely skipped.
      done.hidden = !(list.length > 0 && isRead(store, slug) && list.every(([s]) => isRead(store, s)));
    }
  }
  pickUnread();
  window.addEventListener("gk:reading-change", pickUnread);
  window.addEventListener("gk:progress-synced", pickUnread);

  // --- bookmark --------------------------------------------------------------
  const bm = document.querySelector(".bookmark-btn");
  function paintBookmark() {
    if (!bm) return;
    const on = isBookmarked(loadBookmarks(), slug);
    bm.hidden = false;
    bm.setAttribute("aria-pressed", on ? "true" : "false");
    const key = on ? "noteActions.bookmarked" : "noteActions.bookmark";
    const label = bm.querySelector(".bookmark-label");
    label.textContent = tt(key);
    label.setAttribute("data-i18n", key);
  }
  function toggleBm() {
    saveBookmarks(toggleBookmark(loadBookmarks(), slug, title));
    paintBookmark();
    window.dispatchEvent(new CustomEvent("gk:activity", { detail: { kind: "bookmark" } }));
  }
  if (bm) {
    bm.addEventListener("click", toggleBm);
    paintBookmark();
    window.addEventListener("gk:progress-synced", paintBookmark);
  }

  // --- focus mode ------------------------------------------------------------
  const fb = document.querySelector(".focus-btn");
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "focus-exit";
  exit.hidden = true;
  exit.textContent = tt("noteActions.focusExit");
  exit.setAttribute("data-i18n", "noteActions.focusExit");
  exit.setAttribute("data-pagefind-ignore", "");
  document.body.appendChild(exit);
  function setFocus(on) {
    document.body.dataset.focus = on ? "true" : "false";
    if (fb) fb.setAttribute("aria-pressed", on ? "true" : "false");
    exit.hidden = !on;
  }
  if (fb) {
    fb.hidden = false;
    fb.addEventListener("click", () => setFocus(document.body.dataset.focus !== "true"));
  }
  exit.addEventListener("click", () => {
    setFocus(false);
    fb?.focus();
  });

  // --- keyboard --------------------------------------------------------------
  function editable(t) {
    return (
      t instanceof Element &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest("[contenteditable]"))
    );
  }
  function overlayOpen() {
    return !!document.querySelector(
      "dialog[open], .palette:not([hidden]), .kbd-help:not([hidden]), .lightbox:not([hidden]), .hl-card:not([hidden])",
    );
  }
  function go(rel) {
    const a =
      document.querySelector(`.path-step a[rel="${rel}"]`) ||
      document.querySelector(rel === "next" ? ".sib-next" : ".sib-prev");
    if (a) a.click();
  }
  function openContents() {
    const toggle = Array.from(document.querySelectorAll(".aside-toggle")).find(
      (b) => !b.hidden && b.getClientRects().length,
    );
    if (toggle) return toggle.click();
    const link = document.querySelector(".toc-rail a, .note-aside .toc a");
    if (link) link.focus();
  }
  let gPending = 0;
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || editable(e.target)) return;
    if (e.key === "Escape" && document.body.dataset.focus === "true" && !overlayOpen()) {
      setFocus(false);
      return;
    }
    if (overlayOpen()) return;
    const k = e.key;
    if (gPending && Date.now() - gPending < 1200) {
      gPending = 0;
      if (k === "a") {
        e.preventDefault();
        location.href = "/";
      }
      return;
    }
    if (k === "g") {
      gPending = Date.now();
      return;
    }
    const act = {
      n: () => go("next"),
      p: () => go("prev"),
      t: toTop,
      s: openContents,
      f: () => setFocus(document.body.dataset.focus !== "true"),
      b: () => bm && toggleBm(),
    }[k];
    if (act) {
      e.preventDefault();
      act();
    }
  });
  // --- "Affichage ▾" (a <details>): closes on a click outside or Escape -----
  const more = document.querySelector(".note-more");
  if (more) {
    document.addEventListener("click", (e) => {
      if (more.open && e.target instanceof Node && !more.contains(e.target)) more.open = false;
    });
    more.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && more.open) {
        more.open = false;
        more.querySelector("summary")?.focus();
      }
    });
  }
})();
