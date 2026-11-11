// The note's reading bar from 640px up (lib/html.ts noteDockHtml, main.css
// `.note-dock`): liquid glass floating at the bottom, its rim bending what
// scrolls under it on Chromium (lib/liquid-glass.ts). One bar, the same
// whichever way the reader scrolls: contents, the progress ring and the
// section being read, the reading tools, the next note and the assistant.
// Phones have their own toolbar (note-app.js) and never see this one.
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
  // Every scroll frame: measures first, then only the writes that change
  // something (see reader-tools.js), so the long note is laid out once.
  let shown = "";
  let dashAt = "";
  function paint() {
    const r = body.getBoundingClientRect();
    const p = scrollProgress(r.top, r.height, window.innerHeight);
    let cur = null;
    // The same line as the condensed header's (reader-tools.js).
    const line = 90;
    for (const h of heads) {
      if (h.getBoundingClientRect().top <= line) cur = h;
      else break;
    }
    const dash = String(Math.round(100 * (1 - p)));
    if (fill && dash !== dashAt) fill.setAttribute("stroke-dashoffset", (dashAt = dash));
    const text = cur ? headText(cur) : title;
    if (sec && text !== shown) {
      shown = text;
      sec.textContent = text;
    }
  }

  // The ring and the section follow the reading, once per frame.
  let queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      paint();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
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

  // One bubble over the bar that glides from control to control instead of a
  // tooltip per button: the name of a control that shows only an icon, and
  // its key (the "?" help's). It waits a moment before the first one, then
  // follows at once, and lingers 300 ms after the pointer leaves the bar so
  // crossing a gap doesn't make it blink. Hidden while a menu is open.
  const isMac = /Mac|iP(hone|ad|od)/.test(
    navigator.platform || navigator.userAgent,
  );
  const KEYS = {
    "dock-toc": "S",
    "bookmark-btn": "B",
    "lesson-btn": "L",
    "dock-next": "N",
    "dock-ask": (isMac ? "⌘" : "Ctrl") + " J",
  };
  const tip = document.createElement("span");
  tip.className = "dock-tip";
  tip.setAttribute("aria-hidden", "true");
  tip.innerHTML = `<span class="dock-tip-tx"></span><kbd></kbd>`;
  dock.appendChild(tip);
  const tipTx = tip.querySelector(".dock-tip-tx");
  const tipKey = tip.querySelector("kbd");
  // The bubble replaces the browser's own tooltip on these.
  for (const el of bar.querySelectorAll(
    ".dock-next[title], .bookmark-btn[title]",
  )) {
    el.dataset.tip = el.getAttribute("title");
    el.removeAttribute("title");
  }
  const keyOf = (el) => {
    for (const c in KEYS) if (el.classList.contains(c)) return KEYS[c];
    return "";
  };
  const nameOf = (el) => {
    const showsText = Array.from(el.querySelectorAll("span")).some(
      (sp) =>
        sp.offsetWidth > 0 &&
        sp.textContent.trim() &&
        !sp.classList.contains("bookmark-label"),
    );
    if (showsText) return "";
    const hidden = el.querySelector(".bookmark-label");
    if (hidden && hidden.textContent.trim()) return hidden.textContent.trim();
    const aria = el.getAttribute("aria-label") || "";
    return el.dataset.tip && el.dataset.tip !== aria
      ? aria
        ? `${aria} · ${el.dataset.tip}`
        : el.dataset.tip
      : aria;
  };
  let tipOn = false;
  let tipWait = 0;
  let tipLeave = 0;
  function showTip(el) {
    clearTimeout(tipLeave);
    if (bar.querySelector(".note-more[open]")) return hideTip(true);
    const name = nameOf(el);
    const key = keyOf(el);
    if (!name && !key) return hideTip(true);
    const place = () => {
      tipTx.textContent = name;
      tipTx.hidden = !name;
      tipKey.textContent = key;
      tipKey.hidden = !key;
      const d = dock.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      tip.style.left = `${r.left + r.width / 2 - d.left}px`;
      if (!tipOn) {
        // The first one appears in place, the next ones glide.
        tip.classList.add("is-still");
        void tip.offsetWidth;
        tip.classList.remove("is-still");
      }
      tip.classList.add("is-on");
      tipOn = true;
    };
    clearTimeout(tipWait);
    if (tipOn) place();
    else tipWait = setTimeout(place, 350);
  }
  function hideTip(now) {
    clearTimeout(tipWait);
    clearTimeout(tipLeave);
    const off = () => {
      tip.classList.remove("is-on");
      tipOn = false;
    };
    if (now === true) off();
    else tipLeave = setTimeout(off, 300);
  }
  const hover = matchMedia("(hover: hover)");
  for (const el of bar.querySelectorAll("button, a, summary")) {
    if (el.classList.contains("dock-now")) continue;
    el.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse" && hover.matches) showTip(el);
    });
    el.addEventListener("focus", () => {
      if (el.matches(":focus-visible")) showTip(el);
    });
    el.addEventListener("blur", () => hideTip());
    el.addEventListener("click", () => hideTip(true));
  }
  bar.addEventListener("pointerleave", () => hideTip());
  bar.addEventListener("toggle", () => hideTip(true), true);

  // Phones never show the bar: only give it a lens where it is visible.
  const wide = matchMedia("(min-width: 640px)");
  let detach = null;
  const lens = () => {
    if (wide.matches && !detach) detach = attachLens(bar, { depth: 30, chroma: 0.12 });
    else if (!wide.matches && detach) {
      detach();
      detach = null;
    }
  };
  lens();
  wide.addEventListener("change", lens);
})();
