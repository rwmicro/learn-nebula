// Reading progress on a note page, client-side only (localStorage, no
// account). Pure logic in lib/reading-progress.ts (unit-tested), shared with
// the home "Reprendre" card and the /themes/ and /parcours/ checkmarks.
//
// - Marks the note read when the reader reaches the end of the article body
//   (≥ 90 % on the reading-progress bar's own measure) after a minimum time
//   actually spent on the page (visible, not prerendered by the speculation rules).
// - Remembers how far an unfinished note was read; /posts/<slug>/#reprendre
//   (the home card's link) scrolls back there.
// - Fills .read-state at the end of the note (read on… / mark read / unread /
//   resume) and reveals the .read-badge in the note-actions row.
import { recordActivity } from "../../lib/personal";
import {
  CHANGE_EVENT,
  STORAGE_KEY,
  isRead,
  loadStore,
  markRead,
  markUnread,
  loadNow,
  recordProgress,
  saveNow,
  saveStore,
  savedProgress,
  scrollProgress,
  scrollTopFor,
  shouldMarkRead,
  slugFromHref,
} from "../../lib/reading-progress";

// A goal reached on a widget (public/js/widgets.js, loaded on demand and
// outside this bundle) counts as a review in the activity calendar.
document.addEventListener("gk:widget-goal", () => recordActivity("c"));

