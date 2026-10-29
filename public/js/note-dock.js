// The note's reading bar from 640px up (lib/html.ts noteDockHtml, main.css
// `.note-dock`): liquid glass floating at the bottom, its rim bending what
// scrolls under it on Chromium (lib/liquid-glass.ts). Scrolling down it
// shrinks to the progress ring, the section being read, the next note and
// the assistant; scrolling up, or near the top, it comes back whole, like the
// phone's tab bar (components/MobileTabBar.tsx). Phones have their own
// toolbar (note-app.js) and never see this one.
import { attachLens } from "../../lib/liquid-glass";
import { scrollProgress } from "../../lib/reading-progress";

(function () {
  const dock = document.querySelector(".note-dock");
  const bar = dock && dock.querySelector(".note-dock-bar");
  const body = document.querySelector(".article-body");
  if (!dock || !bar || !body) return;

  // "Demander au jardin": the floating button's own click, so the assistant
  // opens exactly as it does from there. GardenChat mounts after this
  // script, hence the wait for it.
  const ask = dock.querySelector(".dock-ask");
  const trigger = () => document.querySelector(".gk-pinned-trigger");
  if (ask) {
    const show = () => {
      ask.hidden = !trigger();
      document.documentElement.classList.toggle("has-note-dock-ask", !ask.hidden);
    };
    show();
    if (ask.hidden) {
      const mo = new MutationObserver(() => {
        show();
        if (!ask.hidden) mo.disconnect();
      });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 15000);
    }
    ask.addEventListener("click", () => {
      const t = trigger();
      if (t) t.click();
    });
  }

  // The section being read, and how far into the note.
  const fill = dock.querySelector(".dock-ring-fill");
  const sec = dock.querySelector(".dock-sec");
  const heads = Array.from(body.querySelectorAll(":scope > h2[id]"));
  const title = (document.querySelector("h1.title-note")?.textContent || "").trim();
  const headText = (h) =>
    Array.from(h.childNodes)
      .filter((n) => !(n.nodeType === 1 && n.classList.contains("anchor")))
      .map((n) => n.textContent)
      .join("")
      .trim();
  let shown = "";
  function paint() {
    const r = body.getBoundingClientRect();
    const p = scrollProgress(r.top, r.height, window.innerHeight);
    if (fill) fill.setAttribute("stroke-dashoffset", String(Math.round(100 * (1 - p))));
    let cur = null;
    // The same line as the condensed header's (reader-tools.js).
    const line = 90;
    for (const h of heads) {
      if (h.getBoundingClientRect().top <= line) cur = h;
      else break;
    }
    const text = cur ? headText(cur) : title;
    if (sec && text !== shown) {
      shown = text;
      sec.textContent = text;
    }
  }

  // Shrinks on the way down, comes back on the way up or near the top.
  const FROM = 160;
  let last = window.scrollY;
  let queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const y = window.scrollY;
      const dy = y - last;
      // Not while a menu of the bar is open: it would fold under the reader.
      const busy = bar.querySelector(".note-more[open], .translate-menu:not([hidden])");
      if (y < FROM) dock.classList.remove("is-compact");
      else if (dy > 6 && !busy) dock.classList.add("is-compact");
      else if (dy < -10) dock.classList.remove("is-compact");
      if (Math.abs(dy) > 6 || y < FROM) last = y;
      paint();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  // A tap on the shrunk bar's section brings the whole bar back.
  dock.querySelector(".dock-now")?.addEventListener("click", () => dock.classList.remove("is-compact"));
  paint();

  // The right-hand column (main.css .note-side) stays on screen while it
  // fits; a taller one (a long path card, many links) scrolls with the page
  // instead, so none of it waits behind a scrollbar of its own.
  const side = document.querySelector(".note-side");
  if (side) {
    const fit = () => {
      const fixed = getComputedStyle(side).position === "fixed";
      const tall = side.classList.contains("is-tall");
      if (!fixed && !tall) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 15;
      const h = tall ? side.offsetHeight : side.scrollHeight;
      side.classList.toggle("is-tall", h > window.innerHeight - 8.5 * rem);
    };
    fit();
    window.addEventListener("resize", fit, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(fit).observe(side);
  }

  // Phones never show the bar: only give it a lens where it is visible.
  const wide = matchMedia("(min-width: 640px)");
  let detach = null;
  const lens = () => {
    if (wide.matches && !detach) detach = attachLens(bar, { depth: 24, chroma: 0.12 });
    else if (!wide.matches && detach) {
      detach();
      detach = null;
    }
  };
  lens();
  wide.addEventListener("change", lens);
})();