(function () {
  const body = document.querySelector(".article-body");
  const box = document.querySelector(".read-state[data-slug]");
  if (!body || !box) return;
  const slug = box.getAttribute("data-slug");
  const minutes = Number(box.getAttribute("data-minutes")) || 1;
  const badge = document.querySelector(".read-badge");
  const RESUME_HASH = "#reprendre";

  function tt(k, vars) {
    const i18n = window.__i18n;
    if (i18n && i18n.t) return i18n.t(k, vars);
    const v = i18n && k.split(".").reduce((o, p) => (o ? o[p] : undefined), i18n.bundles[i18n.defaultLocale]);
    const s = typeof v === "string" ? v : k;
    return vars ? s.replace(/\{(\w+)\}/g, (_, n) => (vars[n] != null ? String(vars[n]) : "")) : s;
  }
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function progress() {
    const r = body.getBoundingClientRect();
    return scrollProgress(r.top, r.height, window.innerHeight);
  }

  // --- dwell: time the page was actually in front of the reader ------------
  let dwell = 0;
  let since = null;
  function active() {
    return document.visibilityState === "visible" && !document.prerendering;
  }
  function tick() {
    const now = performance.now();
    if (since !== null) dwell += now - since;
    since = active() ? now : null;
  }
  document.addEventListener("visibilitychange", tick);
  document.addEventListener("prerenderingchange", tick);
  tick();

  // --- store writes ---------------------------------------------------------
  function commit(next) {
    saveStore(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    render();
  }
  let maxP = 0;
  function savePosition() {
    tick();
    const store = loadStore();
    if (isRead(store, slug)) return;
    // A glance (or a prerendered visit) is not worth a "Reprendre" card.
    if (dwell < 4000 || maxP < 0.02) return;
    saveStore(recordProgress(store, slug, progress()));
    // The tab bar's mini player (components/MobileTabBar.tsx) shows it.
    const title = box.getAttribute("data-title");
    if (title) {
      const f = box.getAttribute("data-family-name");
      saveNow({ s: slug, title, m: minutes, ...(f ? { f } : {}) });
    }
  }
  function check() {
    const p = progress();
    if (p > maxP) maxP = p;
    tick();
    if (!active()) return;
    if (shouldMarkRead(p, dwell, minutes) && !isRead(loadStore(), slug)) {
      commit(markRead(loadStore(), slug));
      if (loadNow()?.s === slug) saveNow(null);
      recordActivity("r");
      announce(tt("reading.read"));
      window.dispatchEvent(new Event("gk:note-read"));
    }
  }

  let queued = false;
  let saveTimer = 0;
  function onScroll() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        check();
      });
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePosition, 1500);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  // Short notes never scroll: re-check once the minimum dwell has passed.
  setInterval(() => {
    if (active()) check();
  }, 5000);
  window.addEventListener("pagehide", savePosition);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") savePosition();
  });

  // --- UI -------------------------------------------------------------------
  const live = document.createElement("span");
  live.className = "sr-only";
  live.setAttribute("role", "status");
  function announce(msg) {
    live.textContent = msg;
  }

  function fmtDate(sec) {
    const i18n = window.__i18n || {};
    const loc = (i18n.locale || i18n.defaultLocale || "fr").replace(/^fr$/, "fr-FR");
    try {
      return new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric" }).format(new Date(sec * 1000));
    } catch {
      return new Date(sec * 1000).toLocaleDateString();
    }
  }

  const CHECK =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function render() {
    const store = loadStore();
    const read = isRead(store, slug);
    const resume = savedProgress(store, slug);
    box.classList.toggle("is-read", read);
    if (read) {
      // Phones: "Note lue · 1 sur 2 dans Un graphique" as one card.
      const folderSlugs = (box.getAttribute("data-folder-slugs") || "").split(" ").filter(Boolean);
      const inFolder = folderSlugs.length
        ? tt("reading.inFolder", {
            n: folderSlugs.filter((s) => isRead(store, s)).length,
            total: folderSlugs.length,
            folder: box.getAttribute("data-folder") || "",
          })
        : tt("reading.readOn", { date: fmtDate(store[slug].r) });
      box.innerHTML =
        `<span class="read-state-done"><i>${CHECK}</i><span><b>${esc(tt("reading.readTitle"))}</b><small>${esc(inFolder)}</small></span></span>` +
        `<span class="read-state-label">${CHECK}${esc(tt("reading.readOn", { date: fmtDate(store[slug].r) }))}</span>` +
        `<button type="button" class="read-state-btn" data-act="unread">${esc(tt("reading.markUnread"))}</button>`;
    } else {
      box.innerHTML =
        `<button type="button" class="read-state-btn read-state-btn--primary" data-act="read">${esc(tt("reading.markRead"))}</button>` +
        (resume != null && progress() < resume - 0.05
          ? `<button type="button" class="read-state-btn" data-act="resume">${esc(tt("reading.resumeAt", { pct: Math.round(resume * 100) }))}</button>`
          : "");
    }
    box.appendChild(live);
    box.hidden = false;
    if (badge) badge.hidden = !read;
    markLinks(store);
  }

  // Checkmarks on the prerequisite / follow-up links.
  function markLinks(store) {
    document.querySelectorAll(".prereq a[href^='/posts/'], .further a[href^='/posts/']").forEach((a) => {
      const done = isRead(store, slugFromHref(a.getAttribute("href")));
      const next = a.nextElementSibling;
      const has = next && next.classList.contains("read-check");
      if (done && !has) {
        const s = document.createElement("span");
        s.className = "read-check";
        s.title = tt("reading.read");
        s.innerHTML = CHECK + `<span class="sr-only"> (${esc(tt("reading.read").toLowerCase())})</span>`;
        a.after(s);
      } else if (!done && has) next.remove();
    });
  }

  function restore() {
    const p = savedProgress(loadStore(), slug);
    if (p == null) return;
    const top = body.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: scrollTopFor(p, top, body.offsetHeight, window.innerHeight), behavior: "instant" });
  }

  box.addEventListener("click", (e) => {
    const btn = e.target instanceof Element && e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    if (act === "read") {
      const fresh = !isRead(loadStore(), slug);
      if (fresh) recordActivity("r");
      commit(markRead(loadStore(), slug));
      announce(tt("reading.read"));
      box.querySelector("[data-act]")?.focus();
      // A note of a reading path: the "Lue !" card (note-end.js) on a phone.
      if (fresh) window.dispatchEvent(new Event("gk:note-read"));
    } else if (act === "unread") {
      commit(markUnread(loadStore(), slug));
      maxP = 0;
      announce(tt("parcours.unread"));
      box.querySelector("[data-act]")?.focus();
    } else if (act === "resume") {
      restore();
    }
  });

  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY || e.key === null) render();
  });
  document.addEventListener("i18n:change", render);

  // Arrived from the home "Reprendre" card: go back to the saved position,
  // once now and again after late layout (images, fonts, math), then drop the
  // hash so a reload or a shared link starts at the top.
  if (location.hash === RESUME_HASH) {
    let moved = false;
    const stop = () => (moved = true);
    ["wheel", "touchstart", "keydown", "pointerdown"].forEach((t) =>
      window.addEventListener(t, stop, { once: true, passive: true }),
    );
    restore();
    if (document.readyState !== "complete") {
      window.addEventListener("load", () => moved || restore(), { once: true });
    }
    history.replaceState(history.state, "", location.pathname + location.search);
  }
  render();
})();
